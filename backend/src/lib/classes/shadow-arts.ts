/**
 * Warrior of Shadow cast handlers (#1246, 2024 rewrite of the former #441 Way of
 * Shadow) — two focus-fuelled abilities live here:
 *
 *   castShadowArt          — the L3 Shadow Arts feature's 1-focus Darkness cast.
 *                             A GrantedAbility row (source "shadowArts") read from
 *                             the catalog, routed through castAbilityInTx like a
 *                             discipline/Channel Divinity cast.
 *   activateCloakOfShadows — the L17 Cloak of Shadows feature: spend 3 focus,
 *                             self-apply the invisible condition. No catalog row
 *                             (a single fixed feature, not a "choose one" menu),
 *                             so its cost/effect are hardcoded here.
 *
 * The 2014 model (flat 2-focus cost, a 4-spell menu of Darkness/Darkvision/Pass
 * without Trace/Silence, and a per-name concentration set) is retired: 2024
 * Shadow Arts has exactly one cast (Darkness, always concentrates) plus passive
 * Minor Illusion + Darkvision grants that carry no persisted state (Minor
 * Illusion is a subclass-granted spell, seed/subclass-granted-spells.ts;
 * Darkvision is flavor text — this app tracks no senses).
 */

import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import { readAbilityCost, type AbilityCost, type PayCostContext } from "@/lib/spellcasting/ability-cost.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { deriveEntryScopedResourcesForCharacterRow } from "./class-features.js";
import { catalogEffectSpec, type EffectSpec } from "@/lib/combat/effects.js";
import { normalizeSpellcastingMutable, snapshotSpellcasting } from "@/lib/spellcasting/spell-state.js";
import { applyConditionInTx } from "@/lib/combat/conditions.js";
import { logEvent } from "@/lib/activity/events.js";
import { FOCUS_CAST_CHARACTER_SELECT, emitFocusCastEvents } from "./focus-cast.js";
import type { Prisma } from "@/generated/prisma/client.js";

export class InvalidShadowArtOperationError extends Error {}

/** Cast the Shadow Arts Darkness spell. `shadowArtId` is the catalog GrantedAbility.id. */
export interface CastShadowArtOperation {
  type: "castShadowArt";
  shadowArtId: string;
}

/** Activate Cloak of Shadows (L17): spend 3 focus, become invisible. No catalog id — one fixed feature. */
export interface ActivateCloakOfShadowsOperation {
  type: "activateCloakOfShadows";
}

export type ShadowArtOperation = CastShadowArtOperation | ActivateCloakOfShadowsOperation;

// Prefix stamped on a Shadow Art's concentration entryId so its id space never overlaps a spellbook Spell.id.
export const SHADOW_ART_CONCENTRATION_PREFIX = "shadow-art:";

// Cloak of Shadows carries no GrantedAbility catalog row (a single fixed L17
// feature, not a "choose one" menu like Shadow Arts) — its cost/effect/entryId
// are fixed constants rather than read from the DB.
const CLOAK_OF_SHADOWS_NAME = "Cloak of Shadows";
const CLOAK_OF_SHADOWS_ENTRY_ID = "cloak-of-shadows";
// Narrowed to the "pool" variant (not the bare AbilityCost union) so `.base` is
// accessible below without a runtime kind check — this constant is always a pool cost.
const CLOAK_OF_SHADOWS_COST: Extract<AbilityCost, { kind: "pool" }> = { kind: "pool", key: "focus", base: 3 };
const CLOAK_OF_SHADOWS_EFFECT: EffectSpec = {
  effectType: "utility",
  damageType: null,
  attackType: null,
  saveAbility: null,
  saveEffect: null,
  scaling: { mode: "none" },
  concentration: false,
};

// Catalog columns needed to build the Shadow Arts Darkness cast's flat EffectSpec.
export interface ShadowArtEffectRow {
  name: string;
  effectKind?: string | null;
  buffTarget?: string | null;
  buffModifier?: number | null;
}

