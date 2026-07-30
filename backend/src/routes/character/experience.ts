import { experienceOperationSchema } from "@character-sheet/contracts";
import { Router } from "express";
import { z } from "zod";

import { applyExperienceOperations, InvalidExperienceOperationError } from "@/lib/leveling/experience-ops.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const experienceRouter = Router({ mergeParams: true });

const experienceRequestSchema = z.object({
  operations: z.array(experienceOperationSchema).min(1),
  // Optional: tag the resulting xpAward/xpSet events to a SPECIFIC session
  // (used by the retroactive "add XP to a past session" flow) instead of the
  // currently-active one. When supplied, that session's stored summary is
  // recomputed server-side. Must belong to the character (400 otherwise).
  sessionId: z.string().uuid().optional(),
});

// POST /api/characters/:id/experience
// Intent-bearing XP mutations: award (signed delta) and set (absolute).
// Unlike PATCH /api/characters/:id, this endpoint:
//   - Writes a CharacterEvent for each op so the activity timeline records it.
//   - Auto-reverses HP/hit-dice if the new XP drops the derived level below
//     the number of levelUp ops already applied — fixing the stranded-HP bug.
//
// The `experiencePoints` field has been removed from PATCH /api/characters/:id
// so all XP changes must go through here.
makeTransactionsEndpoint({
  router: experienceRouter,
  path: "/",
  schema: experienceRequestSchema,
  apply: (characterId, data) =>
    applyExperienceOperations(characterId, data.operations, data.sessionId),
  domainErrors: [InvalidExperienceOperationError],
});
