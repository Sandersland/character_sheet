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
} from "@/lib/inventory/inventory.js";
import { mirrorCapabilityUsedSet, mirrorUsesRemaining } from "@/lib/inventory/inventory-capability-use.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";
import { lockCharacterRow } from "@/lib/character/character-transaction.js";

// Derived from the Prisma-generated enum so it can never drift from the schema.
const CATEGORY_VALUES = new Set<string>(Object.values(CharacterEventCategory));

// An unknown filter value is silently ignored (unfiltered), never a 400 — same for asType.
function asCategory(value: string | undefined): CharacterEventCategory | undefined {
  return value !== undefined && CATEGORY_VALUES.has(value)
    ? (value as CharacterEventCategory)
    : undefined;
}

const TYPE_VALUES = new Set<string>(Object.values(CharacterEventType));

function asType(value: string | undefined): CharacterEventType | undefined {
  return value !== undefined && TYPE_VALUES.has(value)
    ? (value as CharacterEventType)
    : undefined;
}

export function buildActivityQuery(
  characterId: string,
  rawQuery: Record<string, unknown>,
): Prisma.CharacterEventFindManyArgs {
  const category = asCategory(
    typeof rawQuery.category === "string" ? rawQuery.category : undefined,
  );
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
    : undefined;

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

// Handlers stay here, not in domain libs: moving them would create an activity → domainlib → … → activity import cycle.

interface RevertContext {
  tx: Prisma.TransactionClient;
  characterId: string;
  event: CharacterEvent;
  /** The event's non-null `before` snapshot (the guard runs before dispatch). */
  before: Record<string, unknown>;
}

type RevertHandler = (ctx: RevertContext) => Promise<void>;

// #1136: long/short rest also snapshot spellcasting/resources/conditions — restore them too, or undo doesn't re-expend what the rest cleared.
async function restoreHitPointColumns(
  tx: Prisma.TransactionClient,
  characterId: string,
  before: Record<string, unknown>,
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (before.hitPoints !== undefined) updateData.hitPoints = before.hitPoints;
  if (before.hitDice !== undefined) updateData.hitDice = before.hitDice;
  if (before.experiencePoints !== undefined) updateData.experiencePoints = before.experiencePoints;
  if (before.spellcasting !== undefined) updateData.spellcasting = before.spellcasting;
  if (before.resources !== undefined) updateData.resources = before.resources;
  if (before.conditions !== undefined) updateData.conditions = before.conditions;
  if (Object.keys(updateData).length === 0) return;
  await tx.character.update({
    where: { id: characterId },
    data: updateData as Prisma.CharacterUpdateInput,
  });
}

async function restoreConsumableCharges(
  tx: Prisma.TransactionClient,
  before: Record<string, unknown>,
): Promise<void> {
  const beforeCharges = before.consumableCharges as
    | { inventoryItemId: string; usesRemaining: number | null }[]
    | undefined;
  if (!beforeCharges) return;
  for (const c of beforeCharges) {
    await mirrorUsesRemaining(tx, c.inventoryItemId, c.usesRemaining);
  }
}

// updateMany inside mirrorCapabilityUsedSet makes a since-deleted item's pool a no-op.
async function restoreChargePools(
  tx: Prisma.TransactionClient,
  before: Record<string, unknown>,
): Promise<void> {
  const beforeChargePools = before.chargePools as
    | { capabilityId: string; used: number }[]
    | undefined;
  if (!beforeChargePools) return;
  for (const p of beforeChargePools) {
    await mirrorCapabilityUsedSet(tx, p.capabilityId, p.used);
  }
}

// #124: deleteMany so a level-down that already removed the entry is a no-op; otherwise a multiclass level-up's created entry survives as a ghost.
async function restoreLevelUpClassEntry(
  tx: Prisma.TransactionClient,
  event: CharacterEvent,
  before: Record<string, unknown>,
): Promise<void> {
  const data = event.data as Record<string, unknown> | null;
  if (data?.primaryEntryId && before.classEntryLevel !== undefined) {
    await tx.characterClassEntry.update({
      where: { id: data.primaryEntryId as string },
      data: { level: before.classEntryLevel as number },
    });
  }
  if (data?.createdClassEntryId) {
    await tx.characterClassEntry.deleteMany({
      where: { id: data.createdClassEntryId as string },
    });
  }
}

// Shared by `hitPoints` and `experience` (registered under both keys).
async function revertHitPointsEvent(ctx: RevertContext): Promise<void> {
  const { tx, characterId, event, before } = ctx;
  await restoreHitPointColumns(tx, characterId, before);
  await restoreConsumableCharges(tx, before);
  await restoreChargePools(tx, before);
  await restoreLevelUpClassEntry(tx, event, before);
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

// #1849: batch reverts LIFO, so this runs after the cast's own revert already refunded the slot — merge concentratingOn instead of replacing the column, or it clobbers that refund.
async function mergeConcentrationOnlyRevert(
  tx: Prisma.TransactionClient,
  characterId: string,
  beforeSpellcasting: Record<string, unknown>,
  beforeResources: Record<string, unknown> | undefined,
): Promise<void> {
  const current = await tx.character.findUnique({
    where: { id: characterId },
    select: { spellcasting: true },
  });
  const state = normalizeSpellcastingMutable(current?.spellcasting ?? null);
  await tx.character.update({
    where: { id: characterId },
    data: {
      spellcasting: {
        slotsUsed: state.slotsUsed,
        arcanumUsed: state.arcanumUsed,
        spells: state.spells,
        concentratingOn: (beforeSpellcasting.concentratingOn as typeof state.concentratingOn) ?? null,
      } as unknown as Prisma.InputJsonValue,
      ...(beforeResources !== undefined ? { resources: beforeResources as Prisma.InputJsonValue } : {}),
    },
  });
}

async function revertSpellcastingEvent(ctx: RevertContext): Promise<void> {
  const { tx, characterId, before } = ctx;
  // #904: Arcane Recovery's once-per-long-rest use counter also lives in resources — restore it so undo refunds the use.
  const beforeSpellcasting = before.spellcasting as Record<string, unknown> | undefined;
  const beforeResources = before.resources as Record<string, unknown> | undefined;
  // Absence of `slotsUsed` (present on every other normalizeSpellcastingMutable snapshot) signals a concentrationDropped snapshot.
  if (beforeSpellcasting !== undefined && !("slotsUsed" in beforeSpellcasting)) {
    await mergeConcentrationOnlyRevert(tx, characterId, beforeSpellcasting, beforeResources);
  } else if (beforeSpellcasting !== undefined || beforeResources !== undefined) {
    await tx.character.update({
      where: { id: characterId },
      data: {
        ...(beforeSpellcasting !== undefined ? { spellcasting: beforeSpellcasting as Prisma.InputJsonValue } : {}),
        ...(beforeResources !== undefined ? { resources: beforeResources as Prisma.InputJsonValue } : {}),
      },
    });
  }
  // #528/#555/#580: item-spell cast also spends InventoryCapability.used outside the spell blob — restore it so undo refunds the use/charges.
  const capabilityUsed = before.capabilityUsed as
    | { capabilityId: string; used: number }
    | undefined;
  if (capabilityUsed !== undefined) {
    await mirrorCapabilityUsedSet(tx, capabilityUsed.capabilityId, capabilityUsed.used);
  }
}

async function revertResourcesEvent(ctx: RevertContext): Promise<void> {
  const { tx, characterId, before } = ctx;
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
  // #1321: a setExhaustion raising exhaustion to 4+ also snapshots before.hitPoints (pre-clamp) — restore it when present; other condition ops never carry it.
  const beforeConditions = before.conditions as Record<string, unknown> | undefined;
  const beforeHitPoints = before.hitPoints as Record<string, unknown> | undefined;
  const updateData: Record<string, unknown> = {};
  if (beforeConditions !== undefined) updateData.conditions = beforeConditions;
  if (beforeHitPoints !== undefined) updateData.hitPoints = beforeHitPoints;
  if (Object.keys(updateData).length === 0) return;
  await tx.character.update({
    where: { id: characterId },
    data: updateData as Prisma.CharacterUpdateInput,
  });
}

async function revertEffectsEvent(ctx: RevertContext): Promise<void> {
  const { tx, characterId, before } = ctx;
  const beforeEffects = before.activeEffects as Record<string, unknown> | undefined;
  if (beforeEffects !== undefined) {
    await tx.character.update({
      where: { id: characterId },
      data: { activeEffects: beforeEffects as Prisma.InputJsonValue },
    });
  }
}

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

// upsert, not update — a level-down may have deleted an entry at level 0; recreate it here.
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

// The before snapshot carries the class entry's own fields, not the whole character row — classEntryId comes from event.data instead.
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

// #1439: the SessionParticipant field recordTurnSpellCast sets isn't part of the event's before/after, so undo must clear it explicitly or the block reappears on the next poll.
type ParticipantScope = { sessionId: string; characterId: string };

// Mirrors recordTurnSpellCast's downgrade guard: slotLevel present means a leveled revert (clears unconditionally); absent means a cantrip revert, which must only clear a null-or-cantrip field, never a `leveled` one set by an earlier Action Surge cast this turn.
function clearWhere(
  scope: ParticipantScope,
  field: "spellCastAsAction" | "spellCastAsBonus",
  revertedCantrip: boolean,
): Prisma.SessionParticipantWhereInput {
  if (!revertedCantrip) return scope;
  return field === "spellCastAsAction"
    ? { ...scope, OR: [{ spellCastAsAction: null }, { spellCastAsAction: "cantrip" }] }
    : { ...scope, OR: [{ spellCastAsBonus: null }, { spellCastAsBonus: "cantrip" }] };
}

async function clearRevertedSpellCastInterlock(
  tx: Prisma.TransactionClient,
  event: CharacterEvent,
): Promise<void> {
  const data = event.data as { entryId?: string | null; slotLevel?: number | null; cost?: { kind?: string } } | null;
  const economy = data?.cost?.kind;
  if (event.sessionId == null || data?.entryId == null) return;
  if (economy !== "action" && economy !== "bonus") return;
  const scope: ParticipantScope = { sessionId: event.sessionId, characterId: event.characterId };
  const revertedCantrip = data.slotLevel == null;
  const field = economy === "action" ? "spellCastAsAction" : "spellCastAsBonus";
  await tx.sessionParticipant.updateMany({
    where: clearWhere(scope, field, revertedCantrip),
    data: field === "spellCastAsAction" ? { spellCastAsAction: null } : { spellCastAsBonus: null },
  });
}

// #1829: resolveAction is the only combat-category event with a `before` snapshot; combatStarted/combatEnded/combatRoundAdvanced carry none and never reach this handler.
async function revertCombatEvent(ctx: RevertContext): Promise<void> {
  const { tx, characterId, before } = ctx;
  const beforeSpellcasting = before.spellcasting as Record<string, unknown> | undefined;
  const beforeResources = before.resources as Record<string, unknown> | undefined;
  const updateData: Record<string, unknown> = {};
  if (beforeSpellcasting !== undefined) updateData.spellcasting = beforeSpellcasting;
  if (beforeResources !== undefined) updateData.resources = beforeResources;
  if (Object.keys(updateData).length === 0) return;
  await tx.character.update({
    where: { id: characterId },
    data: updateData as Prisma.CharacterUpdateInput,
  });
}

async function revertAdvancementEvent(ctx: RevertContext): Promise<void> {
  const { tx, characterId, before } = ctx;
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

// roll and session have no handler (no-op); inventory is dispatched earlier in reverseEvent, before this map is consulted.
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
  combat: revertCombatEvent,
};

async function reverseEvent(
  tx: Prisma.TransactionClient,
  characterId: string,
  event: CharacterEvent,
) {
  // Inventory runs before the `before` guard: an acquire's before is null (it created the row) but still must be undone by deleting it — revertInventoryEvent handles delete-created/recreate-deleted/restore-scalar by shape.
  if (event.category === "inventory") {
    await revertInventoryEvent(tx, characterId, event);
    return;
  }

  // #1439: interlock clearing must run before the `before` guard — a cantrip cast sets the interlock but has no slot snapshot to trigger it otherwise; a leveled cast still falls through to revertCombatEvent below.
  if (event.category === "combat" && event.type === "resolveAction") {
    await clearRevertedSpellCastInterlock(tx, event);
  }

  const before = event.before as Record<string, unknown> | null;
  // Silent no-ops are deliberate: no before snapshot (or no handler — roll/session/combat) means nothing to restore, never an error.
  if (!before) return;

  const handler = REVERT_HANDLERS[event.category];
  if (!handler) return;

  await handler({ tx, characterId, event, before });
}

async function revertPreflight(
  db: PrismaClient,
  characterId: string,
  batchId: string,
  batchEvents: CharacterEvent[],
): Promise<RevertResult | null> {
  if (!batchEvents.length) {
    return { ok: false, status: 404, error: "No events found for this batch" };
  }

  if (batchEvents.some((e) => e.reverted)) {
    return { ok: false, status: 409, error: "This batch has already been reverted" };
  }

  // Ended-session events are excluded — they're frozen so the session-end summary/XP award stays coherent.
  // #1861: roll-category events (before/after null) still count as "the most recent action" here, not skipped as a dead log entry.
  const latestEvent = await db.characterEvent.findFirst({
    where: {
      characterId,
      reverted: false,
      type: { not: "revert" },
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

  // Redundant with the LIFO scan above but kept intentionally: documents the ended-session-is-frozen invariant even if that scan stops filtering on session status.
  if (batchEvents[0]?.sessionId) {
    const session = await db.session.findUnique({
      where: { id: batchEvents[0].sessionId },
      select: { status: true },
    });
    if (session?.status === "ended") {
      return { ok: false, status: 409, error: "Cannot undo actions from a completed session" };
    }
  }

  return null;
}

// Throws on an unrevertable event (e.g. spent sale proceeds) so the caller's catch maps it to a 409 and the transaction rolls back.
async function applyBatchReversal(
  tx: Prisma.TransactionClient,
  characterId: string,
  batchId: string,
  reversed: CharacterEvent[],
): Promise<void> {
  // Locking Character first (before reverseEvent can lock InventoryItem rows) keeps lock
  // acquisition order consistent with runCharacterTransaction/actionsRouter — reversed order
  // would deadlock (Postgres 40P01) against a concurrent locked transaction on the same rows.
  await lockCharacterRow(tx, characterId);

  for (const event of reversed) {
    await reverseEvent(tx, characterId, event);
  }

  await tx.characterEvent.updateMany({
    where: { characterId, batchId },
    data: { reverted: true },
  });

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
}

// Returns a discriminated RevertResult rather than touching res directly, so the route keeps HTTP control.
export async function revertBatch(
  db: PrismaClient,
  characterId: string,
  batchId: string,
): Promise<RevertResult> {
  const batchEvents = await db.characterEvent.findMany({
    where: { characterId, batchId },
    orderBy: { createdAt: "asc" },
  });

  const blocked = await revertPreflight(db, characterId, batchId, batchEvents);
  if (blocked) return blocked;

  const reversed = [...batchEvents].reverse();

  try {
    await db.$transaction(
      (tx) => applyBatchReversal(tx, characterId, batchId, reversed),
      { timeout: 30_000 },
    );
  } catch (error) {
    // InsufficientCurrencyError/InvalidInventoryOperationError carry their own 400, remapped to 409 here: an undo blocked by later state (e.g. sale proceeds already spent) is a conflict, not a bad request.
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
