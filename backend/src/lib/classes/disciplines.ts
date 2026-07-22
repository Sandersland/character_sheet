/**
 * Elemental Discipline cast handler (Way of the Four Elements) — the discipline
 * counterpart to lib/spellcasting/spellcasting.ts. A discipline is a focus-fuelled
 * activated ability catalogued in the Discipline table (#397); casting one spends
 * focus via the shared payAbilityCostInTx pool path and rolls its EffectSpec.
 *
 * The 5e rules live here: the per-cast focus cap, which disciplines require
 * concentration, and the direct focus-scaled EffectSpec build (scaling.mode
 * "focus"). Known-list, cost, and effect columns come from the catalog +
 * resources state; focus DC and level gate come from deriveResources()
 * (class-features.ts).
 */

import { Prisma } from "@/generated/prisma/client.js";
import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import { readAbilityCost, type PayCostContext } from "@/lib/spellcasting/ability-cost.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { deriveEntryScopedResourcesForCharacterRow } from "./class-features.js";
import { catalogEffectSpec, type EffectSpec } from "@/lib/combat/effects.js";
import { normalizeResourcesMutable } from "./resources.js";
import { normalizeSpellcastingMutable, snapshotSpellcasting } from "@/lib/spellcasting/spell-state.js";
import { FOCUS_CAST_CHARACTER_SELECT, emitFocusCastEvents, type FocusCastCharacterRow } from "./focus-cast.js";

export class InvalidDisciplineOperationError extends Error {}

/**
 * Cast a known elemental discipline. `disciplineId` is the catalog Discipline.id;
 * `focusSpent` is the total focus (base + extra, within the per-cast cap); `roll`
 * is the client-computed effect total (0 for utility disciplines).
 */
export interface CastDisciplineOperation {
  type: "castDiscipline";
  disciplineId: string;
  focusSpent: number;
  roll: number;
}

export type DisciplineOperation = CastDisciplineOperation;

/** Max focus spendable on a single discipline by monk level (PHB Elemental Disciplines table). */
export function maxFocusPerDiscipline(monkLevel: number): number {
  return Math.min(6, 2 + Math.floor((monkLevel - 1) / 4));
}

/** Disciplines that mimic a concentration spell — routed through the shared slot. */
const CONCENTRATION_DISCIPLINES = new Set<string>([
  "Rush of the Gale Spirits", // gust of wind
  "Clench of the North Wind",  // hold person
  "Mist Stance",               // gaseous form
  "Ride the Wind",             // fly
  "Eternal Mountain Defense",  // stoneskin
  "River of Hungry Flame",     // wall of fire
  "Wave of Rolling Earth",     // wall of stone
]);

// Catalog columns needed to build a discipline's focus-scaled EffectSpec.
export interface DisciplineEffectRow {
  name: string;
  costPerStep?: number | null;
  effectKind?: string | null;
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  effectModifier?: number | null;
  damageType?: string | null;
  attackType?: string | null;
  saveAbility?: string | null;
  saveEffect?: string | null;
}

/**
 * Build a discipline's EffectSpec via the shared catalogEffectSpec builder:
 * disciplines scale by focus spent above the base cost, so scaling is always
 * mode "focus" with dicePerStep = costPerStep, and concentration is the
 * name-set check. The scaling/concentration axes differ from shadow-arts; the
 * shared row→spec mapping lives in lib/combat/effects.ts (#817).
 */
export function disciplineEffectSpec(row: DisciplineEffectRow): EffectSpec {
  return catalogEffectSpec(row, {
    scaling: { mode: "focus", dicePerStep: row.costPerStep ?? 0 },
    concentrates: (name) => CONCENTRATION_DISCIPLINES.has(name),
  });
}

/**
 * Validate the focus spent on a discipline: a pool-cost discipline must be
 * within [base, per-cast cap]; a costless (utility) discipline must be cast
 * for 0 focus.
 */
function assertDisciplineFocusSpend(
  disciplineName: string,
  cost: ReturnType<typeof readAbilityCost>,
  focusSpent: number,
  level: number,
): void {
  if (cost.kind === "pool") {
    const maxFocus = maxFocusPerDiscipline(level);
    if (focusSpent < cost.base || focusSpent > maxFocus) {
      throw new InvalidDisciplineOperationError(
        `${disciplineName} costs ${cost.base}–${maxFocus} focus at monk level ${level} (got ${focusSpent})`,
      );
    }
  } else if (focusSpent !== 0) {
    throw new InvalidDisciplineOperationError(`${disciplineName} costs no focus`);
  }
}

