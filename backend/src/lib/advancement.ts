/**
 * Advancement transaction handler — Ability Score Improvements and Feats.
 *
 * What is persisted: `advancements` array inside Character.resources JSON,
 * plus the side-effected columns `abilityScores`, `hitPoints`, and
 * `initiativeBonus` (which are updated atomically in the same transaction).
 *
 * What is derived at read time: the total slot count (advancementSlotsForLevel
 * in srd/srd.ts) and the clamped display values in serializeCharacter.
 *
 * Design notes:
 *   - Each AdvancementEntry records the exact deltas applied so reversal
 *     subtracts the stored values rather than recomputing from ability scores,
 *     which may have changed since (LIFO undo / reconcile are exact).
 *   - CON increase: +1 max HP per character level applied (hitDice.total).
 *   - DEX increase: initiativeBonus updates by the net change in DEX modifier.
 *   - Undo rides the new `advancement` category in activity.ts, which
 *     restores abilityScores, hitPoints, initiativeBonus, and resources.
 */

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { levelForExperience, proficiencyBonusForLevel } from "./experience.js";
import { logEvent } from "./events.js";
import { normalizeResourcesMutable, serializeResourcesState, type AdvancementEntry } from "./classes/resources.js";
import { advancementSlotsForLevel, abilityModifier } from "@/lib/srd/srd.js";
import { normalizeHitPoints, normalizeHitDice } from "./hitpoints.js";

// ── Error class ───────────────────────────────────────────────────────────────

export class InvalidAdvancementOperationError extends Error {}

// ── Valid ability names ───────────────────────────────────────────────────────

const ABILITY_NAMES = new Set([
  "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma",
]);

const ABILITY_CAP = 20;

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Computes the effect of applying `abilityDeltas` to `scores`.
 * Returns the new scores and the delta amounts to add to hitPoints.max/current
 * and initiativeBonus. All side-effects on persisted columns derive from here.
 */
function computeAdvancementEffect(
  scores: Record<string, number>,
  hitDiceTotal: number,
  abilityDeltas: Record<string, number>,
): { newScores: Record<string, number>; hpDelta: number; initDelta: number } {
  const newScores = { ...scores };
  for (const [ability, delta] of Object.entries(abilityDeltas)) {
    newScores[ability] = (newScores[ability] ?? 10) + delta;
  }

  // CON: each +1 to CON modifier adds +1 HP per level applied.
  const oldConMod = abilityModifier(scores.constitution ?? 10);
  const newConMod = abilityModifier(newScores.constitution ?? 10);
  const hpDelta = (newConMod - oldConMod) * hitDiceTotal;

  // DEX: each +1 to DEX modifier adds +1 to initiative.
  const oldDexMod = abilityModifier(scores.dexterity ?? 10);
  const newDexMod = abilityModifier(newScores.dexterity ?? 10);
  const initDelta = newDexMod - oldDexMod;

  return { newScores, hpDelta, initDelta };
}

/**
 * Reverses a list of AdvancementEntry values against the current column values,
 * subtracting each entry's stored deltas in LIFO order. Returns the restored
 * column values (does not write anything).
 */
export function reverseAdvancementEffects(
  scores: Record<string, number>,
  hitPoints: { current: number; max: number; temp: number; deathSaves: { successes: number; failures: number } },
  initiativeBonus: number,
  entriesToReverse: AdvancementEntry[],
): {
  scores: Record<string, number>;
  hitPoints: { current: number; max: number; temp: number; deathSaves: { successes: number; failures: number } };
  initiativeBonus: number;
} {
  const newScores = { ...scores };
  let newHp = { ...hitPoints, deathSaves: { ...hitPoints.deathSaves } };
  let newInit = initiativeBonus;

  // Apply in reverse order (LIFO).
  for (const entry of [...entriesToReverse].reverse()) {
    for (const [ability, delta] of Object.entries(entry.abilityDeltas)) {
      newScores[ability] = (newScores[ability] ?? 10) - delta;
    }
    newHp = {
      ...newHp,
      max: newHp.max - entry.hpDelta,
      current: Math.min(newHp.current, newHp.max - entry.hpDelta),
    };
    newInit = newInit - entry.initDelta;
  }

  return { scores: newScores, hitPoints: newHp, initiativeBonus: newInit };
}

// ── Operation types ───────────────────────────────────────────────────────────

