/**
 * Battle Master maneuver cast handler — the maneuver counterpart to
 * lib/disciplines.ts. A maneuver is a superiority-die-fuelled activated ability
 * catalogued in GrantedAbility (source "maneuver"); casting one spends one die
 * via the shared payAbilityCostInTx pool path, rolls it server-side, and (for
 * Rally) applies self temp HP through the core's self-apply path.
 *
 * The 5e rules that live here: the die is always 1× the current superiority die
 * (no scaling), the announced save DC = 8 + prof + max(Str,Dex) (maneuverSaveDC),
 * and Rally grants die + Cha mod as self temp HP. Placement/save columns come
 * from the catalog; the known list + die size come from resources + deriveResources.
 */

import { randomUUID } from "node:crypto";

import { castAbilityInTx } from "./ability-cast.js";
import { readAbilityCost, type PayCostContext } from "./ability-cost.js";
import { deriveResources, resolveClassDie } from "./class-features.js";
import type { EffectSpec } from "./effects.js";
import { logEvent } from "./events.js";
import { proficiencyBonusForLevel, levelForExperience } from "./experience.js";
import { prisma } from "./prisma.js";
import { normalizeResourcesMutable } from "./resources.js";
import { getActiveSessionId } from "./sessions.js";
import { normalizeSpellcastingMutable } from "./spell-state.js";
import { abilityModifier } from "./srd.js";

// "strength" → "Str", "dexterity" → "Dex", "wisdom" → "Wis", "constitution" → "Con".
function abbr(ability: string): string {
  return ability.slice(0, 3).replace(/^./, (c) => c.toUpperCase());
}

export class InvalidManeuverOperationError extends Error {}

/** Cast a known maneuver: spend one superiority die (server rolls it). */
export interface CastManeuverOperation {
  type: "castManeuver";
  entryId: string; // per-character maneuversKnown entry id
}

export type ManeuverOperation = CastManeuverOperation;

/** Result surfaced to the route so the client can fold the die into a roll. */
export interface ManeuverCastResult {
  roll: number;
  saveDc: number | null;
  summary: string;
}

// A maneuver carries no independent roll — its EffectSpec is a bare utility so
// castAbilityInTx pays the die cost without an auto-summed damage/heal line.
function maneuverEffectSpec(saveAbility: string | null): EffectSpec {
  return {
    effectType: "utility",
    saveAbility,
    scaling: { mode: "none" },
  };
}

/**
 * Applies a batch of maneuver operations atomically. Mirrors
 * applyDisciplineOperations: one batchId, LIFO-undoable events, state re-read
 * per op. Each cast: the pool payer logs its own spendResource event (refunds
 * the die on revert); the resources-category castManeuver event carries the
 * roll + announced DC. Returns one ManeuverCastResult per op (client folds the
 * die into the relevant attack/damage total per the maneuver's placement).
 */
export async function applyManeuverOperations(
  characterId: string,
  operations: ManeuverOperation[],
): Promise<ManeuverCastResult[]> {
  const batchId = randomUUID();
  const sessionId = await getActiveSessionId(characterId);
  const results: ManeuverCastResult[] = [];

  await prisma.$transaction(async (tx) => {
    for (const op of operations) {
      const row = await tx.character.findUnique({
        where: { id: characterId },
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
      });
      if (!row) {
        throw new InvalidManeuverOperationError(`Character not found: ${characterId}`);
      }

      const level = levelForExperience(row.experiencePoints);
      const profBonus = proficiencyBonusForLevel(level);
      const primaryEntry = row.classEntries[0];
      const abilityScores = row.abilityScores as Record<string, number>;
      const derived = deriveResources(primaryEntry?.name ?? "", primaryEntry?.subclass ?? undefined, level, abilityScores, profBonus);

      const saveDcBase = derived?.maneuverSaveDC;
      const dieFaces = derived ? resolveClassDie("superiorityDice", derived) : null;
      if (saveDcBase === undefined || dieFaces === null) {
        throw new InvalidManeuverOperationError(
          "Only a Battle Master fighter (level 3+) can spend maneuvers",
        );
      }

      const resources = normalizeResourcesMutable(row.resources);
      const entry = resources.maneuversKnown.find((m) => m.id === op.entryId);
      if (!entry) {
        throw new InvalidManeuverOperationError(`Maneuver not known: ${op.entryId}`);
      }

      // Catalog row (present for seeded maneuvers; custom maneuvers are die-only).
      const catalog = entry.maneuverId
        ? await tx.grantedAbility.findUnique({ where: { id: entry.maneuverId } })
        : null;
      const saveAbility = catalog?.saveAbility ?? null;
      const selfTempHp = catalog?.selfTempHp ?? false;

      // Server owns the roll: 1× the current superiority die.
      const roll = 1 + Math.floor(Math.random() * dieFaces);
      const dieLabel = `d${dieFaces}`;

      const cost = readAbilityCost(catalog ?? { costKind: "pool", costPoolKey: "superiorityDice", costBase: 1 });

      // Rally: die + Cha mod as self temp HP via the core self-apply path.
      const chaMod = abilityModifier(abilityScores.charisma ?? 10);
      const tempHp = selfTempHp ? Math.max(0, roll + chaMod) : 0;

      const spellState = normalizeSpellcastingMutable(row.spellcasting);
      const costCtx: PayCostContext = { tx, characterId, batchId, sessionId };
      await castAbilityInTx(
        { tx, characterId, batchId, sessionId, cost: costCtx, concentrationHost: spellState },
        {
          name: entry.name,
          entryId: entry.id,
          cost,
          effect: maneuverEffectSpec(saveAbility),
          requested: cost.kind === "pool" ? 1 : undefined,
          roll,
          eventType: "castManeuver",
          concentrates: false,
          apply: selfTempHp && tempHp > 0 ? { target: "self", kind: "tempHp", amount: tempHp } : undefined,
        },
      );

      const saveDc = saveAbility ? saveDcBase : null;
      let summary = `Used ${entry.name} — ${dieLabel}:${roll}`;
      if (saveDc !== null && saveAbility) summary += `, DC ${saveDc} ${abbr(saveAbility)} save`;
      if (selfTempHp) summary += ` (${tempHp} temp HP)`;

      await logEvent(tx, {
        characterId,
        category: "resources",
        type: "castManeuver",
        summary,
        data: {
          entryId: entry.id,
          maneuverId: entry.maneuverId ?? null,
          maneuverName: entry.name,
          roll,
          die: dieLabel,
          saveDc,
          saveAbility,
        },
        batchId,
        sessionId,
      });

      results.push({ roll, saveDc, summary });
    }
  });

  return results;
}
