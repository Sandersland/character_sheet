import { randomUUID } from "node:crypto";

import { Prisma } from "../generated/prisma/client.js";
import { proficiencyBonusForLevel, levelForExperience } from "./experience.js";
import { logEvent } from "./events.js";
import { prisma } from "./prisma.js";
import { abilityModifier, deriveResources, hitDieFace } from "./srd.js";
import { normalizeResourcesMutable, serializeResourcesState } from "./resources.js";
import { normalizeSpellcastingMutable } from "./spellcasting.js";

export class InvalidHitPointOperationError extends Error {}

// ---- Canonical JSON shapes (stored in hitPoints / hitDice columns) ----

export interface HitPoints {
  current: number;
  max: number;
  temp: number;
  deathSaves: { successes: number; failures: number };
}

export interface HitDice {
  total: number;
  die: string; // e.g. "d10"
  spent: number;
}

// ---- Normalizers ----
// These are applied in serializeCharacter (routes/characters.ts) so every
// GET response carries the new fields even for rows that predate the
// `deathSaves` / `spent` additions — no data migration needed.

export function normalizeHitPoints(json: Prisma.JsonValue): HitPoints {
  const hp = (json ?? {}) as Record<string, unknown>;
  const ds = (hp.deathSaves ?? {}) as Record<string, unknown>;
  return {
    current: Number(hp.current ?? 0),
    max: Number(hp.max ?? 1),
    temp: Number(hp.temp ?? 0),
    deathSaves: {
      successes: Math.min(3, Math.max(0, Number(ds.successes ?? 0))),
      failures: Math.min(3, Math.max(0, Number(ds.failures ?? 0))),
    },
  };
}

export function normalizeHitDice(json: Prisma.JsonValue): HitDice {
  const hd = (json ?? {}) as Record<string, unknown>;
  return {
    total: Number(hd.total ?? 1),
    die: String(hd.die ?? "d6"),
    spent: Number(hd.spent ?? 0),
  };
}

// ---- Pure helpers (no DB, fully unit-testable) ----

/**
 * Fixed average HP gain per level-up for a given hit die face count.
 * 5e PHB fixed values: d6→4, d8→5, d10→6, d12→7.
 */
export function fixedAverageForDie(faces: number): number {
  return Math.floor(faces / 2) + 1;
}

/**
 * HP gain from one level-up. Level-up floor is max(1, …) — a bad Con
 * cannot produce less than 1 HP per level.
 * For "roll" method, `roll` is the raw die value sent by the client (validated
 * by the caller to be in range 1..faces).
 */
export function levelUpHpGain(
  faces: number,
  conMod: number,
  method: "average" | "roll",
  roll?: number
): number {
  const dieValue = method === "average" ? fixedAverageForDie(faces) : (roll ?? faces);
  return Math.max(1, dieValue + conMod);
}

/**
 * HP healed from spending one hit die during a short rest.
 * Short-rest floor is max(0, …) — negative Con reduces a die's contribution
 * to 0, not negative. This differs from the level-up max(1, …) floor.
 */
export function hitDieHeal(roll: number, conMod: number): number {
  return Math.max(0, roll + conMod);
}

/**
 * Apply a d20 death save roll, returning the new deathSaves state and
 * updated current HP.
 *
 * - Nat 20 → regain 1 HP + full reset (conscious again).
 * - 3 successes → stable but still unconscious (reset, current stays 0).
 * - 3 failures → dead (leave failures at 3; no persisted "dead" flag — UI
 *   shows three filled failure pips as the signal).
 */
export function applyDeathSaveRoll(
  deathSaves: { successes: number; failures: number },
  current: number,
  roll: number
): { deathSaves: { successes: number; failures: number }; current: number } {
  if (roll === 20) {
    return { deathSaves: { successes: 0, failures: 0 }, current: 1 };
  }

  let { successes, failures } = deathSaves;
  if (roll === 1) {
    failures = Math.min(3, failures + 2);
  } else if (roll <= 9) {
    failures = Math.min(3, failures + 1);
  } else {
    // 10–19
    successes = Math.min(3, successes + 1);
  }

  // 3 successes → stable (still 0 HP / unconscious, not dead)
  if (successes >= 3) {
    return { deathSaves: { successes: 0, failures: 0 }, current };
  }

  return { deathSaves: { successes, failures }, current };
}

