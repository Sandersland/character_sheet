/**
 * Conditions transaction handler — the analog to applyResourceOperations for tracking
 * a character's active status conditions (prone, poisoned, stunned, …) plus a
 * single 0–6 exhaustion level.
 *
 * What is persisted (Character.conditions JSON column):
 *   - `active`: list of ConditionEntry — one per applied standard 5e condition,
 *     boolean presence (deduped by key). Carries provenance (source) + appliedAt.
 *   - `exhaustion`: a single 0–6 numeric level (special case, not in `active`).
 *
 * Nothing here is derived from level/class — conditions are pure mutable state.
 * The canonical condition rules data (labels/descriptions) lives in srd/srd.ts.
 * Concentration is intentionally separate (tracked in spellcasting).
 */

import type {
  ApplyConditionOperation,
  ConditionOperation,
  RemoveConditionOperation,
  SetExhaustionOperation,
} from "@character-sheet/contracts";
import type { RulesEdition } from "@character-sheet/shared-types";

import { Prisma } from "@/generated/prisma/client.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience } from "@/lib/leveling/experience.js";
import {
  CONDITIONS,
  EXHAUSTION_MAX,
  deriveFeatBonuses,
  isKnownCondition,
  type ConditionKey,
} from "@/lib/srd/srd.js";
import {
  effectiveMaxHitPoints,
  inCapAdvancementsAt,
  normalizeHitDice,
  normalizeHitPoints,
  type HitDice,
  type HitPoints,
} from "./hp-core.js";

export class InvalidConditionOperationError extends Error {}

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

/**
 * Apply a condition inside a caller-supplied transaction, sharing its batchId so
 * batch revert restores conditions. Idempotent: a no-op (no event) when already
 * present. Lets an activated ability (e.g. Channel Divinity: Cloak of Shadows)
 * self-apply a condition without opening its own transaction.
 */
export async function applyConditionInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  key: ConditionKey,
  source: string,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: { conditions: true },
  });
  if (!row) return;

  const state = normalizeConditionsMutable(row.conditions);
  if (state.active.some((e) => e.key === key)) return;
  const before = deepCopy(state);
  state.active.push({ key, source, appliedAt: new Date().toISOString() });

  await tx.character.update({
    where: { id: characterId },
    data: { conditions: serializeConditionsState(state) },
  });

  await logEvent(tx, {
    characterId,
    category: "conditions",
    type: "conditionApplied",
    summary: `Applied condition: ${conditionLabel(key)} (${source})`,
    before,
    after: deepCopy(state),
    data: { key, source },
    batchId,
    sessionId,
  });
}

/**
 * Applies a batch of condition operations atomically in one Prisma transaction.
 * Mirrors applyResourceOperations exactly:
 *   - one batchId groups all ops in this request on the activity timeline
 *   - any throw rolls back the entire batch (state unchanged)
 *   - CharacterEvent logged per op with full before/after conditions snapshot
 *     for revert symmetry with the resources/spellcasting undo handler
 *   - state is re-read per op so a batch of multiple ops sees each prior result
 */
// Validates + applies one condition op to `state` (mutated in place) and returns
// the audit-event fields (type/summary/data) it produced. Splitting this off the
// transaction closure keeps applyConditionsOperations a thin normalize → resolve
// → persist → log pipeline; the strings/data here are byte-identical to before
// (the audit payloads feed LIFO undo).
type ConditionEventType = "conditionApplied" | "conditionRemoved" | "exhaustionSet";
type ConditionResolution = { eventType: ConditionEventType; summary: string; eventData: Record<string, unknown> };

