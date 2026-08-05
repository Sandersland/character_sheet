/**
 * Warrior of Shadow / Way of Shadow cast handlers — two focus/ki-fuelled
 * abilities live here, both edition-aware since #1502:
 *
 *   castShadowArt          — the L3 Shadow Arts feature's cast. A
 *                             GrantedAbility row (source "shadowArts") read
 *                             from the catalog, routed through castAbilityInTx
 *                             like a Channel Divinity cast. 2024 (Warrior of
 *                             Shadow, PHB'24 p.91, #1246): exactly one cast,
 *                             1 focus, Darkness, always concentrates. 2014
 *                             (Way of Shadow, PHB'14 pp.79-80 — not in SRD
 *                             5.1, #1502): a 4-spell 2-ki menu (Darkness/
 *                             Darkvision/Pass without Trace/Silence); only
 *                             Darkness/Pass without Trace/Silence concentrate
 *                             (Darkvision does not) — see
 *                             shadowArtEffectSpec's name-keyed concentrates.
 *                             Every field (cost pool/amount, concentration)
 *                             is read from the catalog row itself, so this
 *                             function needs no `edition` branch of its own.
 *   activateCloakOfShadows — the Cloak of Shadows feature: self-apply the
 *                             invisible condition. No catalog row (a single
 *                             fixed feature, not a "choose one" menu), so its
 *                             cost/effect are hardcoded here — edition-
 *                             branched, since the 2014 and 2024 shapes
 *                             genuinely diverge (2014, L11: action only, no
 *                             ki cost, no duration cap beyond "until you
 *                             attack, cast a spell, or are in bright light";
 *                             2024, L17: 3 focus, 1 minute, frees Flurry of
 *                             Blows while it lasts).
 *
 * Both level gates (3/17 for 2024, 3/6/11/17 for 2014) live as DERIVED_ACTIONS
 * rows (actions.ts) — this file never hardcodes a level, only reads whether
 * the entry-scoped action key is present.
 */

import type { CastShadowArtOperation, ShadowArtOperation } from "@character-sheet/contracts";

import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import { readAbilityCost, type AbilityCost, type PayCostContext } from "@/lib/spellcasting/ability-cost.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { levelForExperience } from "@/lib/leveling/experience.js";
import { editionOf } from "@/lib/rules/edition.js";
import { crossEditionRejection } from "@/lib/rules/catalog-edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";
import { deriveEntryScopedActions } from "./actions.js";
import { catalogEffectSpec, type EffectSpec } from "@/lib/combat/effects.js";
import { normalizeSpellcastingMutable, snapshotSpellcasting } from "@/lib/spellcasting/spell-state.js";
import { applyConditionInTx } from "@/lib/combat/conditions.js";
import { logEvent } from "@/lib/activity/events.js";
import { FOCUS_CAST_CHARACTER_SELECT, emitFocusCastEvents } from "./focus-cast.js";
import type { Prisma } from "@/generated/prisma/client.js";

export class InvalidShadowArtOperationError extends Error {}

// Prefix stamped on a Shadow Art's concentration entryId so its id space never overlaps a spellbook Spell.id.
export const SHADOW_ART_CONCENTRATION_PREFIX = "shadow-art:";

// Cloak of Shadows carries no GrantedAbility catalog row (a single fixed
// feature, not a "choose one" menu like Shadow Arts) — its cost/effect/entryId
// are fixed constants rather than read from the DB. 2024's cost (PHB'24 p.91);
// 2014 costs nothing (PHB'14 p.80, "no ki cost, no duration cap") — expressed
// via AbilityCost's existing `{kind:"none"}` variant, not a fake 0-base pool
// spend, so payAbilityCostInTx's `case "none"` short-circuit (no
// applySpendResourceInTx call at all) does the right thing for free.
const CLOAK_OF_SHADOWS_NAME = "Cloak of Shadows";
const CLOAK_OF_SHADOWS_ENTRY_ID = "cloak-of-shadows";
// Narrowed to the "pool" variant (not the bare AbilityCost union) so `.base` is
// accessible below without a runtime kind check — this constant is always a pool cost.
const CLOAK_OF_SHADOWS_2024_COST: Extract<AbilityCost, { kind: "pool" }> = { kind: "pool", key: "focus", base: 3 };
const CLOAK_OF_SHADOWS_2014_COST: Extract<AbilityCost, { kind: "none" }> = { kind: "none" };
const CLOAK_OF_SHADOWS_EFFECT: EffectSpec = {
  effectType: "utility",
  damageType: null,
  attackType: null,
  saveAbility: null,
  saveEffect: null,
  scaling: { mode: "none" },
  concentration: false,
};

