import { Prisma } from "../generated/prisma/client.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type EventCategory =
  | "inventory"
  | "hitPoints"
  | "experience"
  | "currency"
  | "spellcasting"
  | "class"
  | "resources"
  | "advancement"
  | "session"
  | "combat"
  | "conditions";

export type EventType =
  // inventory
  | "acquired"
  | "consumed"
  | "sold"
  | "bought"
  | "removed"
  // hitPoints
  | "damage"
  | "heal"
  | "setTemp"
  | "shortRest"
  | "longRest"
  | "levelUp"
  | "levelDown"
  | "deathSave"
  | "stabilize"
  // experience
  | "xpAward"
  | "xpSet"
  // currency
  | "currencyAdjust"
  // spellcasting
  | "castSpell"
  | "expendSlot"
  | "restoreSlot"
  | "learnSpell"
  | "forgetSpell"
  | "prepareSpell"
  | "unprepareSpell"
  | "concentrationDropped"
  // class
  | "classAdded"
  | "subclassChosen"
  | "subclassRemoved"
  | "fightingStyleChosen"
  | "fightingStyleRemoved"
  | "classLevelsReconciled"
  // resources
  | "spendResource"
  | "restoreResource"
  | "learnManeuver"
  | "forgetManeuver"
  | "maneuversReconciled"
  | "learnDiscipline"
  | "forgetDiscipline"
  | "swapDiscipline"
  | "disciplinesReconciled"
  | "learnToolProficiency"
  | "forgetToolProficiency"
  | "toolProficienciesReconciled"
  // advancement (ASI + feats)
  | "abilityScoreImprovement"
  | "featTaken"
  | "advancementRemoved"
  | "advancementsReconciled"
  // inventory (equip/unequip logged for timeline + undo)
  | "equipped"
  | "unequipped"
  // session lifecycle
  | "sessionStarted"
  | "sessionEnded"
  // combat lifecycle
  | "combatStarted"
  | "combatEnded"
  | "combatRoundAdvanced"
  // conditions
  | "conditionApplied"
  | "conditionRemoved"
  | "exhaustionSet"
  // roll events (attack/damage logged from session UI)
  | "attackRoll"
  | "damageRoll"
  // meta
  | "revert";

export interface LogEventParams {
  characterId: string;
  category: EventCategory;
  type: EventType;
  /** Human-readable description, e.g. "Leveled up to 7 (+9 HP)". Stored at
   *  write time so the timeline reads correctly even if semantics change. */
  summary: string;
  /** Polymorphic soft-reference — no FK. entityType = "InventoryItem", etc. */
  entityType?: string;
  entityId?: string | null;
  /** Sub-state snapshot before the op (drives undo and field-level diff). */
  before?: Record<string, unknown> | null;
  /** Sub-state snapshot after the op. */
  after?: Record<string, unknown> | null;
  /** Op-specific inputs not derivable from before/after alone. */
  data?: Record<string, unknown> | null;
  batchId?: string;
  actor?: string;
  /** FK to the play session during which this event occurred. Null for
   *  out-of-session events (shopping, level-ups on the reference sheet). */
  sessionId?: string | null;
}

// ── diffToFields ─────────────────────────────────────────────────────────────

/**
 * Recursively walks `before` and `after`, returning one entry per changed
 * leaf. Arrays are treated as atomic (compared as-is rather than element-
 * by-element) to keep paths readable (e.g. "rolls" rather than "rolls.0").
 */
export function diffToFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  prefix = ""
): Array<{ path: string; oldValue: Prisma.InputJsonValue | null; newValue: Prisma.InputJsonValue | null }> {
  const result: Array<{
    path: string;
    oldValue: Prisma.InputJsonValue | null;
    newValue: Prisma.InputJsonValue | null;
  }> = [];

  const b = before ?? {};
  const a = after ?? {};
  const allKeys = new Set([...Object.keys(b), ...Object.keys(a)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const oldVal = b[key];
    const newVal = a[key];

    // Recurse into plain nested objects (not arrays, not null)
    if (
      oldVal !== null &&
      typeof oldVal === "object" &&
      !Array.isArray(oldVal) &&
      newVal !== null &&
      typeof newVal === "object" &&
      !Array.isArray(newVal)
    ) {
      result.push(
        ...diffToFields(
          oldVal as Record<string, unknown>,
          newVal as Record<string, unknown>,
          path
        )
      );
    } else {
      // Simple value comparison (covers primitives, arrays, null, undefined)
      const normalizedOld = oldVal === undefined ? null : oldVal;
      const normalizedNew = newVal === undefined ? null : newVal;
      // JSON.stringify for deep equality on arrays / null
      if (JSON.stringify(normalizedOld) !== JSON.stringify(normalizedNew)) {
        result.push({
          path,
          oldValue: normalizedOld as Prisma.InputJsonValue | null,
          newValue: normalizedNew as Prisma.InputJsonValue | null,
        });
      }
    }
  }

  return result;
}

// ── logEvent ─────────────────────────────────────────────────────────────────

/**
 * Writes one `CharacterEvent` row and its derived `CharacterEventField` rows
 * (field-level diff from before→after) inside the caller's transaction.
 *
 * Always call within a `prisma.$transaction` — this is intentionally NOT a
 * standalone function so the event is atomic with the state change it records.
 */
export async function logEvent(
  tx: Prisma.TransactionClient,
  params: LogEventParams
): Promise<void> {
  const fieldDiffs = diffToFields(params.before, params.after);

  await tx.characterEvent.create({
    data: {
      characterId: params.characterId,
      category: params.category as Parameters<typeof tx.characterEvent.create>[0]["data"]["category"],
      type: params.type as Parameters<typeof tx.characterEvent.create>[0]["data"]["type"],
      summary: params.summary,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      before: (params.before ?? null) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      after: (params.after ?? null) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      data: (params.data ?? null) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      actor: params.actor ?? "player",
      batchId: params.batchId ?? null,
      sessionId: params.sessionId ?? null,
      fields: {
        create: fieldDiffs.map((f) => ({
          path: f.path,
          oldValue: (f.oldValue ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
          newValue: (f.newValue ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
        })),
      },
    },
  });
}
