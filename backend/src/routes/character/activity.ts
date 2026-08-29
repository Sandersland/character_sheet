import { Router } from "express";

import {
  buildActivityQuery,
  revertBatch,
  serializeActivityEvent,
} from "@/lib/activity/activity.js";
import { assertCharacterAccess } from "@/lib/auth/access.js";
import { prisma } from "@/lib/core/prisma.js";

export const activityRouter = Router({ mergeParams: true });

/**
 * GET /api/characters/:id/activity
 * Optional query params: ?category=<CharacterEventCategory>, ?type=<CharacterEventType> (AND with category),
 * ?sessionId=<id>, ?entityId=<id>, ?includeFields=1, ?reverted=0|1 (default: include all). Unknown filter values are ignored.
 */
activityRouter.get<{ id: string }>("/activity", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");

  const events = await prisma.characterEvent.findMany(
    buildActivityQuery(req.params.id, req.query),
  );
  res.json(events.map(serializeActivityEvent));
});

/**
 * POST /api/characters/:id/events/:batchId/revert
 * LIFO undo: guards that batchId is the most-recent non-reverted batch, to avoid the dependency-invalidation problem of out-of-order undo.
 */
activityRouter.post<{ id: string; batchId: string }>("/events/:batchId/revert", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const result = await revertBatch(prisma, req.params.id, req.params.batchId);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  const { characterInclude } = await import("@/lib/character/character-include.js");
  const { serializeCharacter } = await import("@/lib/character/character-serialize.js");
  const updated = await prisma.character.findUnique({
    where: { id: req.params.id },
    include: characterInclude,
  });
  res.json(await serializeCharacter(updated!));
});