// ---- Operation types ----

/** HP damage: temp absorbs first, then current. Floors at 0. */
export interface DamageOperation {
  type: "damage";
  amount: number; // must be > 0
}

/** HP healing. If current was 0 (dying), resets death saves. */
export interface HealOperation {
  type: "heal";
  amount: number; // must be > 0
}

/** Set temporary HP. 5e rule: doesn't stack — takes the higher. */
export interface SetTempOperation {
  type: "setTemp";
  amount: number; // must be >= 0
}

/**
 * Short rest: spend hit dice to heal. `rolls` is an array of raw die values
 * (1..hitDieFace), one per die spent. Client rolls via dice.ts and sends the
 * raw values; server validates range and applies the rules math.
 */
export interface ShortRestOperation {
  type: "shortRest";
  rolls: number[];
}

/** Long rest: restore full HP, clear temp, recover half spent hit dice (min 1). */
export interface LongRestOperation {
  type: "longRest";
}

/**
 * Level-up: adds 1 to hitDice.total, increases max and current HP.
 * Requires a pending level (derivedLevel > hitDice.total).
 * For "roll" method the client rolls via dice.ts and sends the raw die face;
 * for "average" the server computes the fixed average.
 */
export interface LevelUpOperation {
  type: "levelUp";
  method: "average" | "roll";
  roll?: number; // raw die value (required when method === "roll")
}

/**
 * Roll a death save (d20). Only valid when current === 0.
 * Client rolls via dice.ts and sends the raw value.
 */
export interface DeathSaveOperation {
  type: "deathSave";
  roll: number; // 1..20
}

/** Stabilize the character (Medicine check success, etc.). Only valid when current === 0. */
export interface StabilizeOperation {
  type: "stabilize";
}

export type HitPointOperation =
  | DamageOperation
  | HealOperation
  | SetTempOperation
  | ShortRestOperation
  | LongRestOperation
  | LevelUpOperation
  | DeathSaveOperation
  | StabilizeOperation;

// ---- Transaction handler ----

/**
 * Applies a batch of HP operations atomically in one Prisma transaction.
 * State is re-read from the DB per op so a batch of N levelUp ops applies
 * sequentially (each sees the updated total/max/current from the previous).
 * Every meaningful op writes a CharacterEvent (with field-level diffs) in
 * the same transaction so history and state are always consistent.
 */
