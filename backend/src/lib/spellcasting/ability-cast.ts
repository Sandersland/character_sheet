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

import { Prisma } from "@/generated/prisma/client.js";
import { payAbilityCostInTx, type AbilityCost, type PayCostContext } from "./ability-cost.js";
import { appendActiveBuffInTx, clearBuffsForSourceInTx } from "@/lib/combat/active-effects.js";
import { assertCampaignMembership } from "@/lib/auth/access.js";
import { AuthorizationError } from "@/lib/auth/errors.js";
import { resolveBuffSpec, type EffectSpec } from "@/lib/combat/effects.js";
import { logEvent, type EventType } from "@/lib/events.js";
import { applyHealInTx, applyDamageInTx, applyTempHpInTx } from "@/lib/combat/hitpoints.js";
import type { ConcentrationState, SpellcastingMutableState } from "./spell-state.js";

/** A cast's effect target: the caster themselves, or a consenting ally's sheet (#462). */
export type CastTarget = "self" | { characterId: string };

// The per-op result the dispatcher logs (before/after snapshots + logEvent).
export interface OpOutcome {
  eventType: string;
  summary: string;
  eventData: Record<string, unknown>;
  // Extra sub-state folded into the logged event's before/after snapshots beyond
  // the domain JSON the dispatcher captures. Item-spell casts use this to snapshot
  // the spent InventoryCapability.used counter (#580) so undo can restore it.
  beforeExtra?: Record<string, unknown>;
  afterExtra?: Record<string, unknown>;
}

export interface CastAbilityContext {
  tx: Prisma.TransactionClient;
  characterId: string;
  batchId: string;
  sessionId: string | null;
  cost: PayCostContext;
  concentrationHost: SpellcastingMutableState;
  // Caster identity — required only for party-target heals (#462); the caster
  // must be a member of the target's campaign, and their name attributes the
  // cross-sheet heal event.
  casterUserId?: string;
  casterName?: string;
  casterCampaignId?: string | null;
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
  apply?: { target: CastTarget; kind: "heal" | "damage" | "tempHp"; amount: number };
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
  apply: { kind: "heal" | "damage" | "tempHp"; amount: number },
): Promise<void> {
  if (apply.kind === "heal") {
    await applyHealInTx(ctx.tx, ctx.characterId, apply.amount, ctx.batchId, ctx.sessionId);
  } else if (apply.kind === "tempHp") {
    await applyTempHpInTx(ctx.tx, ctx.characterId, apply.amount, ctx.batchId, ctx.sessionId);
  } else {
    await applyDamageInTx(ctx.tx, ctx.characterId, apply.amount, ctx.batchId, ctx.sessionId);
  }
}

// Apply a rolled heal to a consenting ally's sheet in the same batch (#462).
// Guards: healing only, caster is a member of the target's (shared) campaign,
// and the target has opted in via autoFriendlyHealing. The heal event is written
// on the TARGET (actor "player", source = caster's name) so it's theirs to undo.
async function applyPartyHealInTx(
  ctx: CastAbilityContext,
  targetId: string,
  kind: "heal" | "damage" | "tempHp",
  amount: number,
): Promise<void> {
  if (kind !== "heal") {
    throw new AuthorizationError("Only healing can be applied to an ally's sheet");
  }
  if (!ctx.casterUserId) {
    throw new AuthorizationError("Caster identity is required to heal an ally");
  }
  const target = await ctx.tx.character.findUnique({
    where: { id: targetId },
    select: { id: true, campaignId: true },
  });
  if (!target?.campaignId || target.campaignId !== ctx.casterCampaignId) {
    throw new AuthorizationError("Target does not share your campaign");
  }
  await assertCampaignMembership(ctx.tx, ctx.casterUserId, target.campaignId, "edit");
  const pref = await ctx.tx.campaignCharacterPreference.findUnique({
    where: { campaignId_characterId: { campaignId: target.campaignId, characterId: targetId } },
    select: { autoFriendlyHealing: true },
  });
  if (!pref?.autoFriendlyHealing) {
    throw new AuthorizationError("This ally has not opted in to party healing");
  }
  await applyHealInTx(ctx.tx, targetId, amount, ctx.batchId, ctx.sessionId, { source: ctx.casterName });
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
  // Seed a self-buff from the effect. A concentration cast's buff rides the
  // concentration host (drops when it breaks); a non-concentration buff spell
  // (e.g. Mage Armor, 8h ≈ a while-active toggle, #363) persists as `while-active`
  // until dismissed, a long rest, or a true-end hook clears it.
  const buff = resolveBuffSpec(input.effect);
  if (buff) {
    await appendActiveBuffInTx(
      ctx.tx,
      ctx.characterId,
      {
        key: input.entryId,
        target: buff.target,
        modifier: buff.modifier,
        source: input.name,
        sourceEntryId: input.entryId,
        duration: input.concentrates ? "concentration" : "while-active",
      },
      ctx.batchId,
      ctx.sessionId,
    );
  }
  if (input.apply && input.apply.amount > 0) {
    if (input.apply.target === "self") {
      await applySelfEffectInTx(ctx, input.apply);
    } else {
      await applyPartyHealInTx(ctx, input.apply.target.characterId, input.apply.kind, input.apply.amount);
    }
  }

  return { eventType: input.eventType, summary, eventData };
}