export interface TakeAsiOperation {
  type: "takeAsi";
  /** One or two increases summing to exactly 2, each capped at 1 or 2. */
  increases: { ability: string; amount: 1 | 2 }[];
}

export interface TakeFeatOperation {
  type: "takeFeat";
  /** Catalog Feat.id — omit for custom feats. */
  featId?: string;
  /** Custom feat payload when featId is absent. */
  custom?: {
    name: string;
    description: string;
    improvements?: import("./classes/resources.js").FeatImprovement[];
    /**
     * Half-feat style: list of ability names the player may choose to bump.
     * When provided (non-empty), `abilityChoice` must be set at the operation level.
     */
    abilityOptions?: string[];
    /** Amount to increase the chosen ability (default 1). */
    abilityIncrease?: number;
  };
  /** Required when taking a half-feat (catalog or custom) with abilityOptions. */
  abilityChoice?: string;
}

export interface RemoveAdvancementOperation {
  type: "removeAdvancement";
  /** Per-character entry UUID (AdvancementEntry.id). */
  entryId: string;
}

export type AdvancementOperation =
  | TakeAsiOperation
  | TakeFeatOperation
  | RemoveAdvancementOperation;

// ── Transaction handler ───────────────────────────────────────────────────────

/**
 * Applies a batch of advancement operations atomically in one Prisma transaction.
 * Mirrors applyResourceOperations / applySpellcastingOperations exactly:
 *   - one batchId per request groups ops on the activity timeline
 *   - any throw rolls back the entire batch
 *   - CharacterEvent logged per op with before/after snapshot for undo symmetry
 */