/**
 * Resolve and validate a single discipline cast against the character row: the
 * Four-Elements save-DC gate, the catalog lookup + source guard, the known-list
 * check, and the focus-cost/per-cast-cap validation. Throws
 * InvalidDisciplineOperationError on any failure; returns the pieces the cast
 * needs on success. Kept separate from applyOp so the 5e validation rules read as
 * one unit (and applyOp stays a thin apply/snapshot/emit body).
 */
async function resolveDisciplineCast(
  tx: Prisma.TransactionClient,
  row: FocusCastCharacterRow,
  op: CastDisciplineOperation,
) {
  // disciplineLevel is the Four Elements monk entry's OWN effective level (not
  // the total character level) — a secondary monk's per-cast focus cap scales to
  // its own level (PHB'24 p.163), matching the entry-scoped save DC below.
  const { derived, disciplineLevel } = deriveEntryScopedResourcesForCharacterRow(row);

  // Gate: only a Four Elements monk of L3+ has a discipline save DC.
  const saveDc = derived?.disciplineSaveDC;
  if (saveDc === undefined) {
    throw new InvalidDisciplineOperationError(
      "Only a Way of the Four Elements monk (level 3+) can cast elemental disciplines",
    );
  }

  const catalog = await tx.grantedAbility.findUnique({ where: { id: op.disciplineId } });
  if (!catalog || catalog.source !== "discipline") {
    throw new InvalidDisciplineOperationError(`Discipline not found in catalog: ${op.disciplineId}`);
  }

  // Must be an always-known discipline or one the monk has learned.
  const resources = normalizeResourcesMutable(row.resources);
  if (!catalog.alwaysKnown && !resources.disciplinesKnown.some((d) => d.disciplineId === catalog.id)) {
    throw new InvalidDisciplineOperationError(`Discipline not known: ${catalog.name}`);
  }

  const cost = readAbilityCost(catalog);
  assertDisciplineFocusSpend(catalog.name, cost, op.focusSpent, disciplineLevel);

  const effect = disciplineEffectSpec(catalog);
  return { catalog, cost, effect, saveDc };
}

/**
 * Applies a batch of discipline operations atomically. Mirrors
 * applySpellcastingOperations: one batchId, LIFO-undoable events, state re-read
 * per op. Per cast: the pool payer logs its own spendResource event (refunds
 * focus on revert); a concentration discipline logs a spellcasting-category event
 * (restores concentratingOn on revert); the resources-category castDiscipline
 * event carries the roll/DC data.
 */
export async function applyDisciplineOperations(
  characterId: string,
  operations: DisciplineOperation[],
): Promise<void> {
  await runCharacterTransaction(characterId, operations, {
    select: FOCUS_CAST_CHARACTER_SELECT,
    notFound: (id) => new InvalidDisciplineOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, row, op, batchId, sessionId }) => {
      const { catalog, cost, effect, saveDc } = await resolveDisciplineCast(tx, row, op);
      const concentrates = effect.concentration ?? false;

      const spellState = normalizeSpellcastingMutable(row.spellcasting);
      const beforeSpell = snapshotSpellcasting(spellState);

      const costCtx: PayCostContext = { tx, characterId, batchId, sessionId };
      const outcome = await castAbilityInTx(
        { tx, characterId, batchId, sessionId, cost: costCtx, concentrationHost: spellState },
        {
          name: catalog.name,
          entryId: catalog.id,
          cost,
          effect,
          requested: cost.kind === "pool" ? op.focusSpent : undefined,
          roll: op.roll,
          eventType: "castDiscipline",
          concentrates,
        },
      );

      // Shared focus-cast audit tail: when concentrating, persist the write-back +
      // log the undoable spellcasting event (restores concentratingOn on revert,
      // whether it was null or a prior spell — castAbilityInTx leaves the
      // write-back to the caller, and a fresh concentration emits no
      // concentrationDropped event). The resources cast record restores nothing
      // (focus refunded by the pool payer's spendResource event, concentration by
      // the event above), so it carries only the roll/DC data.
      const summary = effect.saveAbility ? `${outcome.summary} (save DC ${saveDc})` : outcome.summary;
      await emitFocusCastEvents(tx, {
        characterId,
        batchId,
        sessionId,
        eventType: "castDiscipline",
        concentrates,
        spellState,
        beforeSpell,
        concentrationName: catalog.name,
        concentrationData: { disciplineId: catalog.id, disciplineName: catalog.name },
        resourceSummary: summary,
        resourceData: { disciplineId: catalog.id, focusSpent: op.focusSpent, roll: op.roll, saveDc },
      });
    },
  });
}
