import {
  CharacterEvent,
  CharacterEventCategory,
  CharacterEventType,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client.js";
import {
  InsufficientCurrencyError,
  InvalidInventoryOperationError,
  revertInventoryEvent,
} from "./inventory/inventory.js";

// Runtime-checkable set of every valid CharacterEventCategory, derived from the
// Prisma-generated enum so it can never drift from the schema.
const CATEGORY_VALUES = new Set<string>(Object.values(CharacterEventCategory));

function asCategory(value: string | undefined): CharacterEventCategory | undefined {
  return value !== undefined && CATEGORY_VALUES.has(value)
    ? (value as CharacterEventCategory)
    : undefined;
}

// Runtime-checkable set of every valid CharacterEventType, derived from the
// Prisma-generated enum so it can never drift from the schema. Mirrors
// asCategory: an unknown type value is silently ignored (unfiltered), not a 400.
const TYPE_VALUES = new Set<string>(Object.values(CharacterEventType));

function asType(value: string | undefined): CharacterEventType | undefined {
  return value !== undefined && TYPE_VALUES.has(value)
    ? (value as CharacterEventType)
    : undefined;
}

// Pure query-shaping for the activity read path; no DB access.
export function buildActivityQuery(
  characterId: string,
  rawQuery: Record<string, unknown>,
): Prisma.CharacterEventFindManyArgs {
  // Only apply the category filter when the query value is a real enum member;
  // an unknown value is silently ignored (unfiltered), matching prior behavior.
  const category = asCategory(
    typeof rawQuery.category === "string" ? rawQuery.category : undefined,
  );
  // Same validate-or-ignore contract as category: an unknown event type is
  // silently dropped (unfiltered) rather than 400-ing.
  const type = asType(
    typeof rawQuery.type === "string" ? rawQuery.type : undefined,
  );
  const sessionId =
    typeof rawQuery.sessionId === "string" ? rawQuery.sessionId : undefined;
  const entityId =
    typeof rawQuery.entityId === "string" ? rawQuery.entityId : undefined;
  const includeFields = rawQuery.includeFields === "1";
  const revertedFilter = rawQuery.reverted === "0"
    ? false
    : rawQuery.reverted === "1"
    ? true
    : undefined; // undefined = no filter (include all)

  return {
    where: {
      characterId,
      ...(category ? { category } : {}),
      ...(type ? { type } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(entityId ? { entityId } : {}),
      ...(revertedFilter !== undefined ? { reverted: revertedFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: includeFields ? { fields: true } : undefined,
  };
}

type ActivityEventRow = CharacterEvent & {
  fields?: Array<{ id: string; path: string; oldValue: unknown; newValue: unknown }>;
};

type RevertResult = { ok: true } | { ok: false; status: 404 | 409; error: string };

// ── Revert context + handler registry ─────────────────────────────────────────
// Mirrors the LEVEL_GATED_RECONCILERS pattern in level-reconciliation.ts: each
// category's before-snapshot restore lives in a named handler, and reverseEvent
// dispatches through REVERT_HANDLERS instead of an if/else chain.
//
// Handlers stay in THIS module (not the domain libs) on purpose: nothing here
// uses domain-lib internals — they're generic `tx.character.update` writes —
// and moving them into hitpoints.ts/spellcasting.ts/etc. would close an
// `activity → domainlib → … → activity` import cycle.

interface RevertContext {
  tx: Prisma.TransactionClient;
  characterId: string;
  event: CharacterEvent;
  /** The event's non-null `before` snapshot (the guard runs before dispatch). */
  before: Record<string, unknown>;
}

type RevertHandler = (ctx: RevertContext) => Promise<void>;

// Shared by `hitPoints` and `experience` (registered under both keys).
async function revertHitPointsEvent(ctx: RevertContext): Promise<void> {
  const { tx, characterId, event, before } = ctx;

  // Restore hitPoints/hitDice from before snapshot.
  const updateData: Record<string, unknown> = {};
  if (before.hitPoints !== undefined) updateData.hitPoints = before.hitPoints;
  if (before.hitDice !== undefined) updateData.hitDice = before.hitDice;
  if (before.experiencePoints !== undefined) updateData.experiencePoints = before.experiencePoints;
  // Long/short rest also snapshot spellcasting + resources — restore them
  // so undoing a rest re-expends the slots/dice that were cleared.
  if (before.spellcasting !== undefined) updateData.spellcasting = before.spellcasting;
  if (before.resources !== undefined) updateData.resources = before.resources;
  if (Object.keys(updateData).length > 0) {
    await tx.character.update({
      where: { id: characterId },
      data: updateData as Prisma.CharacterUpdateInput,
    });
  }

  // Undo a long-rest consumable recharge (#121): re-expend each charge.
  const beforeCharges = before.consumableCharges as
    | { inventoryItemId: string; usesRemaining: number | null }[]
    | undefined;
  if (beforeCharges) {
    for (const c of beforeCharges) {
      await tx.inventoryConsumableDetail.updateMany({
        where: { inventoryItemId: c.inventoryItemId },
        data: { usesRemaining: c.usesRemaining },
      });
    }
  }

  // Undo a rest's item charge-pool recharge (#555): re-expend each pool.
  // updateMany so a pool whose item was deleted after the rest is a no-op.
  const beforeChargePools = before.chargePools as
    | { capabilityId: string; used: number }[]
    | undefined;
  if (beforeChargePools) {
    for (const p of beforeChargePools) {
      await tx.inventoryCapability.updateMany({
        where: { id: p.capabilityId },
        data: { used: p.used },
      });
    }
  }

  // Restore class-entry level if the event touched it (levelUp/levelDown).
  const data = event.data as Record<string, unknown> | null;
  if (data?.primaryEntryId && before.classEntryLevel !== undefined) {
    await tx.characterClassEntry.update({
      where: { id: data.primaryEntryId as string },
      data: { level: before.classEntryLevel as number },
    });
  }
  // A multiclass "new class" level-up created a fresh CharacterClassEntry
  // (#124). Undo must delete it, or a ghost entry survives the revert.
  // deleteMany so a later level-down that already removed it is a no-op.
  if (data?.createdClassEntryId) {
    await tx.characterClassEntry.deleteMany({
      where: { id: data.createdClassEntryId as string },
    });
  }
}

async function revertCurrencyEvent(ctx: RevertContext): Promise<void> {
  const { tx, characterId, before } = ctx;
  const beforeCurrency = before.currency as Record<string, number> | undefined;
  if (beforeCurrency) {
    await tx.character.update({
      where: { id: characterId },
      data: { currency: beforeCurrency as Prisma.InputJsonValue },
    });
  }
}

async function revertSpellcastingEvent(ctx: RevertContext): Promise<void> {
  const { tx, characterId, before } = ctx;
  // Restore the full spellcasting JSON from before snapshot.
  const beforeSpellcasting = before.spellcasting as Record<string, unknown> | undefined;
  if (beforeSpellcasting !== undefined) {
    await tx.character.update({
      where: { id: characterId },
      data: { spellcasting: beforeSpellcasting as Prisma.InputJsonValue },
    });
  }
  // An item-spell cast (#528/#555) also spent an InventoryCapability.used
  // counter (per-capability uses or a shared charges pool), persisted outside
  // the spell blob — restore it so undo refunds the use/charges (#580).
  // updateMany so a since-deleted item (new capability ids after a
  // delete/undo-delete cycle) is a no-op, matching the rest-undo pattern.
  const capabilityUsed = before.capabilityUsed as
    | { capabilityId: string; used: number }
    | undefined;
  if (capabilityUsed !== undefined) {
    await tx.inventoryCapability.updateMany({
      where: { id: capabilityUsed.capabilityId },
      data: { used: capabilityUsed.used },
    });
  }
}

async function revertResourcesEvent(ctx: RevertContext): Promise<void> {
  const { tx, characterId, before } = ctx;
  // Restore the full resources JSON (used counts + maneuversKnown) from
  // the before snapshot — identical pattern to spellcasting revert.
  const beforeResources = before.resources as Record<string, unknown> | undefined;
  if (beforeResources !== undefined) {
    await tx.character.update({
      where: { id: characterId },
      data: { resources: beforeResources as Prisma.InputJsonValue },
    });
  }
}

async function revertConditionsEvent(ctx: RevertContext): Promise<void> {
  const { tx, characterId, before } = ctx;
  // Restore the full conditions JSON (active list + exhaustion level)
  // from the before snapshot — identical pattern to resources revert.
  const beforeConditions = before.conditions as Record<string, unknown> | undefined;
  if (beforeConditions !== undefined) {
    await tx.character.update({
      where: { id: characterId },
      data: { conditions: beforeConditions as Prisma.InputJsonValue },
    });
  }
}

async function revertEffectsEvent(ctx: RevertContext): Promise<void> {
  const { tx, characterId, before } = ctx;
  // Restore the full activeEffects JSON (buff list) from the before snapshot
  // — identical pattern to the conditions revert.
  const beforeEffects = before.activeEffects as Record<string, unknown> | undefined;
  if (beforeEffects !== undefined) {
    await tx.character.update({
      where: { id: characterId },
      data: { activeEffects: beforeEffects as Prisma.InputJsonValue },
    });
  }
}

// Multiclass add-class (issue #125): delete the created entry and restore
// the HP/hit-dice bump that came with the new class's first level.
async function revertClassAdded(ctx: RevertContext): Promise<void> {
  const { tx, characterId, event, before } = ctx;
  const data = event.data as Record<string, unknown> | null;
  if (data?.createdClassEntryId) {
    await tx.characterClassEntry.deleteMany({
      where: { id: data.createdClassEntryId as string },
    });
  }
  const updateData: Record<string, unknown> = {};
  if (before.hitPoints !== undefined) updateData.hitPoints = before.hitPoints;
  if (before.hitDice !== undefined) updateData.hitDice = before.hitDice;
  if (Object.keys(updateData).length > 0) {
    await tx.character.update({
      where: { id: characterId },
      data: updateData as Prisma.CharacterUpdateInput,
    });
  }
}

// Multiclass level-down reconcile (issue #124): restore each entry's level
// (recreating any that were deleted when they hit level 0).
async function revertClassLevelsReconciled(ctx: RevertContext): Promise<void> {
  const { tx, characterId, before } = ctx;
  const beforeEntries = before.classEntries as
    | {
        id: string;
        name: string;
        level: number;
        position: number;
        classId: string | null;
        subclass: string | null;
        subclassId: string | null;
      }[]
    | undefined;
  if (beforeEntries) {
    for (const e of beforeEntries) {
      await tx.characterClassEntry.upsert({
        where: { id: e.id },
        update: {
          level: e.level,
          name: e.name,
          position: e.position,
          classId: e.classId ?? null,
          subclass: e.subclass ?? null,
          subclassId: e.subclassId ?? null,
        },
        create: {
          id: e.id,
          characterId,
          level: e.level,
          name: e.name,
          position: e.position,
          classId: e.classId ?? null,
          subclass: e.subclass ?? null,
          subclassId: e.subclassId ?? null,
        },
      });
    }
  }
}

// Restore subclassId + subclass display name onto the class entry.
// The before snapshot carries the class entry's data (not the whole
// character row), so grab classEntryId from event.data.
async function revertSubclassChange(ctx: RevertContext): Promise<void> {
  const { tx, event, before } = ctx;
  const data = event.data as Record<string, unknown> | null;
  const classEntryId = data?.classEntryId as string | undefined;
  if (classEntryId) {
    await tx.characterClassEntry.update({
      where: { id: classEntryId },
      data: {
        subclassId: (before.subclassId as string | null) ?? null,
        subclass: (before.subclass as string | null) ?? null,
      },
    });
  }
}

async function revertClassEvent(ctx: RevertContext): Promise<void> {
  if (ctx.event.type === "classAdded") return revertClassAdded(ctx);
  if (ctx.event.type === "classLevelsReconciled") return revertClassLevelsReconciled(ctx);
  return revertSubclassChange(ctx);
}

async function revertAdvancementEvent(ctx: RevertContext): Promise<void> {
  const { tx, characterId, before } = ctx;
  // Restore ability scores, hit points, initiative, and resources from
  // before snapshot — all four columns that advancement ops mutate.
  const updateData: Record<string, unknown> = {};
  if (before.abilityScores !== undefined) updateData.abilityScores = before.abilityScores;
  if (before.hitPoints !== undefined) updateData.hitPoints = before.hitPoints;
  if (before.initiativeBonus !== undefined) updateData.initiativeBonus = before.initiativeBonus;
  if (before.resources !== undefined) updateData.resources = before.resources;
  if (Object.keys(updateData).length > 0) {
    await tx.character.update({
      where: { id: characterId },
      data: updateData as Prisma.CharacterUpdateInput,
    });
  }
}

/**
 * Per-category revert dispatch. Categories with no handler (roll, session,
 * combat — and inventory, which is dispatched before the `before` guard) are
 * intentionally absent: reverseEvent no-ops for them, matching prior behavior.
 * `hitPoints` and `experience` share one handler.
 */
const REVERT_HANDLERS: Partial<Record<CharacterEventCategory, RevertHandler>> = {
  hitPoints: revertHitPointsEvent,
  experience: revertHitPointsEvent,
  currency: revertCurrencyEvent,
  spellcasting: revertSpellcastingEvent,
  resources: revertResourcesEvent,
  conditions: revertConditionsEvent,
  effects: revertEffectsEvent,
  class: revertClassEvent,
  advancement: revertAdvancementEvent,
};

// Restore one event's `before` sub-state. Inventory is shape-driven and runs
// before the `if (!before) continue` guard (an acquire carries before==null).
async function reverseEvent(
  tx: Prisma.TransactionClient,
  characterId: string,
  event: CharacterEvent,
) {
  // Inventory is handled BEFORE the `if (!before) continue` short-circuit:
  // an acquire event carries before==null (it created the row), and undoing
  // it means DELETING that row — so it must not be skipped. The reversal is
  // shape-driven inside revertInventoryEvent (delete created / recreate
  // deleted / restore scalar + reverse currency).
  if (event.category === "inventory") {
    await revertInventoryEvent(tx, characterId, event);
    return;
  }

  const before = event.before as Record<string, unknown> | null;
  if (!before) return; // no before snapshot = nothing to restore

  const handler = REVERT_HANDLERS[event.category];
  if (!handler) return; // roll/session/combat etc. — nothing to restore

  await handler({ tx, characterId, event, before });
}

// LIFO undo of one batch: validate it is the most-recent non-reverted batch,
// reverse each event's before-state, mark the batch reverted, and append a
// meta revert event. Returns a discriminated result so the route keeps HTTP
// control (no res access here). Throws on unexpected errors.
export async function revertBatch(
  db: PrismaClient,
  characterId: string,
  batchId: string,
): Promise<RevertResult> {
  const batchEvents = await db.characterEvent.findMany({
    where: { characterId, batchId },
    orderBy: { createdAt: "asc" },
  });

  if (!batchEvents.length) {
    return { ok: false, status: 404, error: "No events found for this batch" };
  }

  if (batchEvents.some((e) => e.reverted)) {
    return { ok: false, status: 409, error: "This batch has already been reverted" };
  }

  // LIFO guard: find the most-recent non-reverted batch and ensure it matches.
  // Also exclude events belonging to an already-ended session — those are frozen
  // so the summary/XP that was awarded at session-end stays coherent.
  const latestEvent = await db.characterEvent.findFirst({
    where: {
      characterId,
      reverted: false,
      type: { not: "revert" },
      // Roll events (attack/damage/check/save/initiative) are non-undoable log
      // entries — skip them so they neither undo themselves nor block a real undo.
      category: { not: "roll" },
      // Don't look through events whose session has been ended.
      OR: [
        { sessionId: null },
        { session: { status: "active" } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!latestEvent || latestEvent.batchId !== batchId) {
    return {
      ok: false,
      status: 409,
      error: "Only the most recent action can be undone",
    };
  }

  // Also block if the batch itself belongs to an ended session.
  //
  // NOTE: in practice this guard is a redundant second line of defense. The
  // LIFO scan above excludes events whose session has been ended (the OR on
  // `session.status === "active"`), so a batch from an ended session can never
  // be the "most recent non-reverted batch" and the request already 409s with
  // the "Only the most recent action can be undone" message before reaching
  // here. We keep this explicit guard intentionally: it documents the
  // ended-session-is-frozen invariant at the point it matters and stays correct
  // even if the LIFO query above is ever refactored to stop filtering on
  // session status.
  if (batchEvents[0]?.sessionId) {
    const session = await db.session.findUnique({
      where: { id: batchEvents[0].sessionId },
      select: { status: true },
    });
    if (session?.status === "ended") {
      return { ok: false, status: 409, error: "Cannot undo actions from a completed session" };
    }
  }

  // Apply reversals in reverse order (latest op in the batch first).
  const reversed = [...batchEvents].reverse();

  try {
    await db.$transaction(async (tx) => {
      for (const event of reversed) {
        await reverseEvent(tx, characterId, event);
      }

      // Mark all events in the batch as reverted.
      await tx.characterEvent.updateMany({
        where: { characterId, batchId },
        data: { reverted: true },
      });

      // Append a meta `revert` event so the timeline shows the undo.
      await tx.characterEvent.create({
        data: {
          characterId,
          category: reversed[reversed.length - 1]?.category ?? "hitPoints",
          type: "revert",
          summary: `Undid: ${reversed[reversed.length - 1]?.summary ?? "previous action"}`,
          data: { revertedBatchId: batchId } as Prisma.InputJsonValue,
          actor: "player",
          reverted: false,
          batchId: null,
        },
      });
    });
  } catch (error) {
    // A revert that can't be reversed cleanly (e.g. undoing a sale after the
    // proceeds were already spent) throws InsufficientCurrencyError from
    // revertInventoryEvent. The whole $transaction rolls back; surface it as a
    // 409 to match this route's other conflict responses instead of a 500.
    if (
      error instanceof InsufficientCurrencyError ||
      error instanceof InvalidInventoryOperationError
    ) {
      return { ok: false, status: 409, error: error.message };
    }
    throw error;
  }

  return { ok: true };
}

export function serializeActivityEvent(row: ActivityEventRow) {
  return {
    id: row.id,
    category: row.category,
    type: row.type,
    summary: row.summary,
    entityType: row.entityType ?? undefined,
    entityId: row.entityId ?? undefined,
    before: row.before ?? undefined,
    after: row.after ?? undefined,
    data: row.data ?? undefined,
    actor: row.actor,
    reverted: row.reverted,
    batchId: row.batchId ?? undefined,
    createdAt: row.createdAt,
    fields: "fields" in row
      ? (row as typeof row & { fields: Array<{ id: string; path: string; oldValue: unknown; newValue: unknown }> })
          .fields.map((f) => ({
            id: f.id,
            path: f.path,
            oldValue: f.oldValue ?? undefined,
            newValue: f.newValue ?? undefined,
          }))
      : undefined,
  };
}
