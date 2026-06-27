import { Router } from "express";

import { CharacterEventCategory, CharacterEventType, Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

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

export const activityRouter = Router();

// ── GET /api/characters/:id/activity ─────────────────────────────────────────
//
// Unified, chronological activity timeline for a character: one
// `CharacterEvent` query, one ORDER BY createdAt — no merging. Returns all
// domains (inventory, hitPoints, experience, currency, future domains) together
// so the frontend can render the full campaign story.
//
// Optional query params:
//   ?category=<CharacterEventCategory>  — filter to one domain (e.g. inventory,
//                     hitPoints, experience, currency, conditions, combat,
//                     session, …); unknown values are ignored (no filter)
//   ?type=<CharacterEventType>  — filter to one event type (e.g. sold, damage,
//                     castSpell); unknown values are ignored (no filter).
//                     Composes with ?category= (AND).
//   ?sessionId=<id>   — filter to events recorded during one play session
//   ?entityId=<id>    — filter to events for one entity (e.g. one InventoryItem)
//   ?includeFields=1  — include the per-field diff rows alongside each event
//   ?reverted=0|1     — include (1) or exclude (0) reverted events (default: include all)

activityRouter.get("/characters/:id/activity", async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  // Only apply the category filter when the query value is a real enum member;
  // an unknown value is silently ignored (unfiltered), matching prior behavior.
  const category = asCategory(
    typeof req.query.category === "string" ? req.query.category : undefined,
  );
  // Same validate-or-ignore contract as category: an unknown event type is
  // silently dropped (unfiltered) rather than 400-ing.
  const type = asType(
    typeof req.query.type === "string" ? req.query.type : undefined,
  );
  const sessionId =
    typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
  const entityId =
    typeof req.query.entityId === "string" ? req.query.entityId : undefined;
  const includeFields = req.query.includeFields === "1";
  const revertedFilter = req.query.reverted === "0"
    ? false
    : req.query.reverted === "1"
    ? true
    : undefined; // undefined = no filter (include all)

  // Build where clause. `category` is already validated/narrowed to a real
  // CharacterEventCategory by asCategory(), so no hand-maintained cast is needed.
  const whereClause = {
    characterId: character.id,
    ...(category ? { category } : {}),
    ...(type ? { type } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(entityId ? { entityId } : {}),
    ...(revertedFilter !== undefined ? { reverted: revertedFilter } : {}),
  };

  const events = await prisma.characterEvent.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    include: includeFields ? { fields: true } : undefined,
  });

  res.json(events.map((row) => ({
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
  })));
});

// ── POST /api/characters/:id/events/:batchId/revert ──────────────────────────
//
// LIFO "Undo last action" — reverts the most-recent non-reverted batch.
// Guards that the requested batchId IS the most-recent batch (no arbitrary
// revert) to avoid the dependency-invalidation problem of out-of-order undo.
// Restores each event's `before` sub-state in reverse order, marks events
// `reverted: true`, and appends a `revert` meta-event for the timeline.
// Returns the updated serialized character.
//
// Scoped to CharacterEvent (HP/XP/currency) only for now; the plan explicitly
// defers full inventory-delete-row undo to a later phase.

