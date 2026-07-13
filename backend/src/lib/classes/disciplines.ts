/**
 * Elemental Discipline cast handler (Way of the Four Elements) — the discipline
 * counterpart to lib/spellcasting/spellcasting.ts. A discipline is a ki-fuelled activated
 * ability catalogued in the Discipline table (#397); casting one spends ki via
 * the shared payAbilityCostInTx pool path and rolls its EffectSpec.
 *
 * The 5e rules live here: the per-cast ki cap, which disciplines require
 * concentration, and the direct ki-scaled EffectSpec build (scaling.mode "ki").
 * Known-list, cost, and effect columns come from the catalog + resources state;
 * ki DC and level gate come from deriveResources() (class-features.ts).
 */

import { Prisma } from "@/generated/prisma/client.js";
import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import { readAbilityCost, type PayCostContext } from "@/lib/spellcasting/ability-cost.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { deriveResourcesForCharacterRow } from "./class-features.js";
import { catalogEffectSpec, type EffectSpec } from "@/lib/combat/effects.js";
import { normalizeResourcesMutable } from "./resources.js";
import { normalizeSpellcastingMutable, snapshotSpellcasting } from "@/lib/spellcasting/spell-state.js";
import { KI_CAST_CHARACTER_SELECT, emitKiCastEvents, type KiCastCharacterRow } from "./ki-cast.js";

// ── Error class ───────────────────────────────────────────────────────────────

export class InvalidDisciplineOperationError extends Error {}

// ── Operation types ───────────────────────────────────────────────────────────

/**
 * Cast a known elemental discipline. `disciplineId` is the catalog Discipline.id;
 * `kiSpent` is the total ki (base + extra, within the per-cast cap); `roll` is
 * the client-computed effect total (0 for utility disciplines).
 */
export interface CastDisciplineOperation {
  type: "castDiscipline";
  disciplineId: string;
  kiSpent: number;
  roll: number;
}

export type DisciplineOperation = CastDisciplineOperation;

// ── 5e rules ──────────────────────────────────────────────────────────────────

/** Max ki spendable on a single discipline by monk level (PHB Elemental Disciplines table). */
export function maxKiPerDiscipline(monkLevel: number): number {
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

// Catalog columns needed to build a discipline's ki-scaled EffectSpec.
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
 * disciplines scale by ki spent above the base cost, so scaling is always mode
 * "ki" with dicePerStep = costPerStep, and concentration is the name-set check.
 * The scaling/concentration axes differ from shadow-arts; the shared row→spec
 * mapping lives in lib/combat/effects.ts (#817).
 */
export function disciplineEffectSpec(row: DisciplineEffectRow): EffectSpec {
  return catalogEffectSpec(row, {
    scaling: { mode: "ki", dicePerStep: row.costPerStep ?? 0 },
    concentrates: (name) => CONCENTRATION_DISCIPLINES.has(name),
  });
}

// ── Cast resolution (gate + catalog + cost validation) ─────────────────────────

/**
 * Validate the ki spent on a discipline: a pool-cost discipline must be within
 * [base, per-cast cap]; a costless (utility) discipline must be cast for 0 ki.
 */
function assertDisciplineKiSpend(
  disciplineName: string,
  cost: ReturnType<typeof readAbilityCost>,
  kiSpent: number,
  level: number,
): void {
  if (cost.kind === "pool") {
    const maxKi = maxKiPerDiscipline(level);
    if (kiSpent < cost.base || kiSpent > maxKi) {
      throw new InvalidDisciplineOperationError(
        `${disciplineName} costs ${cost.base}–${maxKi} ki at monk level ${level} (got ${kiSpent})`,
      );
    }
  } else if (kiSpent !== 0) {
    throw new InvalidDisciplineOperationError(`${disciplineName} costs no ki`);
  }
}

/**
 * Resolve and validate a single discipline cast against the character row: the
 * Four-Elements save-DC gate, the catalog lookup + source guard, the known-list
 * check, and the ki-cost/per-cast-cap validation. Throws
 * InvalidDisciplineOperationError on any failure; returns the pieces the cast
 * needs on success. Kept separate from applyOp so the 5e validation rules read as
 * one unit (and applyOp stays a thin apply/snapshot/emit body).
 */
async function resolveDisciplineCast(
  tx: Prisma.TransactionClient,
  row: KiCastCharacterRow,
  op: CastDisciplineOperation,
) {
  const { derived, level } = deriveResourcesForCharacterRow(row);

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
  assertDisciplineKiSpend(catalog.name, cost, op.kiSpent, level);

  const effect = disciplineEffectSpec(catalog);
  return { catalog, cost, effect, saveDc };
}

// ── Transaction handler ───────────────────────────────────────────────────────

/**
 * Applies a batch of discipline operations atomically. Mirrors
 * applySpellcastingOperations: one batchId, LIFO-undoable events, state re-read
 * per op. Per cast: the pool payer logs its own spendResource event (refunds ki
 * on revert); a concentration discipline logs a spellcasting-category event
 * (restores concentratingOn on revert); the resources-category castDiscipline
 * event carries the roll/DC data.
 */
export async function applyDisciplineOperations(
  characterId: string,
  operations: DisciplineOperation[],
): Promise<void> {
  await runCharacterTransaction(characterId, operations, {
    select: KI_CAST_CHARACTER_SELECT,
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
          requested: cost.kind === "pool" ? op.kiSpent : undefined,
          roll: op.roll,
          eventType: "castDiscipline",
          concentrates,
        },
      );

      // Shared ki-cast audit tail: when concentrating, persist the write-back +
      // log the undoable spellcasting event (restores concentratingOn on revert,
      // whether it was null or a prior spell — castAbilityInTx leaves the
      // write-back to the caller, and a fresh concentration emits no
      // concentrationDropped event). The resources cast record restores nothing
      // (ki refunded by the pool payer's spendResource event, concentration by
      // the event above), so it carries only the roll/DC data.
      const summary = effect.saveAbility ? `${outcome.summary} (save DC ${saveDc})` : outcome.summary;
      await emitKiCastEvents(tx, {
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
        resourceData: { disciplineId: catalog.id, kiSpent: op.kiSpent, roll: op.roll, saveDc },
      });
    },
  });
}
