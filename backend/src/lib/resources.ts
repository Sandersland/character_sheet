/**
 * Resource + maneuver transaction handler — the analog to lib/spellcasting.ts
 * for trackable class/subclass resources (superiority dice, ki, rage) and
 * known-maneuver lists.
 *
 * What is persisted: `used` counts per resource key and the `maneuversKnown`
 * snapshot array. What is derived at read time (in routes/characters.ts
 * serializeCharacter): pool totals, die size, recharge timing, maneuver
 * choice count — all via deriveResources() in src/lib/srd.ts.
 */

import { randomUUID } from "node:crypto";

import { Prisma } from "../generated/prisma/client.js";
import { proficiencyBonusForLevel, levelForExperience } from "./experience.js";
import { logEvent } from "./events.js";
import { prisma } from "./prisma.js";
import { deriveResources, isKnownTool, toolsByCategory } from "./srd.js";

// ── Error class ───────────────────────────────────────────────────────────────

export class InvalidResourceOperationError extends Error {}

// ── Canonical mutable state shape ─────────────────────────────────────────────
// Stored in Character.resources JSON column.
// `used`: resource key (string) → number of units currently spent.
// `maneuversKnown`: snapshot array of learned maneuvers; each entry has a
//   locally-generated `id` (the operation target), optional `maneuverId`
//   (catalog Maneuver.id provenance — null for custom maneuvers), and a
//   snapshot of name + description at learn time.

export interface ManeuverEntry {
  id: string;           // per-character entry UUID (operation target)
  maneuverId?: string;  // catalog Maneuver.id provenance — undefined for custom
  name: string;
  description: string;
}

/** A tool proficiency granted by a level-gated subclass feature (Student of War). */
export interface ToolProfEntry {
  id: string;   // per-character entry UUID (operation target)
  name: string; // matches a TOOLS entry name
}

export interface ResourcesMutableState {
  used: Record<string, number>;
  maneuversKnown: ManeuverEntry[];
  /** Level-gated tool proficiency choices (currently: Student of War). */
  toolProficienciesKnown: ToolProfEntry[];
}

// ── Normalizer ────────────────────────────────────────────────────────────────
// Tolerant of null (character has never used any resources) and future schema
// additions. Mirror of normalizeSpellcastingMutable.

export function normalizeResourcesMutable(json: Prisma.JsonValue): ResourcesMutableState {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { used: {}, maneuversKnown: [], toolProficienciesKnown: [] };
  }
  const obj = json as Record<string, unknown>;
  return {
    used: (obj.used as Record<string, number>) ?? {},
    maneuversKnown: (obj.maneuversKnown as ManeuverEntry[]) ?? [],
    toolProficienciesKnown: (obj.toolProficienciesKnown as ToolProfEntry[]) ?? [],
  };
}

/**
 * Serializes the full mutable resource state to the shape written to
 * Character.resources. Route every update through this helper so all keys
 * round-trip — required now that multiple level-gated lists share one column.
 */
export function serializeResourcesState(state: ResourcesMutableState): Prisma.InputJsonValue {
  return {
    used: state.used,
    maneuversKnown: state.maneuversKnown,
    toolProficienciesKnown: state.toolProficienciesKnown,
  } as unknown as Prisma.InputJsonValue;
}

// ── Operation types ───────────────────────────────────────────────────────────

/** Spend one or more units of a trackable resource (e.g. a superiority die). */
export interface SpendResourceOperation {
  type: "spendResource";
  key: string;     // resource key, e.g. "superiorityDice"
  amount?: number; // default 1
  /** Client-rolled die value (for superiority dice) — logged but not validated. */
  roll?: number;
}

/** Restore one or more units of a spent resource (undo mis-click or Relentless). */
export interface RestoreResourceOperation {
  type: "restoreResource";
  key: string;
  amount?: number; // default 1
}

/** Learn a maneuver from catalog (maneuverId) or add a custom one. */
export interface LearnManeuverOperation {
  type: "learnManeuver";
  maneuverId?: string;  // catalog Maneuver.id
  custom?: { name: string; description: string };
}

/** Remove a known maneuver by its per-character entry id. */
export interface ForgetManeuverOperation {
  type: "forgetManeuver";
  entryId: string;
}

/**
 * Learn an artisan's-tool proficiency from the Student of War feature.
 * `name` must match a TOOLS entry with category "artisan".
 */
export interface LearnToolProficiencyOperation {
  type: "learnToolProficiency";
  name: string; // must match TOOLS[].name where category === "artisan"
}

/** Remove a subclass-granted tool proficiency by its per-character entry id. */
export interface ForgetToolProficiencyOperation {
  type: "forgetToolProficiency";
  entryId: string;
}

