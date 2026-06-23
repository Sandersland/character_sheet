/**
 * Conditions transaction handler — the analog to lib/resources.ts for tracking
 * a character's active status conditions (prone, poisoned, stunned, …) plus a
 * single 0–6 exhaustion level.
 *
 * What is persisted (Character.conditions JSON column):
 *   - `active`: list of ConditionEntry — one per applied standard 5e condition,
 *     boolean presence (deduped by key). Carries provenance (source) + appliedAt.
 *   - `exhaustion`: a single 0–6 numeric level (special case, not in `active`).
 *
 * Nothing here is derived from level/class — conditions are pure mutable state.
 * The canonical condition rules data (labels/descriptions) lives in srd.ts.
 * Concentration is intentionally separate (tracked in spellcasting).
 */

import { randomUUID } from "node:crypto";

import { Prisma } from "../generated/prisma/client.js";
import { logEvent } from "./events.js";
import { prisma } from "./prisma.js";
import { getActiveSessionId } from "./sessions.js";
import {
  CONDITIONS,
  EXHAUSTION_MAX,
  isKnownCondition,
  type ConditionKey,
} from "./srd.js";

// ── Error class ───────────────────────────────────────────────────────────────

export class InvalidConditionOperationError extends Error {}

// ── Canonical mutable state shape ─────────────────────────────────────────────

/** One applied standard 5e condition. Boolean presence — deduped by `key`. */
export interface ConditionEntry {
  key: ConditionKey;
  /** Optional provenance, e.g. "Hold Person", "Grappled by ogre". */
  source?: string;
  /** ISO timestamp recorded at apply time (informational). */
  appliedAt: string;
}

export interface ConditionsMutableState {
  active: ConditionEntry[];
  /** Exhaustion level, 0–6 (6 = death). Special case, not part of `active`. */
  exhaustion: number;
}

// ── Normalizer ────────────────────────────────────────────────────────────────
// Tolerant of null (character has never had a condition) and of stale/unknown
// keys (dropped). Mirror of normalizeResourcesMutable. Exhaustion clamped 0–6.

export function normalizeConditionsMutable(json: Prisma.JsonValue): ConditionsMutableState {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { active: [], exhaustion: 0 };
  }
  const obj = json as Record<string, unknown>;
  const rawActive = Array.isArray(obj.active) ? (obj.active as unknown[]) : [];

  const active: ConditionEntry[] = [];
  const seen = new Set<string>();
  for (const raw of rawActive) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const key = entry.key;
    // Drop unknown keys (clamp-on-read) and dedupe by key.
    if (typeof key !== "string" || !isKnownCondition(key) || seen.has(key)) continue;
    seen.add(key);
    active.push({
      key,
      source: typeof entry.source === "string" ? entry.source : undefined,
      appliedAt: typeof entry.appliedAt === "string" ? entry.appliedAt : new Date(0).toISOString(),
    });
  }

  const exhaustion = Math.min(
    EXHAUSTION_MAX,
    Math.max(0, Math.trunc(Number(obj.exhaustion ?? 0))),
  );

  return { active, exhaustion };
}

/**
 * Serializes the full mutable conditions state to the shape written to
 * Character.conditions. Route every update through this helper so all keys
 * round-trip.
 */
export function serializeConditionsState(state: ConditionsMutableState): Prisma.InputJsonValue {
  return {
    active: state.active.map((e) => ({
      key: e.key,
      source: e.source ?? null,
      appliedAt: e.appliedAt,
    })),
    exhaustion: state.exhaustion,
  } as unknown as Prisma.InputJsonValue;
}

// ── Operation types ───────────────────────────────────────────────────────────

/** Apply (add) a standard 5e status condition. No-op-error if already present. */
export interface ApplyConditionOperation {
  type: "applyCondition";
  key: ConditionKey;
  source?: string;
}

/** Remove a standard 5e status condition by key. */
export interface RemoveConditionOperation {
  type: "removeCondition";
  key: ConditionKey;
}

/** Set exhaustion to an absolute level (0–6). */
export interface SetExhaustionOperation {
  type: "setExhaustion";
  level: number;
}

