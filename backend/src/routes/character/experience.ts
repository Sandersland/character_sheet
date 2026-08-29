import { experienceOperationSchema } from "@character-sheet/contracts";
import { Router } from "express";
import { z } from "zod";

import { applyExperienceOperations, InvalidExperienceOperationError } from "@/lib/leveling/experience-ops.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const experienceRouter = Router({ mergeParams: true });

const experienceRequestSchema = z.object({
  operations: z.array(experienceOperationSchema).min(1),
  // Optional: tags the resulting xpAward/xpSet events to a specific session instead of the active one; must belong to the character (400 otherwise).
  sessionId: z.string().uuid().optional(),
});

// POST /api/characters/:id/experience
// Auto-reverses HP/hit-dice if the new XP drops the derived level below the number of levelUp ops already applied.
makeTransactionsEndpoint({
  router: experienceRouter,
  path: "/",
  schema: experienceRequestSchema,
  apply: (characterId, data) =>
    applyExperienceOperations(characterId, data.operations, data.sessionId),
  domainErrors: [InvalidExperienceOperationError],
});