// Catalog columns needed to build a Shadow Art cast's flat EffectSpec.
export interface ShadowArtEffectRow {
  name: string;
  effectKind?: string | null;
  buffTarget?: string | null;
  buffModifier?: number | null;
}

// The one 2014 Shadow Art that does NOT concentrate — Darkvision (PHB'14: "Duration:
// 8 hours", no "Concentration" prefix), unlike Darkness/Pass without Trace/Silence
// (all "Duration: Concentration, up to ..."). 2024's sole row ("Shadow Arts:
// Darkness") is untouched by this set. Name-keyed rather than edition-keyed: the
// same predicate is correct for both editions without this function ever taking
// an `edition` parameter, since only ONE name in the whole catalog is exempt.
const SHADOW_ARTS_NO_CONCENTRATION = new Set(["Shadow Arts: Darkvision"]);

/**
 * Build a Shadow Art cast's EffectSpec via the shared catalogEffectSpec builder:
 * flat (scaling.mode "none"); concentrates unless the row's name is in
 * SHADOW_ARTS_NO_CONCENTRATION above. Kept on the shared row→spec mapping
 * (lib/combat/effects.ts, #817) rather than inlined, since the same builder also
 * serves Channel Divinity.
 */
export function shadowArtEffectSpec(row: ShadowArtEffectRow): EffectSpec {
  return catalogEffectSpec(row, {
    scaling: { mode: "none" },
    concentrates: (name) => !SHADOW_ARTS_NO_CONCENTRATION.has(name),
  });
}

// Resolve + validate the Shadow Arts Darkness cast, cast it, and log the shared
// focus-cast audit tail. Split out of applyOp to keep that callback's
// complexity budget for the two-operation dispatch.
async function applyCastShadowArt(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: CastShadowArtOperation,
  batchId: string,
  sessionId: string | null,
  row: { spellcasting: Prisma.JsonValue; rulesEdition: RulesEdition },
): Promise<void> {
  const catalog = await tx.grantedAbility.findUnique({ where: { id: op.shadowArtId } });
  if (!catalog || catalog.source !== "shadowArts") {
    throw new InvalidShadowArtOperationError(`Shadow Art not found in catalog: ${op.shadowArtId}`);
  }

  // Transient cast, not a permanent snapshot — still a wrong-edition rule
  // applied to one cast and recorded in the audit event (#1345, found by
  // this plan's audit, not named in the issue).
  const mismatch = crossEditionRejection(catalog, `Shadow Art "${catalog.name}"`, editionOf(row));
  if (mismatch) throw new InvalidShadowArtOperationError(mismatch);

  const cost = readAbilityCost(catalog);
  if (cost.kind !== "pool") {
    throw new InvalidShadowArtOperationError(`${catalog.name} has no focus cost`);
  }

  const effect = shadowArtEffectSpec(catalog);
  const concentrates = effect.concentration ?? false;

  const spellState = normalizeSpellcastingMutable(row.spellcasting);
  const beforeSpell = snapshotSpellcasting(spellState);

  const costCtx: PayCostContext = { tx, characterId, batchId, sessionId };
  const outcome = await castAbilityInTx(
    { tx, characterId, batchId, sessionId, cost: costCtx, concentrationHost: spellState },
    {
      name: catalog.name,
      entryId: `${SHADOW_ART_CONCENTRATION_PREFIX}${catalog.id}`,
      cost,
      effect,
      requested: cost.base, // flat 1 focus, no scaling
      roll: 0,
      eventType: "castShadowArt",
      concentrates,
    },
  );

  // Shared focus-cast audit tail: when concentrating, persist the write-back +
  // log the undoable spellcasting event (restores concentratingOn on revert).
  // The resources cast record restores nothing (focus refunded by the pool
  // payer's spendResource event, concentration by the event above).
  //
  // The spend field name is keyed off `cost.key` (the catalog row's own
  // costPoolKey, "ki" or "focus"), not hardcoded — a 2014 Way of Shadow cast
  // spends ki, and a hardcoded `focusSpent` would mislabel that spend in the
  // persisted CharacterEvent.data column (the human-readable `resourceSummary`
  // already says "Ki Points" via the shared spendResource summary; this is
  // the structured half).
  await emitFocusCastEvents(tx, {
    characterId,
    batchId,
    sessionId,
    eventType: "castShadowArt",
    concentrates,
    spellState,
    beforeSpell,
    concentrationName: catalog.name,
    concentrationData: { shadowArtId: catalog.id, shadowArtName: catalog.name },
    resourceSummary: outcome.summary,
    resourceData: { shadowArtId: catalog.id, [`${cost.key}Spent`]: cost.base },
  });
}

