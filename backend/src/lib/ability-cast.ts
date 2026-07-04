/**
 * Shared caster for activated abilities — one sequence behind castSpell and any
 * future castDiscipline: pay-cost → build summary → concentration → self-apply.
 *
 * Concentration drop-on-cast and self-apply are lifted here as character-wide
 * helpers operating on the mutable state's `concentratingOn`, not on a
 * SpellEntry — so a non-spellcaster ability can hold/displace concentration too.
 * Import direction stays one-way: spellcasting → ability-cast →
 * {ability-cost, effects, spell-state, hitpoints, events}.
 */

import { Prisma } from "../generated/prisma/client.js";
import { payAbilityCostInTx, type AbilityCost, type PayCostContext } from "./ability-cost.js";
import { appendActiveBuffInTx, clearBuffsForSourceInTx } from "./active-effects.js";
import { resolveBuffSpec, type EffectSpec } from "./effects.js";
import { logEvent, type EventType } from "./events.js";
import { applyHealInTx, applyDamageInTx } from "./hitpoints.js";
import type { ConcentrationState, SpellcastingMutableState } from "./spell-state.js";

// The per-op result the dispatcher logs (before/after snapshots + logEvent).
export interface OpOutcome {
  eventType: string;
  summary: string;
  eventData: Record<string, unknown>;
}

export interface CastAbilityContext {
  tx: Prisma.TransactionClient;
  characterId: string;
  batchId: string;
  sessionId: string | null;
  cost: PayCostContext;
  concentrationHost: SpellcastingMutableState;
}

export interface CastAbilityInput {
  name: string;
  entryId: string;
  cost: AbilityCost;
  effect: EffectSpec; // effect shapes the summary; the client roll is trusted, never bound-checked (#406)
  requested?: number;
  roll: number;
  eventType: EventType;
  concentrates: boolean;
  apply?: { target: "self"; kind: "heal" | "damage"; amount: number };
}

// Byte-load-bearing: reproduces the current castSpell summary exactly.
function buildCastSummary(name: string, label: string, effect: EffectSpec, roll: number): string {
  let s = `Cast ${name}`;
  if (label) s += ` (${label})`;
  if ((effect.effectType === "damage" || effect.effectType === "heal") && roll > 0) {
    const dt = effect.damageType ? ` ${effect.damageType}` : "";
    const kind = effect.effectType === "heal" ? "healing" : "damage";
    s += `: ${roll}${dt} ${kind}`;
  }
  return s;
}

// Log + clear a displaced prior concentration, then set the new one. Entry-agnostic:
// operates on the mutable state's `concentratingOn`, never on a SpellEntry.
async function handleConcentrationOnCast(ctx: CastAbilityContext, next: ConcentrationState): Promise<void> {
  const host = ctx.concentrationHost;
  const prior = host.concentratingOn;
  if (prior && prior.entryId !== next.entryId) {
    const dropBefore = {
      spellcasting: {
        slotsUsed: { ...host.slotsUsed },
        arcanumUsed: { ...host.arcanumUsed },
        spells: [...host.spells],
        concentratingOn: { ...prior },
      },
    };
    // No intermediate DB write: the caller's common write-back persists the final
    // state (with the new concentration spell), so clearing the in-memory flag is
    // enough for this drop event's before/after payloads.
    host.concentratingOn = null;
    // The displaced concentration also drops any buffs it was maintaining.
    await clearBuffsForSourceInTx(ctx.tx, ctx.characterId, prior.entryId, ctx.batchId, ctx.sessionId, "newCast");
    await logEvent(ctx.tx, {
      characterId: ctx.characterId,
      category: "spellcasting",
      type: "concentrationDropped",
      summary: `Concentration on ${prior.spellName} dropped (cast ${next.spellName})`,
      before: dropBefore,
      after: {
        spellcasting: {
          slotsUsed: { ...host.slotsUsed },
          arcanumUsed: { ...host.arcanumUsed },
          spells: [...host.spells],
          concentratingOn: null,
        },
      },
      data: { droppedEntryId: prior.entryId, droppedSpellName: prior.spellName, reason: "newCast", castEntryId: next.entryId },
      batchId: ctx.batchId,
      sessionId: ctx.sessionId,
    });
  }
  host.concentratingOn = { entryId: next.entryId, spellName: next.spellName };
}

// Apply a self-targeted rolled effect to the caster's own HP in the same batch.
async function applySelfEffectInTx(
  ctx: CastAbilityContext,
  apply: { kind: "heal" | "damage"; amount: number },
): Promise<void> {
  if (apply.kind === "heal") {
    await applyHealInTx(ctx.tx, ctx.characterId, apply.amount, ctx.batchId, ctx.sessionId);
  } else {
    await applyDamageInTx(ctx.tx, ctx.characterId, apply.amount, ctx.batchId, ctx.sessionId);
  }
}

// The one shared cast sequence. Returns the OpOutcome the dispatcher logs.
export async function castAbilityInTx(ctx: CastAbilityContext, input: CastAbilityInput): Promise<OpOutcome> {
  const paid = await payAbilityCostInTx(ctx.cost, input.cost, input.requested);
  const summary = buildCastSummary(input.name, paid.label, input.effect, input.roll);
  const slotLevel = input.cost.kind === "slot" ? (input.requested ?? input.cost.minLevel) : null;
  const eventData: Record<string, unknown> = {
    entryId: input.entryId,
    spellName: input.name,
    roll: input.roll,
    slotLevel,
  };

  if (input.concentrates) {
    await handleConcentrationOnCast(ctx, { entryId: input.entryId, spellName: input.name });
  }
  // A buff effect appends a tracked passive modifier tagged with the casting
  // entry id, so it clears when this ability's concentration ends. Generic:
  // any activated ability whose effect resolves to a buff seeds activeEffects.
  const buff = resolveBuffSpec(input.effect);
  if (buff) {
    await appendActiveBuffInTx(
      ctx.tx,
      ctx.characterId,
      { key: input.entryId, target: buff.target, modifier: buff.modifier, source: input.name, sourceEntryId: input.entryId },
      ctx.batchId,
      ctx.sessionId,
    );
  }
  if (input.apply?.target === "self" && input.apply.amount > 0) {
    await applySelfEffectInTx(ctx, input.apply);
  }

  return { eventType: input.eventType, summary, eventData };
}