export type ConditionOperation =
  | ApplyConditionOperation
  | RemoveConditionOperation
  | SetExhaustionOperation;

// ── Helpers ───────────────────────────────────────────────────────────────────

function deepCopy(state: ConditionsMutableState): { conditions: ConditionsMutableState } {
  return {
    conditions: {
      active: state.active.map((e) => ({ ...e })),
      exhaustion: state.exhaustion,
    },
  };
}

function conditionLabel(key: ConditionKey): string {
  return CONDITIONS.find((c) => c.key === key)?.label ?? key;
}

// ── Transaction handler ───────────────────────────────────────────────────────

/**
 * Applies a batch of condition operations atomically in one Prisma transaction.
 * Mirrors applyResourceOperations exactly:
 *   - one batchId groups all ops in this request on the activity timeline
 *   - any throw rolls back the entire batch (state unchanged)
 *   - CharacterEvent logged per op with full before/after conditions snapshot
 *     for revert symmetry with the resources/spellcasting undo handler
 *   - state is re-read per op so a batch of multiple ops sees each prior result
 */
export async function applyConditionsOperations(
  characterId: string,
  operations: ConditionOperation[],
): Promise<void> {
  const batchId = randomUUID();
  const sessionId = await getActiveSessionId(characterId);

  await prisma.$transaction(async (tx) => {
    for (const op of operations) {
      // Re-read per-op so a batch sees each previous op's result.
      const row = await tx.character.findUnique({
        where: { id: characterId },
        select: { conditions: true },
      });
      if (!row) {
        throw new InvalidConditionOperationError(`Character not found: ${characterId}`);
      }

      const state = normalizeConditionsMutable(row.conditions);
      const beforeState = deepCopy(state);

      let summary = "";
      let eventType: "conditionApplied" | "conditionRemoved" | "exhaustionSet";
      let eventData: Record<string, unknown> = {};

      switch (op.type) {
        case "applyCondition": {
          if (!isKnownCondition(op.key)) {
            throw new InvalidConditionOperationError(`Unknown condition: ${op.key}`);
          }
          if (state.active.some((e) => e.key === op.key)) {
            throw new InvalidConditionOperationError(
              `Condition already active: ${conditionLabel(op.key)}`,
            );
          }
          const entry: ConditionEntry = {
            key: op.key,
            source: op.source,
            appliedAt: new Date().toISOString(),
          };
          state.active.push(entry);
          eventType = "conditionApplied";
          summary = op.source
            ? `Applied condition: ${conditionLabel(op.key)} (${op.source})`
            : `Applied condition: ${conditionLabel(op.key)}`;
          eventData = { key: op.key, source: op.source ?? null };
          break;
        }

        case "removeCondition": {
          const idx = state.active.findIndex((e) => e.key === op.key);
          if (idx === -1) {
            throw new InvalidConditionOperationError(
              `Condition not active: ${conditionLabel(op.key)}`,
            );
          }
          state.active.splice(idx, 1);
          eventType = "conditionRemoved";
          summary = `Removed condition: ${conditionLabel(op.key)}`;
          eventData = { key: op.key };
          break;
        }

        case "setExhaustion": {
          if (!Number.isInteger(op.level)) {
            throw new InvalidConditionOperationError("setExhaustion: level must be an integer");
          }
          if (op.level < 0 || op.level > EXHAUSTION_MAX) {
            throw new InvalidConditionOperationError(
              `setExhaustion: level must be between 0 and ${EXHAUSTION_MAX}`,
            );
          }
          const previous = state.exhaustion;
          state.exhaustion = op.level;
          eventType = "exhaustionSet";
          summary = `Set exhaustion to level ${op.level}`;
          eventData = { level: op.level, previous };
          break;
        }
      }

      await tx.character.update({
        where: { id: characterId },
        data: { conditions: serializeConditionsState(state) },
      });

      const afterState = deepCopy(state);

      await logEvent(tx, {
        characterId,
        category: "conditions",
        type: eventType!,
        summary: summary!,
        before: beforeState,
        after: afterState,
        data: eventData,
        batchId,
        sessionId,
      });
    }
  });
}
