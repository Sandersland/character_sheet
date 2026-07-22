/**
 * Shadow Arts cast handler (Way of Shadow, #441) — the focus-cast counterpart to
 * applyDisciplineOperations. Each of the 4 L3 Shadow Arts spells is a GrantedAbility
 * row with source "shadowArts"; casting one spends a flat 2 focus via the shared
 * payAbilityCostInTx pool path and routes through castAbilityInTx (concentration
 * + buff application from the shared engine/#438).
 *
 * The 5e rules live here: the flat 2-focus cost (no focus scaling), which spells
 * require concentration, and the flat non-scaling EffectSpec build (buff for
 * Pass without Trace, utility otherwise). Availability + level gate come from
 * deriveResources() (class-features.ts).
 */

import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import { readAbilityCost, type PayCostContext } from "@/lib/spellcasting/ability-cost.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { deriveEntryScopedResourcesForCharacterRow } from "./class-features.js";
import { catalogEffectSpec, type EffectSpec } from "@/lib/combat/effects.js";
import { normalizeSpellcastingMutable, snapshotSpellcasting } from "@/lib/spellcasting/spell-state.js";
import { FOCUS_CAST_CHARACTER_SELECT, emitFocusCastEvents } from "./focus-cast.js";

export class InvalidShadowArtOperationError extends Error {}

/** Cast a Shadow Arts spell. `shadowArtId` is the catalog GrantedAbility.id. */
export interface CastShadowArtOperation {
  type: "castShadowArt";
  shadowArtId: string;
}

export type ShadowArtOperation = CastShadowArtOperation;

// Prefix stamped on a Shadow Art's concentration entryId so its id space never overlaps a spellbook Spell.id.
export const SHADOW_ART_CONCENTRATION_PREFIX = "shadow-art:";

/** Shadow Arts spells that mimic a concentration spell — routed through the shared slot. */
const CONCENTRATION_SHADOW_ARTS = new Set<string>([
  "Shadow Arts: Darkness",
  "Shadow Arts: Silence",
  "Shadow Arts: Pass without Trace",
]);

// Catalog columns needed to build a Shadow Art's flat EffectSpec.
export interface ShadowArtEffectRow {
  name: string;
  effectKind?: string | null;
  buffTarget?: string | null;
  buffModifier?: number | null;
}

/**
 * Build a Shadow Art's EffectSpec via the shared catalogEffectSpec builder:
 * always flat (scaling.mode "none"), concentration from the name set. Pass without
 * Trace is a buff (buffTarget/buffModifier map into the spec); the rest are
 * roll-less utility. The scaling/concentration axes differ from disciplines; the
 * shared row→spec mapping lives in lib/combat/effects.ts (#817).
 */
export function shadowArtEffectSpec(row: ShadowArtEffectRow): EffectSpec {
  return catalogEffectSpec(row, {
    scaling: { mode: "none" },
    concentrates: (name) => CONCENTRATION_SHADOW_ARTS.has(name),
  });
}

/**
 * Applies a batch of Shadow Arts operations atomically. Mirrors
 * applyDisciplineOperations: one batchId, LIFO-undoable events, state re-read
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
      // shadowArtsAvailable stays primary-at-total-level (#1071 non-goal, not
      // entry-scoped by deriveEntryScopedResources) — a secondary Way of Shadow
      // monk's gate is a documented follow-up, out of scope for #1072.
      const { derived } = deriveEntryScopedResourcesForCharacterRow(row);

      // Gate: only a Way of Shadow monk of L3+ can cast Shadow Arts.
      if (!derived?.shadowArtsAvailable) {
        throw new InvalidShadowArtOperationError(
          "Only a Way of Shadow monk (level 3+) can cast Shadow Arts spells",
        );
      }

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
          requested: cost.base, // flat 2 focus, no scaling
          roll: 0,
          eventType: "castShadowArt",
          concentrates,
        },
      );

      // Shared focus-cast audit tail: when concentrating, persist the write-back +
      // log the undoable spellcasting event (restores concentratingOn on revert;
      // non-concentration Shadow Arts like Darkvision leave spellcasting alone).
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
    },
  });
}