function resolveApplyCondition(state: ConditionsMutableState, op: ApplyConditionOperation): ConditionResolution {
  if (!isKnownCondition(op.key)) {
    throw new InvalidConditionOperationError(`Unknown condition: ${op.key}`);
  }
  if (state.active.some((e) => e.key === op.key)) {
    throw new InvalidConditionOperationError(`Condition already active: ${conditionLabel(op.key)}`);
  }
  const entry: ConditionEntry = { key: op.key, source: op.source, appliedAt: new Date().toISOString() };
  state.active.push(entry);
  return {
    eventType: "conditionApplied",
    summary: op.source
      ? `Applied condition: ${conditionLabel(op.key)} (${op.source})`
      : `Applied condition: ${conditionLabel(op.key)}`,
    eventData: { key: op.key, source: op.source ?? null },
  };
}

function resolveRemoveCondition(state: ConditionsMutableState, op: RemoveConditionOperation): ConditionResolution {
  const idx = state.active.findIndex((e) => e.key === op.key);
  if (idx === -1) {
    throw new InvalidConditionOperationError(`Condition not active: ${conditionLabel(op.key)}`);
  }
  state.active.splice(idx, 1);
  return {
    eventType: "conditionRemoved",
    summary: `Removed condition: ${conditionLabel(op.key)}`,
    eventData: { key: op.key },
  };
}

// #1321: hp-max inputs a setExhaustion resolution needs to enforce the
// one-way clamp (decision 4) — the same featMaxHpBonus/edition composition
// buildHpOpContext assembles, gathered here independently (conditions.ts has
// no HpOpContext of its own) via the same shared rule functions.
interface ExhaustionHpClampInputs {
  hp: HitPoints;
  featMaxHpBonus: number;
  edition: RulesEdition;
}

function resolveSetExhaustion(
  state: ConditionsMutableState,
  op: SetExhaustionOperation,
  hpClamp: ExhaustionHpClampInputs,
): ConditionResolution & { hpAfter?: HitPoints } {
  if (!Number.isInteger(op.level)) {
    throw new InvalidConditionOperationError("setExhaustion: level must be an integer");
  }
  if (op.level < 0 || op.level > EXHAUSTION_MAX) {
    throw new InvalidConditionOperationError(`setExhaustion: level must be between 0 and ${EXHAUSTION_MAX}`);
  }
  const previous = state.exhaustion;
  state.exhaustion = op.level;

  // Decision 4 (#1321): raising exhaustion to ≥4 (PHB'14 p. 291 tier 4) halves
  // the effective max — current above it is not a legal state (PHB'14 p. 196,
  // "can be any number from the creature's hit point maximum down to 0"), so
  // this is a REAL, one-way write, carried in the event's before/after so LIFO
  // undo restores it. Dropping back below 4 does NOT hand the hit points back
  // (decision 5, PHB'14 p. 197 is a ceiling, never a floor) — that asymmetry
  // is exactly why this is a write and not a read-time-only Math.min.
  const { hp, featMaxHpBonus, edition } = hpClamp;
  const newEffMax = effectiveMaxHitPoints(hp.max, featMaxHpBonus, state.exhaustion, edition);
  const clampedCurrent = Math.min(hp.current, newEffMax);
  const hpAfter = clampedCurrent === hp.current ? undefined : { ...hp, current: clampedCurrent };

  return {
    eventType: "exhaustionSet",
    summary: `Set exhaustion to level ${op.level}`,
    eventData: { level: op.level, previous },
    hpAfter,
  };
}

// Validates + applies one condition op to `state` (mutated in place) and returns
// the audit-event fields it produced. One resolver per op-kind keeps each small;
// the strings/data are byte-identical to before (the payloads feed LIFO undo).
// `hpClamp` is only consumed by setExhaustion — the other two op kinds never
// touch HP and ignore it.
function resolveConditionOp(
  state: ConditionsMutableState,
  op: ConditionOperation,
  hpClamp: ExhaustionHpClampInputs,
): ConditionResolution & { hpAfter?: HitPoints } {
  switch (op.type) {
    case "applyCondition":
      return resolveApplyCondition(state, op);
    case "removeCondition":
      return resolveRemoveCondition(state, op);
    case "setExhaustion":
      return resolveSetExhaustion(state, op, hpClamp);
  }
}