// Pay Cloak of Shadows' cost (3 focus in 2024, nothing in 2014 — see the
// constants above), self-apply invisible, and log the combined result. No
// concentration (it ends manually on attack/cast/bright light, matching the
// 2014 text exactly and mirroring the 2024 rewrite), so this skips
// emitFocusCastEvents' concentration branch and instead mirrors
// applyChannelDivinityOperations' invisible-kind tail.
async function applyActivateCloakOfShadows(
  tx: Prisma.TransactionClient,
  characterId: string,
  batchId: string,
  sessionId: string | null,
  row: { spellcasting: Prisma.JsonValue; rulesEdition: RulesEdition },
): Promise<void> {
  const cost = editionOf(row) === "EDITION_2014" ? CLOAK_OF_SHADOWS_2014_COST : CLOAK_OF_SHADOWS_2024_COST;
  const spellState = normalizeSpellcastingMutable(row.spellcasting);
  const costCtx: PayCostContext = { tx, characterId, batchId, sessionId };
  const outcome = await castAbilityInTx(
    { tx, characterId, batchId, sessionId, cost: costCtx, concentrationHost: spellState },
    {
      name: CLOAK_OF_SHADOWS_NAME,
      entryId: CLOAK_OF_SHADOWS_ENTRY_ID,
      cost,
      effect: CLOAK_OF_SHADOWS_EFFECT,
      requested: cost.kind === "pool" ? cost.base : undefined,
      roll: 0,
      eventType: "castShadowArt",
      concentrates: false,
    },
  );

  await applyConditionInTx(tx, characterId, "invisible", CLOAK_OF_SHADOWS_NAME, batchId, sessionId);

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "castShadowArt",
    summary: outcome.summary,
    data: { focusSpent: cost.kind === "pool" ? cost.base : 0 },
    batchId,
    sessionId,
  });
}

/**
 * Applies a batch of Shadow Arts operations atomically. Mirrors
 * applyManeuverOperations: one batchId, LIFO-undoable events, state re-read
 * per op. Per cast: the pool payer logs its own spendResource event (refunds
 * focus on revert); a concentration Shadow Art logs a spellcasting-category event
 * (restores concentratingOn on revert); the resources-category castShadowArt
 * event records the cast.
 */
export async function applyShadowArtsOperations(
  characterId: string,
  operations: ShadowArtOperation[],
): Promise<void> {
  await runCharacterTransaction(characterId, operations, {
    select: FOCUS_CAST_CHARACTER_SELECT,
    notFound: (id) => new InvalidShadowArtOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, row, op, batchId, sessionId }) => {
      // The shadowArts/cloakOfShadows gate is entry-scoped (#1206) — it keys off
      // the MONK entry's own level, so a secondary Warrior of Shadow monk gates
      // correctly even when another class is primary. Resolved through the SAME
      // deriveEntryScopedActions the wire's availableActions[] uses (#1315) —
      // never a second copy of the level gate. Passes pools:[] deliberately:
      // this guard only reads `.key` presence (the class/subclass/level gate),
      // never `.enabled` — real focus sufficiency is enforced by castAbilityInTx
      // below. Passing [] means every resource-gated row here comes back
      // enabled:false, so a future `.some(a => a.key === X && a.enabled)` check
      // would wrongly reject every cast; if that's ever needed, pass the real
      // pools instead of widening this comment.
      const level = levelForExperience(row.experiencePoints);
      const edition = editionOf(row);
      const actions = deriveEntryScopedActions(row.classEntries, level, [], true, edition);
      // Error text names the edition-correct subclass and level — 2014's Way
      // of Shadow gates Cloak of Shadows at L11, not 2024's L17 (PHB'14 p.80
      // vs PHB'24 p.91); Shadow Arts gates at L3 in both.
      const subclassLabel = edition === "EDITION_2014" ? "Way of Shadow" : "Warrior of Shadow";

      if (op.type === "activateCloakOfShadows") {
        if (!actions.some((a) => a.key === "cloakOfShadows")) {
          const gateLevel = edition === "EDITION_2014" ? 11 : 17;
          throw new InvalidShadowArtOperationError(
            `Only a ${subclassLabel} monk (level ${gateLevel}+) can use Cloak of Shadows`,
          );
        }
        await applyActivateCloakOfShadows(tx, characterId, batchId, sessionId, row);
        return;
      }

      if (!actions.some((a) => a.key === "shadowArts")) {
        throw new InvalidShadowArtOperationError(
          `Only a ${subclassLabel} monk (level 3+) can cast Shadow Arts spells`,
        );
      }
      await applyCastShadowArt(tx, characterId, op, batchId, sessionId, row);
    },
  });
}