activityRouter.post("/characters/:id/events/:batchId/revert", async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const { batchId } = req.params;

  const batchEvents = await prisma.characterEvent.findMany({
    where: { characterId: character.id, batchId },
    orderBy: { createdAt: "asc" },
  });

  if (!batchEvents.length) {
    res.status(404).json({ error: "No events found for this batch" });
    return;
  }

  if (batchEvents.some((e) => e.reverted)) {
    res.status(409).json({ error: "This batch has already been reverted" });
    return;
  }

  // LIFO guard: find the most-recent non-reverted batch and ensure it matches.
  // Also exclude events belonging to an already-ended session — those are frozen
  // so the summary/XP that was awarded at session-end stays coherent.
  const latestEvent = await prisma.characterEvent.findFirst({
    where: {
      characterId: character.id,
      reverted: false,
      type: { not: "revert" },
      // Don't look through events whose session has been ended.
      OR: [
        { sessionId: null },
        { session: { status: "active" } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!latestEvent || latestEvent.batchId !== batchId) {
    res.status(409).json({
      error: "Only the most recent action can be undone",
    });
    return;
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
    const session = await prisma.session.findUnique({
      where: { id: batchEvents[0].sessionId },
      select: { status: true },
    });
    if (session?.status === "ended") {
      res.status(409).json({ error: "Cannot undo actions from a completed session" });
      return;
    }
  }

  // Apply reversals in reverse order (latest op in the batch first).
  const reversed = [...batchEvents].reverse();

  await prisma.$transaction(async (tx) => {
    for (const event of reversed) {
      const before = event.before as Record<string, unknown> | null;
      if (!before) continue; // no before snapshot = nothing to restore

      const category = event.category as string;

      if (category === "hitPoints" || category === "experience") {
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
            where: { id: character.id },
            data: updateData as Prisma.CharacterUpdateInput,
          });
        }

        // Restore class-entry level if the event touched it (levelUp/levelDown).
        const data = event.data as Record<string, unknown> | null;
        if (data?.primaryEntryId && before.classEntryLevel !== undefined) {
          await tx.characterClassEntry.update({
            where: { id: data.primaryEntryId as string },
            data: { level: before.classEntryLevel as number },
          });
        }
      } else if (category === "currency") {
        const beforeCurrency = before.currency as Record<string, number> | undefined;
        if (beforeCurrency) {
          await tx.character.update({
            where: { id: character.id },
            data: { currency: beforeCurrency as Prisma.InputJsonValue },
          });
        }
      } else if (category === "spellcasting") {
        // Restore the full spellcasting JSON from before snapshot.
        const beforeSpellcasting = before.spellcasting as Record<string, unknown> | undefined;
        if (beforeSpellcasting !== undefined) {
          await tx.character.update({
            where: { id: character.id },
            data: { spellcasting: beforeSpellcasting as Prisma.InputJsonValue },
          });
        }
      } else if (category === "resources") {
        // Restore the full resources JSON (used counts + maneuversKnown) from
        // the before snapshot — identical pattern to spellcasting revert.
        const beforeResources = before.resources as Record<string, unknown> | undefined;
        if (beforeResources !== undefined) {
          await tx.character.update({
            where: { id: character.id },
            data: { resources: beforeResources as Prisma.InputJsonValue },
          });
        }
      } else if (category === "conditions") {
        // Restore the full conditions JSON (active list + exhaustion level)
        // from the before snapshot — identical pattern to resources revert.
        const beforeConditions = before.conditions as Record<string, unknown> | undefined;
        if (beforeConditions !== undefined) {
          await tx.character.update({
            where: { id: character.id },
            data: { conditions: beforeConditions as Prisma.InputJsonValue },
          });
        }
      } else if (category === "class") {
        // Restore subclassId + subclass display name onto the class entry.
        // The before snapshot carries the class entry's data (not the whole
        // character row), so grab classEntryId from event.data.
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
      } else if (category === "advancement") {
        // Restore ability scores, hit points, initiative, and resources from
        // before snapshot — all four columns that advancement ops mutate.
        const updateData: Record<string, unknown> = {};
        if (before.abilityScores !== undefined) updateData.abilityScores = before.abilityScores;
        if (before.hitPoints !== undefined) updateData.hitPoints = before.hitPoints;
        if (before.initiativeBonus !== undefined) updateData.initiativeBonus = before.initiativeBonus;
        if (before.resources !== undefined) updateData.resources = before.resources;
        if (Object.keys(updateData).length > 0) {
          await tx.character.update({
            where: { id: character.id },
            data: updateData as Prisma.CharacterUpdateInput,
          });
        }
      }
      // inventory undo (restore deleted rows) is explicitly deferred to a later
      // phase per the plan — complex because it requires recreating relational
      // InventoryItem + detail rows. For now: skip inventory events in undo.
    }

    // Mark all events in the batch as reverted.
    await tx.characterEvent.updateMany({
      where: { characterId: character.id, batchId },
      data: { reverted: true },
    });

    // Append a meta `revert` event so the timeline shows the undo.
    await tx.characterEvent.create({
      data: {
        characterId: character.id,
        category: reversed[0]?.category ?? "hitPoints",
        type: "revert",
        summary: `Undid: ${reversed[0]?.summary ?? "previous action"}`,
        data: { revertedBatchId: batchId } as Prisma.InputJsonValue,
        actor: "player",
        reverted: false,
        batchId: null,
      },
    });
  });

  // Re-fetch the character with full relations and return.
  const { characterInclude, serializeCharacter } = await import("./characters.js");
  const updated = await prisma.character.findUnique({
    where: { id: character.id },
    include: characterInclude,
  });
  res.json(serializeCharacter(updated!));
});
