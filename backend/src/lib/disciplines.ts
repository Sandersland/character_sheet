/**
 * Elemental Discipline cast handler (Way of the Four Elements) — the discipline
 * counterpart to lib/spellcasting.ts. A discipline is a ki-fuelled activated
 * ability catalogued in the Discipline table (#397); casting one spends ki via
 * the shared payAbilityCostInTx pool path and rolls its EffectSpec.
 *
 * The 5e rules live here: the per-cast ki cap, which disciplines require
 * concentration, and the direct ki-scaled EffectSpec build (scaling.mode "ki").
 * Known-list, cost, and effect columns come from the catalog + resources state;
 * ki DC and level gate come from deriveResources() (class-features.ts).
 */

import { Prisma } from "@/generated/prisma/client.js";
import { castAbilityInTx } from "./ability-cast.js";
import { readAbilityCost, type PayCostContext } from "./ability-cost.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { deriveResources } from "./class-features.js";
import type { EffectSpec } from "./effects.js";
import { logEvent } from "./events.js";
import { proficiencyBonusForLevel, levelForExperience } from "./experience.js";
import { normalizeResourcesMutable } from "./resources.js";
import { normalizeSpellcastingMutable, type SpellcastingMutableState } from "./spell-state.js";

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
 * Build a discipline's EffectSpec directly (not via readEffectSpec): disciplines
 * scale by ki spent above the base cost, so scaling is always mode "ki" with
 * dicePerStep = costPerStep. Utility disciplines carry no dice.
 */
export function disciplineEffectSpec(row: DisciplineEffectRow): EffectSpec {
  const hasDice = Boolean(row.effectKind && row.effectDiceCount && row.effectDiceFaces);
  const dice = hasDice
    ? { count: row.effectDiceCount as number, faces: row.effectDiceFaces as number, modifier: row.effectModifier ?? 0 }
    : undefined;
  const effectType = row.effectKind === "heal" ? "heal" : row.effectKind === "damage" ? "damage" : "utility";
  return {
    effectType,
    dice,
    damageType: row.damageType ?? null,
    attackType: row.attackType ?? null,
    saveAbility: row.saveAbility ?? null,
    saveEffect: row.saveEffect ?? null,
    scaling: { mode: "ki", dicePerStep: row.costPerStep ?? 0 },
    concentration: CONCENTRATION_DISCIPLINES.has(row.name),
  };
}

// Deep-copy the spellcasting state for a before/after event snapshot.
function snapshotSpellcasting(state: SpellcastingMutableState) {
  return {
    spellcasting: {
      slotsUsed: { ...state.slotsUsed },
      arcanumUsed: { ...state.arcanumUsed },
      spells: [...state.spells],
      concentratingOn: state.concentratingOn ? { ...state.concentratingOn } : null,
    },
  };
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
    select: {
      spellcasting: true,
      resources: true,
      experiencePoints: true,
      abilityScores: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        take: 1,
        select: { name: true, subclass: true },
      },
    },
    notFound: (id) => new InvalidDisciplineOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, row, op, batchId, sessionId }) => {
      const level = levelForExperience(row.experiencePoints);
      const profBonus = proficiencyBonusForLevel(level);
      const primaryEntry = row.classEntries[0];
      const abilityScores = row.abilityScores as Record<string, number>;
      const derived = deriveResources(primaryEntry?.name ?? "", primaryEntry?.subclass ?? undefined, level, abilityScores, profBonus);

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
      const maxKi = maxKiPerDiscipline(level);
      if (cost.kind === "pool") {
        if (op.kiSpent < cost.base || op.kiSpent > maxKi) {
          throw new InvalidDisciplineOperationError(
            `${catalog.name} costs ${cost.base}–${maxKi} ki at monk level ${level} (got ${op.kiSpent})`,
          );
        }
      } else if (op.kiSpent !== 0) {
        throw new InvalidDisciplineOperationError(`${catalog.name} costs no ki`);
      }

      const effect = disciplineEffectSpec(catalog);
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

      // Persist + audit the concentration change under the spellcasting category
      // so batch revert restores concentratingOn (whether it was null or a prior
      // spell). castAbilityInTx leaves the write-back to the caller; a fresh
      // concentration emits no concentrationDropped event, so this event is what
      // makes it undoable. Non-concentration disciplines leave spellcasting alone.
      if (concentrates) {
        await tx.character.update({
          where: { id: characterId },
          data: {
            spellcasting: {
              slotsUsed: spellState.slotsUsed,
              arcanumUsed: spellState.arcanumUsed,
              spells: spellState.spells,
              concentratingOn: spellState.concentratingOn,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        await logEvent(tx, {
          characterId,
          category: "spellcasting",
          type: "castDiscipline",
          summary: `Concentrating on ${catalog.name}`,
          before: beforeSpell,
          after: snapshotSpellcasting(spellState),
          data: { disciplineId: catalog.id, disciplineName: catalog.name },
          batchId,
          sessionId,
        });
      }

      // The cast record itself restores nothing (ki is refunded by the pool
      // payer's own spendResource event, concentration by the event above), so
      // it carries no before/after snapshot — just the roll/DC data.
      const summary = effect.saveAbility ? `${outcome.summary} (save DC ${saveDc})` : outcome.summary;
      await logEvent(tx, {
        characterId,
        category: "resources",
        type: "castDiscipline",
        summary,
        data: { disciplineId: catalog.id, kiSpent: op.kiSpent, roll: op.roll, saveDc },
        batchId,
        sessionId,
      });
    },
  });
}