export async function applyHitPointOperations(
  characterId: string,
  operations: HitPointOperation[]
): Promise<void> {
  // One batchId groups all ops in this request on the activity timeline,
  // same as inventory uses (lib/inventory.ts → applyInventoryOperations).
  const batchId = randomUUID();

  await prisma.$transaction(async (tx) => {
    for (const op of operations) {
      const row = await tx.character.findUnique({
        where: { id: characterId },
        select: {
          hitPoints: true,
          hitDice: true,
          abilityScores: true,
          experiencePoints: true,
          spellcasting: true,
          resources: true,
          classEntries: {
            orderBy: { position: "asc" as const },
            take: 1,
            select: { id: true, level: true, name: true, subclass: true },
          },
        },
      });
      if (!row) {
        throw new InvalidHitPointOperationError(`Character not found: ${characterId}`);
      }

      const hp = normalizeHitPoints(row.hitPoints);
      const hd = normalizeHitDice(row.hitDice);
      const abilityScores = row.abilityScores as Record<string, number>;
      const conMod = abilityModifier(abilityScores.constitution ?? 10);
      const faces = hitDieFace(hd.die);

      // Snapshot the full sub-state before this op so the event can show
      // both before/after and the per-field diffs. For levelUp, include the
      // class-entry level since the op mutates that too.
      const primaryEntry = row.classEntries[0];
      const beforeHp = { ...hp };
      const beforeHd = { ...hd };
      const beforeClassLevel = primaryEntry?.level ?? null;
      let eventData: Record<string, unknown> = {};
      let summary = "";

      switch (op.type) {
        case "damage": {
          if (op.amount <= 0) {
            throw new InvalidHitPointOperationError("damage amount must be positive");
          }
          // Temp HP absorbs first, then current. Both floor at 0.
          const absorbed = Math.min(hp.temp, op.amount);
          hp.temp -= absorbed;
          hp.current = Math.max(0, hp.current - (op.amount - absorbed));
          // Note: massive-damage instant-death (remaining damage ≥ max at 0) is
          // intentionally out of scope for this phase.
          eventData = { amount: op.amount };
          summary = `Took ${op.amount} damage (${beforeHp.current} → ${hp.current} HP)`;
          break;
        }

        case "heal": {
          if (op.amount <= 0) {
            throw new InvalidHitPointOperationError("heal amount must be positive");
          }
          // Regaining any HP while at 0 (dying) wakes the character and clears
          // the death save accumulation.
          if (hp.current === 0) {
            hp.deathSaves = { successes: 0, failures: 0 };
          }
          hp.current = Math.min(hp.max, hp.current + op.amount);
          eventData = { amount: op.amount };
          summary = `Healed ${op.amount} HP (${beforeHp.current} → ${hp.current} HP)`;
          break;
        }

        case "setTemp": {
          if (op.amount < 0) {
            throw new InvalidHitPointOperationError("setTemp amount must be non-negative");
          }
          // 5e: temp HP doesn't stack — take the higher value.
          hp.temp = Math.max(hp.temp, op.amount);
          eventData = { amount: op.amount };
          summary = `Set temporary HP to ${op.amount}`;
          break;
        }

        case "shortRest": {
          const available = hd.total - hd.spent;
          const spending = op.rolls.length;
          if (spending > available) {
            throw new InvalidHitPointOperationError(
              `Cannot spend ${spending} hit dice; only ${available} available`
            );
          }
          if (op.rolls.some((r) => r < 1 || r > faces)) {
            throw new InvalidHitPointOperationError(
              `Hit die rolls must be between 1 and ${faces} (die: ${hd.die})`
            );
          }
          const totalGain = op.rolls.reduce((sum, roll) => sum + hitDieHeal(roll, conMod), 0);
          hp.current = Math.min(hp.max, hp.current + totalGain);
          hd.spent += spending;

          // Reset subclass resources that recharge on short or short-or-long rest
          // (e.g. Battle Master superiority dice recharge on a short rest).
          const srAbilityScores = row.abilityScores as Record<string, number>;
          const srLevel = levelForExperience(row.experiencePoints);
          const srProfBonus = proficiencyBonusForLevel(srLevel);
          const srClassEntry = row.classEntries[0];
          const srDerivedRes = deriveResources(
            srClassEntry?.name ?? "",
            srClassEntry?.subclass ?? undefined,
            srLevel,
            srAbilityScores,
            srProfBonus,
          );
          const srResourceState = normalizeResourcesMutable(row.resources);
          const beforeSrResourceState = {
            used: { ...srResourceState.used },
            maneuversKnown: srResourceState.maneuversKnown.map((m) => ({ ...m })),
          };
          let srResourcesRestored = 0;
          if (srDerivedRes) {
            for (const pool of srDerivedRes.resources) {
              if (pool.recharge === "shortRest" || pool.recharge === "short-or-long") {
                srResourcesRestored += srResourceState.used[pool.key] ?? 0;
                srResourceState.used[pool.key] = 0;
              }
            }
          }

          eventData = {
            rolls: op.rolls,
            totalGain,
            conMod,
            resourcesRestored: srResourcesRestored,
            beforeResourceState: beforeSrResourceState,
          };
          const restParts: string[] = [`+${totalGain} HP`];
          if (srResourcesRestored > 0) restParts.push(`resources restored`);
          summary = `Short rest — spent ${spending} hit ${spending === 1 ? "die" : "dice"}: ${restParts.join(", ")}`;

          // Write the resource reset alongside HP in the character.update below.
          // Route through serializeResourcesState so all keys (including
          // toolProficienciesKnown) round-trip — prevents silent data loss on rest.
          await tx.character.update({
            where: { id: characterId },
            data: {
              resources: serializeResourcesState(srResourceState),
            },
          });
          break;
        }

        case "longRest": {
          const prevCurrent = hp.current;
          hp.current = hp.max;
          hp.temp = 0;
          hp.deathSaves = { successes: 0, failures: 0 };
          // Recover hit dice equal to half your total (round down, min 1).
          const recovered = Math.max(1, Math.floor(hd.total / 2));
          hd.spent = Math.max(0, hd.spent - recovered);

          // Reset all spell slot used-counts to 0 (full caster long-rest recovery).
          // TODO: Warlock Pact Magic restores on short rest — handle once the
          // half/Pact caster progressions are added.
          const spellState = normalizeSpellcastingMutable(row.spellcasting);
          const beforeSpellState = { slotsUsed: { ...spellState.slotsUsed } };
          const slotsRestored = Object.values(spellState.slotsUsed).reduce((s, n) => s + n, 0);
          spellState.slotsUsed = {};

          // Reset subclass resources that recharge on a long rest or short-or-long rest.
          const abilityScores = row.abilityScores as Record<string, number>;
          const derivedLevel = levelForExperience(row.experiencePoints);
          const profBonus = proficiencyBonusForLevel(derivedLevel);
          const primaryClassEntry = row.classEntries[0];
          const derivedRes = deriveResources(
            primaryClassEntry?.name ?? "",
            primaryClassEntry?.subclass ?? undefined,
            derivedLevel,
            abilityScores,
            profBonus,
          );
          const resourceState = normalizeResourcesMutable(row.resources);
          const beforeResourceState = {
            used: { ...resourceState.used },
            maneuversKnown: resourceState.maneuversKnown.map((m) => ({ ...m })),
          };
          let resourcesRestored = 0;
          if (derivedRes) {
            for (const pool of derivedRes.resources) {
              if (pool.recharge === "longRest" || pool.recharge === "short-or-long") {
                resourcesRestored += resourceState.used[pool.key] ?? 0;
                resourceState.used[pool.key] = 0;
              }
            }
          }

          const hpRestored = hp.max - prevCurrent;
          eventData = { recovered, hpRestored, slotsRestored, resourcesRestored };
          const parts: string[] = [];
          if (hpRestored > 0) parts.push(`+${hpRestored} HP`);
          else parts.push("HP already full");
          if (slotsRestored > 0) parts.push(`${slotsRestored} slot${slotsRestored !== 1 ? "s" : ""} restored`);
          if (resourcesRestored > 0) parts.push(`resources restored`);
          summary = `Long rest — ${parts.join(", ")}`;

          // Write spellcasting + resources in the same character.update below.
          await tx.character.update({
            where: { id: characterId },
            data: {
              spellcasting: {
                slotsUsed: spellState.slotsUsed,
                spells: spellState.spells,
              } as unknown as Prisma.InputJsonValue,
              resources: serializeResourcesState(resourceState),
            },
          });

          // Include spellcasting + resources in the before/after snapshot for undo.
          (eventData as Record<string, unknown>).beforeSpellState = beforeSpellState;
          (eventData as Record<string, unknown>).beforeResourceState = beforeResourceState;
          break;
        }

        case "levelUp": {
          const derivedLevel = levelForExperience(row.experiencePoints);
          if (hd.total >= derivedLevel) {
            throw new InvalidHitPointOperationError(
              `No pending level-up: already at level ${hd.total} (XP derives level ${derivedLevel})`
            );
          }
          if (op.method === "roll") {
            if (op.roll === undefined || op.roll < 1 || op.roll > faces) {
              throw new InvalidHitPointOperationError(
                `Roll for level-up must be between 1 and ${faces} (got ${String(op.roll)})`
              );
            }
          }
          const gain = levelUpHpGain(faces, conMod, op.method, op.roll);
          hd.total += 1;
          hp.max += gain;
          hp.current += gain;

          // Repair the position-0 class entry's `level` to match the newly-applied
          // total. The seed defaults all entries to level 1 even for level-7 chars;
          // this self-heals that on the first real level-up.
          if (primaryEntry) {
            await tx.characterClassEntry.update({
              where: { id: primaryEntry.id },
              data: { level: hd.total },
            });
          }

          // Store enough data to exactly reverse this level-up later (Phase 4
          // undo) or when XP is lowered (auto-reverse in experience-ops.ts).
          eventData = {
            method: op.method,
            roll: op.roll ?? null,
            conMod,
            faces,
            hpGain: gain,
            primaryEntryId: primaryEntry?.id ?? null,
            prevEntryLevel: beforeClassLevel,
            newEntryLevel: hd.total,
          };
          summary = `Leveled up to ${hd.total} (+${gain} HP)`;
          break;
        }

        case "deathSave": {
          if (hp.current !== 0) {
            throw new InvalidHitPointOperationError(
              "Can only roll a death save when at 0 HP (unconscious/dying)"
            );
          }
          if (op.roll < 1 || op.roll > 20) {
            throw new InvalidHitPointOperationError(
              "Death save roll must be between 1 and 20"
            );
          }
          const result = applyDeathSaveRoll(hp.deathSaves, hp.current, op.roll);
          hp.deathSaves = result.deathSaves;
          hp.current = result.current;
          eventData = { roll: op.roll };
          const ds = hp.deathSaves;
          summary = op.roll === 20
            ? `Death save: natural 20 — regained consciousness`
            : `Death save: rolled ${op.roll} (${ds.successes} success${ds.successes !== 1 ? "es" : ""}, ${ds.failures} failure${ds.failures !== 1 ? "s" : ""})`;
          break;
        }

        case "stabilize": {
          if (hp.current !== 0) {
            throw new InvalidHitPointOperationError(
              "Can only stabilize when at 0 HP (unconscious/dying)"
            );
          }
          hp.deathSaves = { successes: 0, failures: 0 };
          eventData = {};
          summary = "Stabilized";
          break;
        }
      }

      await tx.character.update({
        where: { id: characterId },
        data: {
          hitPoints: hp as unknown as Prisma.InputJsonValue,
          hitDice: hd as unknown as Prisma.InputJsonValue,
        },
      });

      // Build the before/after sub-state snapshots. levelUp also captures the
      // class-entry level because the op mutates that outside the JSON columns.
      // longRest captures spellcasting so undoing it re-expends the slots.
      const beforeState: Record<string, unknown> = { hitPoints: beforeHp, hitDice: beforeHd };
      const afterState: Record<string, unknown> = { hitPoints: { ...hp }, hitDice: { ...hd } };
      if (op.type === "levelUp") {
        beforeState.classEntryLevel = beforeClassLevel;
        afterState.classEntryLevel = hd.total;
      }
      if (op.type === "longRest") {
        const data = eventData as Record<string, unknown>;
        beforeState.spellcasting = data.beforeSpellState;
        afterState.spellcasting = { slotsUsed: {} };
        delete data.beforeSpellState; // don't duplicate in eventData
        if (data.beforeResourceState !== undefined) {
          beforeState.resources = data.beforeResourceState;
          afterState.resources = data.beforeResourceState; // populated by rest handler
          delete data.beforeResourceState;
        }
      }
      if (op.type === "shortRest") {
        const data = eventData as Record<string, unknown>;
        if (data.beforeResourceState !== undefined) {
          beforeState.resources = data.beforeResourceState;
          delete data.beforeResourceState;
        }
      }

      await logEvent(tx, {
        characterId,
        category: "hitPoints",
        type: op.type,
        summary,
        before: beforeState,
        after: afterState,
        data: eventData,
        batchId,
      });
    }
  });
}