// Columns/relations re-read per op (#1321 widened this from `{ conditions:
// true }` to also cover effectiveMaxHitPoints' inputs): hitPoints/hitDice for
// the HitPoints shape, resources + classEntries.class.extraAsiLevels +
// experiencePoints for the feat-slot-cap dance deriveFeatBonuses needs
// (mirrors buildHpOpContext's own select), and rulesEdition for the edition
// fork itself.
const CONDITIONS_SELECT = {
  conditions: true,
  hitPoints: true,
  hitDice: true,
  resources: true,
  experiencePoints: true,
  rulesEdition: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { level: true, class: { select: { extraAsiLevels: true } } },
  },
} satisfies Prisma.CharacterSelect;

/**
 * The full effectiveMaxHitPoints composition for a character ROW (#1321):
 * gather the in-cap feat-slot advancements, derive the feat max-HP bonus, and
 * pair it with the row's CURRENT exhaustion level and effective max. Lives
 * HERE rather than hp-core.ts (its natural home) because hp-core.ts's own
 * inCapAdvancementsAt/effectiveMaxHitPoints are imported BY this module —
 * hp-core.ts importing normalizeConditionsMutable back would be a direct
 * cycle. buildHpOpContext (hp-context.ts) and applyHealInTx (hp-in-tx.ts) both
 * call this instead of repeating the composition inline.
 */
export function effectiveMaxHitPointsForRow(row: {
  hitPoints: Prisma.JsonValue;
  hitDice: Prisma.JsonValue;
  resources: Prisma.JsonValue;
  conditions: Prisma.JsonValue;
  rulesEdition: RulesEdition;
  experiencePoints: number;
  classEntries: readonly { level: number; class: { extraAsiLevels: readonly number[] } | null }[];
}): { hp: HitPoints; hd: HitDice; featMaxHpBonus: number; exhaustionLevel: number; effMax: number } {
  const hp = normalizeHitPoints(row.hitPoints);
  const hd = normalizeHitDice(row.hitDice);
  const inCapAdvancements = inCapAdvancementsAt(row.resources, row.classEntries, levelForExperience(row.experiencePoints));
  const featMaxHpBonus = deriveFeatBonuses(inCapAdvancements, hd.total).maxHp;
  const exhaustionLevel = normalizeConditionsMutable(row.conditions).exhaustion;
  const effMax = effectiveMaxHitPoints(hp.max, featMaxHpBonus, exhaustionLevel, row.rulesEdition);
  return { hp, hd, featMaxHpBonus, exhaustionLevel, effMax };
}

export async function applyConditionsOperations(
  characterId: string,
  operations: ConditionOperation[],
): Promise<void> {
  await runCharacterTransaction<typeof CONDITIONS_SELECT, ConditionOperation>(characterId, operations, {
    select: CONDITIONS_SELECT,
    notFound: (id) => new InvalidConditionOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, row, op, batchId, sessionId }) => {
      const state = normalizeConditionsMutable(row.conditions);
      const beforeState = deepCopy(state);

      const { hp, featMaxHpBonus } = effectiveMaxHitPointsForRow(row);

      const { eventType, summary, eventData, hpAfter } = resolveConditionOp(state, op, {
        hp,
        featMaxHpBonus,
        edition: row.rulesEdition,
      });

      await tx.character.update({
        where: { id: characterId },
        data: {
          conditions: serializeConditionsState(state),
          ...(hpAfter ? { hitPoints: hpAfter as unknown as Prisma.InputJsonValue } : {}),
        },
      });

      const afterState = deepCopy(state);

      await logEvent(tx, {
        characterId,
        category: "conditions",
        type: eventType,
        summary,
        before: hpAfter ? { ...beforeState, hitPoints: hp } : beforeState,
        after: hpAfter ? { ...afterState, hitPoints: hpAfter } : afterState,
        data: eventData,
        batchId,
        sessionId,
      });
    },
  });
}
