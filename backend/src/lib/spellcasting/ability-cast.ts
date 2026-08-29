// Import direction stays one-way: spellcasting -> ability-cast -> {ability-cost, effects, spell-state, hitpoints, events}.

import { Prisma } from "@/generated/prisma/client.js";
import { payAbilityCostInTx, type AbilityCost, type PayCostContext, type SlotCostSubject } from "./ability-cost.js";
import { appendActiveBuffInTx } from "@/lib/combat/active-effects.js";
import { clearBuffsForSourceInTx } from "@/lib/combat/buff-end.js";
import { assertCampaignMembership } from "@/lib/auth/access.js";
import { AuthorizationError } from "@/lib/auth/errors.js";
import { resolveBuffSpec, type EffectSpec } from "@/lib/combat/effects.js";
import { logEvent, type EventType } from "@/lib/activity/events.js";
import { applyHealInTx, applyDamageInTx, applyTempHpInTx } from "@/lib/combat/hitpoints.js";
import type { ConcentrationState, SpellcastingMutableState } from "./spell-state.js";
import type { ClearOnTrigger } from "@/lib/classes/class-feature-rows.js";

export type CastTarget = "self" | { characterId: string };

// A future buffTarget needing an equip-driven true-end is one more entry here, not a new case in equipClearTriggers.
const BUFF_TARGET_CLEAR_ON: Partial<Record<string, ClearOnTrigger[]>> = {
  acUnarmoredBase: ["equipBodyArmor"],
};

export interface OpOutcome {
  eventType: string;
  summary: string;
  eventData: Record<string, unknown>;
  // Extra state snapshotted for undo beyond the domain JSON — e.g. item-spell casts' spent InventoryCapability.used counter (#580).
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
  // Required only for party-target heals (#462) — the caster must be a member of the target's campaign.
  casterUserId?: string;
  casterName?: string;
  casterCampaignId?: string | null;
}

export interface CastAbilityInput {
  name: string;
  entryId: string;
  cost: AbilityCost;
  effect: EffectSpec; // The client roll is trusted, never bound-checked (#406).
  requested?: number;
  roll: number;
  eventType: EventType;
  concentrates: boolean;
  apply?: { target: CastTarget; kind: "heal" | "damage" | "tempHp"; amount: number };
  costSubject?: SlotCostSubject;
}

// Byte-load-bearing: reproduces applyCastSpellOp's existing summary text exactly.
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

async function handleConcentrationOnCast(ctx: CastAbilityContext, next: ConcentrationState): Promise<void> {
  const host = ctx.concentrationHost;
  const prior = host.concentratingOn;
  if (prior && prior.entryId !== next.entryId) {
    // #1849: snapshot ONLY concentratingOn — payAbilityCostInTx already spent the slot, so a full-state snapshot here would clobber the LIFO slot refund on revert.
    const dropBefore = { spellcasting: { concentratingOn: { ...prior } } };
    // No intermediate DB write — the caller's write-back persists this along with the new concentration spell.
    host.concentratingOn = null;
    await clearBuffsForSourceInTx(ctx.tx, ctx.characterId, prior.entryId, ctx.batchId, ctx.sessionId, "newCast");
    await logEvent(ctx.tx, {
      characterId: ctx.characterId,
      category: "spellcasting",
      type: "concentrationDropped",
      summary: `Concentration on ${prior.spellName} dropped (cast ${next.spellName})`,
      before: dropBefore,
      after: { spellcasting: { concentratingOn: null } },
      data: { droppedEntryId: prior.entryId, droppedSpellName: prior.spellName, reason: "newCast", castEntryId: next.entryId },
      batchId: ctx.batchId,
      sessionId: ctx.sessionId,
    });
  }
  host.concentratingOn = { entryId: next.entryId, spellName: next.spellName };
}

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

// Guards: caster must share the target's campaign and the target must have opted in via autoFriendlyHealing; the event is written on the TARGET so it's theirs to undo (#462).
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

export async function castAbilityInTx(ctx: CastAbilityContext, input: CastAbilityInput): Promise<OpOutcome> {
  const paid = await payAbilityCostInTx(ctx.cost, input.cost, input.requested, input.costSubject);
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
  // A non-concentration buff (e.g. Mage Armor, #363) persists as while-active until dismissed, a long rest, or a true-end hook clears it.
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
        ...(BUFF_TARGET_CLEAR_ON[buff.target] ? { clearOn: BUFF_TARGET_CLEAR_ON[buff.target] } : {}),
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