export type ResourceOperation =
  | SpendResourceOperation
  | RestoreResourceOperation
  | LearnManeuverOperation
  | ForgetManeuverOperation
  | LearnToolProficiencyOperation
  | ForgetToolProficiencyOperation;

// ── Transaction handler ───────────────────────────────────────────────────────

/**
 * Applies a batch of resource operations atomically in one Prisma transaction.
 * Mirrors applySpellcastingOperations exactly:
 *   - one batchId groups all ops in this request on the activity timeline
 *   - any throw rolls back the entire batch (state unchanged)
 *   - CharacterEvent logged per op with full before/after resource snapshot
 *     for revert symmetry with the HP/XP undo handler
 *   - state is re-read per op so a batch of multiple spends sees each prior result
 */
export async function applyResourceOperations(
  characterId: string,
  operations: ResourceOperation[]
): Promise<void> {
  const batchId = randomUUID();

  await prisma.$transaction(async (tx) => {
    for (const op of operations) {
      // Re-read per-op so a batch sees each previous op's result.
      const row = await tx.character.findUnique({
        where: { id: characterId },
        select: {
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
        throw new InvalidResourceOperationError(`Character not found: ${characterId}`);
      }

      const level = levelForExperience(row.experiencePoints);
      const profBonus = proficiencyBonusForLevel(level);
      const primaryEntry = row.classEntries[0];
      const className = primaryEntry?.name ?? "";
      const subclass = primaryEntry?.subclass ?? undefined;
      const abilityScores = row.abilityScores as Record<string, number>;
      const derivedInfo = deriveResources(className, subclass, level, abilityScores, profBonus);

      const state = normalizeResourcesMutable(row.resources);
      // Deep-copy for before snapshot.
      const beforeState = {
        resources: {
          used: { ...state.used },
          maneuversKnown: state.maneuversKnown.map((m) => ({ ...m })),
          toolProficienciesKnown: state.toolProficienciesKnown.map((t) => ({ ...t })),
        },
      };

      let summary = "";
      let eventType: string;
      let eventData: Record<string, unknown> = {};

      switch (op.type) {
        case "spendResource": {
          const amount = op.amount ?? 1;
          if (amount <= 0) {
            throw new InvalidResourceOperationError("spendResource: amount must be positive");
          }
          const pool = derivedInfo?.resources.find((r) => r.key === op.key);
          if (!pool) {
            throw new InvalidResourceOperationError(
              `Resource "${op.key}" not available for this character's subclass`
            );
          }
          const used = state.used[op.key] ?? 0;
          if (used + amount > pool.total) {
            throw new InvalidResourceOperationError(
              `Cannot spend ${amount} ${pool.label}: only ${pool.total - used} remaining`
            );
          }
          state.used[op.key] = used + amount;
          eventType = "spendResource";
          const remaining = pool.total - state.used[op.key];
          summary = op.roll !== undefined
            ? `Spent ${amount} ${pool.label} (rolled ${pool.die}: ${op.roll}) — ${remaining}/${pool.total} remaining`
            : `Spent ${amount} ${pool.label} — ${remaining}/${pool.total} remaining`;
          eventData = { key: op.key, amount, roll: op.roll ?? null, remaining };
          break;
        }

        case "restoreResource": {
          const amount = op.amount ?? 1;
          if (amount <= 0) {
            throw new InvalidResourceOperationError("restoreResource: amount must be positive");
          }
          const pool = derivedInfo?.resources.find((r) => r.key === op.key);
          if (!pool) {
            throw new InvalidResourceOperationError(
              `Resource "${op.key}" not available for this character's subclass`
            );
          }
          const used = state.used[op.key] ?? 0;
          if (used - amount < 0) {
            throw new InvalidResourceOperationError(
              `Cannot restore ${amount} ${pool.label}: only ${used} are spent`
            );
          }
          state.used[op.key] = used - amount;
          eventType = "restoreResource";
          const newUsed = state.used[op.key];
          summary = `Restored ${amount} ${pool.label} — ${pool.total - newUsed}/${pool.total} remaining`;
          eventData = { key: op.key, amount };
          break;
        }

        case "learnManeuver": {
          if (Boolean(op.maneuverId) === Boolean(op.custom)) {
            throw new InvalidResourceOperationError(
              "learnManeuver: provide exactly one of maneuverId or custom"
            );
          }

          // Enforce choice count limit.
          const choiceCount = derivedInfo?.maneuverChoiceCount;
          if (choiceCount !== undefined && state.maneuversKnown.length >= choiceCount) {
            throw new InvalidResourceOperationError(
              `Cannot learn more maneuvers: already know ${state.maneuversKnown.length}/${choiceCount}`
            );
          }

          let newEntry: ManeuverEntry;

          if (op.maneuverId) {
            // Dedup check.
            if (state.maneuversKnown.some((m) => m.maneuverId === op.maneuverId)) {
              throw new InvalidResourceOperationError(
                `Maneuver already known (maneuverId: ${op.maneuverId})`
              );
            }
            const catalogManeuver = await tx.maneuver.findUnique({ where: { id: op.maneuverId } });
            if (!catalogManeuver) {
              throw new InvalidResourceOperationError(
                `Maneuver not found in catalog: ${op.maneuverId}`
              );
            }
            newEntry = {
              id: randomUUID(),
              maneuverId: catalogManeuver.id,
              name: catalogManeuver.name,
              description: catalogManeuver.description,
            };
          } else {
            const custom = op.custom!;
            newEntry = {
              id: randomUUID(),
              name: custom.name,
              description: custom.description,
            };
          }

          state.maneuversKnown.push(newEntry);
          eventType = "learnManeuver";
          summary = `Learned maneuver: ${newEntry.name}`;
          eventData = {
            entryId: newEntry.id,
            maneuverName: newEntry.name,
            maneuverId: newEntry.maneuverId ?? null,
          };
          break;
        }

        case "forgetManeuver": {
          const idx = state.maneuversKnown.findIndex((m) => m.id === op.entryId);
          if (idx === -1) {
            throw new InvalidResourceOperationError(
              `Maneuver entry not found: ${op.entryId}`
            );
          }
          const forgotten = state.maneuversKnown[idx];
          state.maneuversKnown.splice(idx, 1);
          eventType = "forgetManeuver";
          summary = `Forgot maneuver: ${forgotten.name}`;
          eventData = { entryId: op.entryId, maneuverName: forgotten.name };
          break;
        }

        case "learnToolProficiency": {
          // Validate the name is a known artisan's tool.
          const artisanTools = toolsByCategory("artisan");
          if (!artisanTools.some((t) => t.name === op.name)) {
            throw new InvalidResourceOperationError(
              `"${op.name}" is not a known artisan's tool. Student of War only grants proficiency with artisan's tools.`
            );
          }
          if (!isKnownTool(op.name)) {
            throw new InvalidResourceOperationError(`Unknown tool: ${op.name}`);
          }

          // Enforce choice count limit (Student of War = 1).
          const toolChoiceCount = derivedInfo?.toolProfChoiceCount;
          if (toolChoiceCount !== undefined && state.toolProficienciesKnown.length >= toolChoiceCount) {
            throw new InvalidResourceOperationError(
              `Cannot learn more tool proficiencies: already know ${state.toolProficienciesKnown.length}/${toolChoiceCount} via subclass`
            );
          }

          // Dedup check.
          if (state.toolProficienciesKnown.some((t) => t.name === op.name)) {
            throw new InvalidResourceOperationError(
              `Tool proficiency already known: ${op.name}`
            );
          }

          const newToolEntry: ToolProfEntry = { id: randomUUID(), name: op.name };
          state.toolProficienciesKnown.push(newToolEntry);
          eventType = "learnToolProficiency";
          summary = `Learned tool proficiency: ${op.name} (Student of War)`;
          eventData = { entryId: newToolEntry.id, toolName: op.name };
          break;
        }

        case "forgetToolProficiency": {
          const toolIdx = state.toolProficienciesKnown.findIndex((t) => t.id === op.entryId);
          if (toolIdx === -1) {
            throw new InvalidResourceOperationError(
              `Tool proficiency entry not found: ${op.entryId}`
            );
          }
          const forgottenTool = state.toolProficienciesKnown[toolIdx];
          state.toolProficienciesKnown.splice(toolIdx, 1);
          eventType = "forgetToolProficiency";
          summary = `Forgot tool proficiency: ${forgottenTool.name}`;
          eventData = { entryId: op.entryId, toolName: forgottenTool.name };
          break;
        }
      }

      // Write the updated state back — always via serializeResourcesState so
      // all keys round-trip (prevents clobbering toolProficienciesKnown when
      // updating maneuversKnown and vice-versa).
      await tx.character.update({
        where: { id: characterId },
        data: { resources: serializeResourcesState(state) },
      });

      const afterState = {
        resources: {
          used: { ...state.used },
          maneuversKnown: state.maneuversKnown.map((m) => ({ ...m })),
          toolProficienciesKnown: state.toolProficienciesKnown.map((t) => ({ ...t })),
        },
      };

      await logEvent(tx, {
        characterId,
        category: "resources",
        type: eventType! as Parameters<typeof logEvent>[1]["type"],
        summary: summary!,
        before: beforeState,
        after: afterState,
        data: eventData,
        batchId,
      });
    }
  });
}
