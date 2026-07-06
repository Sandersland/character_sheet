import { Router } from "express";

import {
  buildActivityQuery,
  revertBatch,
  serializeActivityEvent,
} from "../lib/activity.js";
import { assertCharacterAccess } from "../lib/auth/access.js";
import { prisma } from "../lib/prisma.js";

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
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");

  const events = await prisma.characterEvent.findMany(
    buildActivityQuery(req.params.id, req.query),
  );
  res.json(events.map(serializeActivityEvent));
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
// Inventory events are fully revertable: deleted InventoryItem + detail rows
// are reconstructed from `data.deletedItem` and currency is reversed from
// `data.currencyDelta` (see revertInventoryEvent in lib/inventory.ts).

activityRouter.post("/characters/:id/events/:batchId/revert", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const result = await revertBatch(prisma, req.params.id, req.params.batchId);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  // Re-fetch the character with full relations and return.
  const { characterInclude } = await import("../lib/character-include.js");
  const { serializeCharacter } = await import("../lib/character-serialize.js");
  const updated = await prisma.character.findUnique({
    where: { id: req.params.id },
    include: characterInclude,
  });
  res.json(serializeCharacter(updated!));
});