export async function applyAdvancementOperations(
  characterId: string,
  operations: AdvancementOperation[],
): Promise<void> {
  await runCharacterTransaction(characterId, operations, {
    select: {
      resources: true,
      abilityScores: true,
      hitPoints: true,
      hitDice: true,
      initiativeBonus: true,
      experiencePoints: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        take: 1,
        select: { name: true },
      },
    },
    notFound: (id) => new InvalidAdvancementOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, row, op, batchId, sessionId }) => {
      const level = levelForExperience(row.experiencePoints);
      proficiencyBonusForLevel(level); // validate level is reachable (side-effect-free)
      const className = row.classEntries[0]?.name ?? "";
      const totalSlots = advancementSlotsForLevel(className, level);

      const scores = row.abilityScores as Record<string, number>;
      const hp = normalizeHitPoints(row.hitPoints);
      const hitDice = normalizeHitDice(row.hitDice);
      const initBonus = row.initiativeBonus;
      const state = normalizeResourcesMutable(row.resources);

      // ── Before snapshot ────────────────────────────────────────────────────
      const before = {
        abilityScores: { ...scores },
        hitPoints: { ...hp, deathSaves: { ...hp.deathSaves } },
        initiativeBonus: initBonus,
        resources: {
          used: { ...state.used },
          maneuversKnown: state.maneuversKnown.map((m) => ({ ...m })),
          disciplinesKnown: state.disciplinesKnown.map((d) => ({ ...d })),
          toolProficienciesKnown: state.toolProficienciesKnown.map((t) => ({ ...t })),
          advancements: state.advancements.map((a) => ({
            ...a,
            abilityDeltas: { ...a.abilityDeltas },
          })),
        },
      };

      let summary = "";
      let eventType: "abilityScoreImprovement" | "featTaken" | "advancementRemoved";
      let eventData: Record<string, unknown> = {};
      let newScores = scores;
      let newHp = hp;
      let newInitBonus = initBonus;

      switch (op.type) {
        case "takeAsi": {
          // Validate slot availability.
          if (state.advancements.length >= totalSlots) {
            throw new InvalidAdvancementOperationError(
              `No advancement slots available (${state.advancements.length}/${totalSlots} used)`,
            );
          }

          // Validate increases.
          if (!op.increases || op.increases.length === 0 || op.increases.length > 2) {
            throw new InvalidAdvancementOperationError(
              "takeAsi: provide 1 or 2 increases",
            );
          }
          const totalPoints = op.increases.reduce((s, inc) => s + inc.amount, 0);
          if (totalPoints !== 2) {
            throw new InvalidAdvancementOperationError(
              `takeAsi: increases must sum to exactly 2 (got ${totalPoints})`,
            );
          }
          for (const { ability, amount } of op.increases) {
            if (!ABILITY_NAMES.has(ability)) {
              throw new InvalidAdvancementOperationError(
                `takeAsi: unknown ability "${ability}"`,
              );
            }
            if (amount !== 1 && amount !== 2) {
              throw new InvalidAdvancementOperationError(
                `takeAsi: amount must be 1 or 2, got ${amount}`,
              );
            }
            const current = scores[ability] ?? 10;
            if (current + amount > ABILITY_CAP) {
              throw new InvalidAdvancementOperationError(
                `takeAsi: ${ability} would exceed ${ABILITY_CAP} (current ${current}, +${amount})`,
              );
            }
          }

          const abilityDeltas: Record<string, number> = {};
          for (const { ability, amount } of op.increases) {
            abilityDeltas[ability] = (abilityDeltas[ability] ?? 0) + amount;
          }

          const effect = computeAdvancementEffect(scores, hitDice.total, abilityDeltas);
          newScores = effect.newScores;
          const hpDelta = effect.hpDelta;
          const initDelta = effect.initDelta;

          newHp = {
            ...hp,
            max: hp.max + hpDelta,
            current: hp.current + hpDelta,
          };
          newInitBonus = initBonus + initDelta;

          const entry: AdvancementEntry = {
            id: randomUUID(),
            level,
            kind: "asi",
            abilityDeltas,
            hpDelta,
            initDelta,
          };
          state.advancements.push(entry);

          const incDesc = op.increases
            .map(({ ability, amount }) => `${ability} +${amount}`)
            .join(", ");
          summary = `Ability Score Improvement: ${incDesc}`;
          eventType = "abilityScoreImprovement";
          eventData = {
            entryId: entry.id,
            abilityDeltas,
            hpDelta,
            initDelta,
          };
          break;
        }

        case "takeFeat": {
          // Validate slot availability.
          if (state.advancements.length >= totalSlots) {
            throw new InvalidAdvancementOperationError(
              `No advancement slots available (${state.advancements.length}/${totalSlots} used)`,
            );
          }

          // Exactly one of featId or custom.
          if (Boolean(op.featId) === Boolean(op.custom)) {
            throw new InvalidAdvancementOperationError(
              "takeFeat: provide exactly one of featId or custom",
            );
          }

          let featName: string;
          let featDescription: string;
          const abilityDeltas: Record<string, number> = {};
          let resolvedFeatId: string | undefined;
          let featImprovements: import("./classes/resources.js").FeatImprovement[] = [];

          if (op.featId) {
            const catalogFeat = await tx.feat.findUnique({ where: { id: op.featId } });
            if (!catalogFeat) {
              throw new InvalidAdvancementOperationError(
                `Feat not found in catalog: ${op.featId}`,
              );
            }
            featName = catalogFeat.name;
            featDescription = catalogFeat.description;
            resolvedFeatId = catalogFeat.id;
            // Snapshot the catalog's improvements so removal/derivation never
            // depend on the catalog row being present or unchanged.
            featImprovements = (catalogFeat.improvements as unknown as import("./classes/resources.js").FeatImprovement[]) ?? [];

            // Half-feat ability bump.
            if (catalogFeat.abilityOptions.length > 0) {
              if (!op.abilityChoice) {
                throw new InvalidAdvancementOperationError(
                  `takeFeat: "${catalogFeat.name}" is a half-feat — provide abilityChoice from: ${catalogFeat.abilityOptions.join(", ")}`,
                );
              }
              if (!catalogFeat.abilityOptions.includes(op.abilityChoice)) {
                throw new InvalidAdvancementOperationError(
                  `takeFeat: "${op.abilityChoice}" is not a valid choice for "${catalogFeat.name}" (options: ${catalogFeat.abilityOptions.join(", ")})`,
                );
              }
              const current = scores[op.abilityChoice] ?? 10;
              if (current + catalogFeat.abilityIncrease > ABILITY_CAP) {
                throw new InvalidAdvancementOperationError(
                  `takeFeat: ${op.abilityChoice} would exceed ${ABILITY_CAP} with +${catalogFeat.abilityIncrease}`,
                );
              }
              abilityDeltas[op.abilityChoice] = catalogFeat.abilityIncrease;
            }
          } else {
            const c = op.custom!;
            if (!c.name?.trim()) {
              throw new InvalidAdvancementOperationError("takeFeat: custom feat name is required");
            }
            featName = c.name.trim();
            featDescription = c.description ?? "";
            // Custom feats may supply structured improvements directly.
            featImprovements = c.improvements ?? [];

            // Custom half-feat: optional ability bump, same rules as catalog half-feats.
            if (c.abilityOptions && c.abilityOptions.length > 0) {
              if (!op.abilityChoice) {
                throw new InvalidAdvancementOperationError(
                  `takeFeat: custom feat "${featName}" has abilityOptions — provide abilityChoice from: ${c.abilityOptions.join(", ")}`,
                );
              }
              if (!c.abilityOptions.includes(op.abilityChoice)) {
                throw new InvalidAdvancementOperationError(
                  `takeFeat: "${op.abilityChoice}" is not a valid choice for "${featName}" (options: ${c.abilityOptions.join(", ")})`,
                );
              }
              const increase = c.abilityIncrease ?? 1;
              const current = scores[op.abilityChoice] ?? 10;
              if (current + increase > ABILITY_CAP) {
                throw new InvalidAdvancementOperationError(
                  `takeFeat: ${op.abilityChoice} would exceed ${ABILITY_CAP} with +${increase}`,
                );
              }
              abilityDeltas[op.abilityChoice] = increase;
            }
          }

          const effect = computeAdvancementEffect(scores, hitDice.total, abilityDeltas);
          newScores = effect.newScores;
          const hpDelta = effect.hpDelta;
          const initDelta = effect.initDelta;

          newHp = {
            ...hp,
            max: hp.max + hpDelta,
            current: hp.current + hpDelta,
          };
          newInitBonus = initBonus + initDelta;

          const entry: AdvancementEntry = {
            id: randomUUID(),
            level,
            kind: "feat",
            abilityDeltas,
            hpDelta,
            initDelta,
            featId: resolvedFeatId,
            featName,
            featDescription,
            improvements: featImprovements,
          };
          state.advancements.push(entry);

          const abilityBumpDesc = Object.entries(abilityDeltas).length > 0
            ? ` (+${Object.values(abilityDeltas)[0]} ${Object.keys(abilityDeltas)[0]})`
            : "";
          summary = `Feat: ${featName}${abilityBumpDesc}`;
          eventType = "featTaken";
          eventData = {
            entryId: entry.id,
            featName,
            featId: resolvedFeatId ?? null,
            abilityDeltas,
            hpDelta,
            initDelta,
          };
          break;
        }

        case "removeAdvancement": {
          const idx = state.advancements.findIndex((a) => a.id === op.entryId);
          if (idx === -1) {
            throw new InvalidAdvancementOperationError(
              `Advancement entry not found: ${op.entryId}`,
            );
          }

          const removed = state.advancements[idx];

          // Reverse the single entry's effects on scores, HP, and initiative.
          const reversed = reverseAdvancementEffects(
            scores, hp, initBonus, [removed],
          );
          newScores = reversed.scores;
          newHp = reversed.hitPoints;
          newInitBonus = reversed.initiativeBonus;

          state.advancements.splice(idx, 1);

          const label = removed.kind === "feat"
            ? `Feat: ${removed.featName ?? "Custom"}`
            : `ASI: ${Object.entries(removed.abilityDeltas).map(([a, d]) => `${a} +${d}`).join(", ")}`;
          summary = `Removed advancement: ${label}`;
          eventType = "advancementRemoved";
          eventData = { entryId: op.entryId, label };
          break;
        }
      }

      // ── Write updated columns ──────────────────────────────────────────────
      await tx.character.update({
        where: { id: characterId },
        data: {
          abilityScores: newScores as unknown as Prisma.InputJsonValue,
          hitPoints: newHp as unknown as Prisma.InputJsonValue,
          initiativeBonus: newInitBonus,
          resources: serializeResourcesState(state),
        },
      });

      // ── After snapshot ─────────────────────────────────────────────────────
      const after = {
        abilityScores: { ...newScores },
        hitPoints: { ...newHp, deathSaves: { ...newHp.deathSaves } },
        initiativeBonus: newInitBonus,
        resources: {
          used: { ...state.used },
          maneuversKnown: state.maneuversKnown.map((m) => ({ ...m })),
          disciplinesKnown: state.disciplinesKnown.map((d) => ({ ...d })),
          toolProficienciesKnown: state.toolProficienciesKnown.map((t) => ({ ...t })),
          advancements: state.advancements.map((a) => ({
            ...a,
            abilityDeltas: { ...a.abilityDeltas },
          })),
        },
      };

      await logEvent(tx, {
        characterId,
        category: "advancement",
        type: eventType!,
        summary: summary!,
        before,
        after,
        data: eventData,
        batchId,
        sessionId,
      });
    },
  });
}
