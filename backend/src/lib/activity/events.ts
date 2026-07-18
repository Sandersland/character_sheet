import { Prisma } from "@/generated/prisma/client.js";

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
  | "conditions"
  | "effects"
  | "roll";

export type EventType =
  // inventory
  | "acquired"
  | "consumed"
  | "sold"
  | "bought"
  | "removed"
  // DM campaign-item award/revoke (#381) — inventory-category, undoable
  | "awarded"
  | "revoked"
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
  | "castDiscipline"
  | "castManeuver"
  | "castShadowArt"
  | "castChannelDivinity"
  | "learnToolProficiency"
  | "forgetToolProficiency"
  | "toolProficienciesReconciled"
  | "learnSubclassChoice"
  | "forgetSubclassChoice"
  | "subclassChoicesReconciled"
  // advancement (ASI + feats)
  | "abilityScoreImprovement"
  | "featTaken"
  | "advancementRemoved"
  | "advancementsReconciled"
  // inventory (equip/unequip logged for timeline + undo)
  | "equipped"
  | "unequipped"
  // inventory attunement (#545)
  | "attuned"
  | "unattuned"
  // inventory activated effects (#543)
  | "activated"
  | "deactivated"
  | "activatedRecharged"
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
  // effects (active buffs)
  | "buffApplied"
  | "buffCleared"
  // roll events (rolls logged from session UI — non-undoable)
  | "attackRoll"
  | "damageRoll"
  | "checkRoll"
  | "saveRoll"
  | "initiativeRoll"
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

type DiffField = {
  path: string;
  oldValue: Prisma.InputJsonValue | null;
  newValue: Prisma.InputJsonValue | null;
};

/** A recurse-able node: a non-null, non-array object whose keys we walk. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Emit an atomic (non-recursed) change for one leaf, or nothing if unchanged.
 * Covers primitives, arrays, and null; arrays compare deeply via JSON so a
 * reordered/extended array reads as one change at its own path.
 */
function diffLeaf(path: string, oldVal: unknown, newVal: unknown): DiffField[] {
  const normalizedOld = oldVal === undefined ? null : oldVal;
  const normalizedNew = newVal === undefined ? null : newVal;
  if (JSON.stringify(normalizedOld) === JSON.stringify(normalizedNew)) return [];
  return [{
    path,
    oldValue: normalizedOld as Prisma.InputJsonValue | null,
    newValue: normalizedNew as Prisma.InputJsonValue | null,
  }];
}

/**
 * Recursively walks `before` and `after`, returning one entry per changed
 * leaf. Arrays are treated as atomic (compared as-is rather than element-
 * by-element) to keep paths readable (e.g. "rolls" rather than "rolls.0").
 */
export function diffToFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  prefix = ""
): DiffField[] {
  const b = before ?? {};
  const a = after ?? {};
  const result: DiffField[] = [];

  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    const path = prefix ? `${prefix}.${key}` : key;
    const oldVal = b[key];
    const newVal = a[key];
    // Recurse into plain nested objects; everything else is an atomic leaf.
    if (isPlainObject(oldVal) && isPlainObject(newVal)) {
      result.push(...diffToFields(oldVal, newVal, path));
    } else {
      result.push(...diffLeaf(path, oldVal, newVal));
    }
  }

  return result;
}

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