/**
 * Build the Darkness cast's EffectSpec via the shared catalogEffectSpec builder:
 * flat (scaling.mode "none"), always concentrates — 2024 Shadow Arts has exactly
 * one cast and it's Darkness (SRD 5.2). Kept on the shared row→spec mapping
 * (lib/combat/effects.ts, #817) rather than inlined, since the same builder also
 * serves disciplines/Channel Divinity.
 */
export function shadowArtEffectSpec(row: ShadowArtEffectRow): EffectSpec {
  return catalogEffectSpec(row, {
    scaling: { mode: "none" },
    concentrates: () => true,
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
  row: { spellcasting: Prisma.JsonValue },
): Promise<void> {
  const catalog = await tx.grantedAbility.findUnique({ where: { id: op.shadowArtId } });
  if (!catalog || catalog.source !== "shadowArts") {
    throw new InvalidShadowArtOperationError(`Shadow Art not found in catalog: ${op.shadowArtId}`);
  }

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
    resourceData: { shadowArtId: catalog.id, focusSpent: cost.base },
  });
}

// Pay Cloak of Shadows' fixed 3-focus cost, self-apply invisible, and log the
// combined result. No concentration (it ends manually on attack/cast/bright
// light, like the 2014 version), so this skips emitFocusCastEvents' concentration
// branch and instead mirrors applyChannelDivinityOperations' invisible-kind tail.
async function applyActivateCloakOfShadows(
  tx: Prisma.TransactionClient,
  characterId: string,
  batchId: string,
  sessionId: string | null,
  row: { spellcasting: Prisma.JsonValue },
): Promise<void> {
  const spellState = normalizeSpellcastingMutable(row.spellcasting);
  const costCtx: PayCostContext = { tx, characterId, batchId, sessionId };
  const outcome = await castAbilityInTx(
    { tx, characterId, batchId, sessionId, cost: costCtx, concentrationHost: spellState },
    {
      name: CLOAK_OF_SHADOWS_NAME,
      entryId: CLOAK_OF_SHADOWS_ENTRY_ID,
      cost: CLOAK_OF_SHADOWS_COST,
      effect: CLOAK_OF_SHADOWS_EFFECT,
      requested: CLOAK_OF_SHADOWS_COST.base,
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
    data: { focusSpent: CLOAK_OF_SHADOWS_COST.base },
    batchId,
    sessionId,
  });
}

/**
 * Applies a batch of Warrior of Shadow operations atomically. Mirrors
 * applyDisciplineOperations: one batchId, LIFO-undoable events, state re-read
 * per op.
 */
export async function applyShadowArtsOperations(
  characterId: string,
  operations: ShadowArtOperation[],
): Promise<void> {
  await runCharacterTransaction(characterId, operations, {
    select: FOCUS_CAST_CHARACTER_SELECT,
    notFound: (id) => new InvalidShadowArtOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, row, op, batchId, sessionId }) => {
      // shadowArtsAvailable/cloakOfShadowsAvailable stay primary-at-total-level
      // (#1071 non-goal, not entry-scoped by deriveEntryScopedResources) — a
      // secondary Warrior of Shadow monk's gate is a documented follow-up, out
      // of scope for #1072.
      const { derived } = deriveEntryScopedResourcesForCharacterRow(row);

      if (op.type === "activateCloakOfShadows") {
        if (!derived?.cloakOfShadowsAvailable) {
          throw new InvalidShadowArtOperationError(
            "Only a Warrior of Shadow monk (level 17+) can use Cloak of Shadows",
          );
        }
        await applyActivateCloakOfShadows(tx, characterId, batchId, sessionId, row);
        return;
      }

      if (!derived?.shadowArtsAvailable) {
        throw new InvalidShadowArtOperationError(
          "Only a Warrior of Shadow monk (level 3+) can cast Shadow Arts spells",
        );
      }
      await applyCastShadowArt(tx, characterId, op, batchId, sessionId, row);
    },
  });
}
