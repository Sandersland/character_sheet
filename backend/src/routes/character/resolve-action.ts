import { Router } from "express";
import { z } from "zod";

import { makeTransactionsEndpoint } from "@/http/transactions-endpoint.js";
import {
  applyResolveActionOperations,
  resolveActionRequestOperationSchema,
} from "@/lib/combat/resolve-action.js";

export const resolveActionRouter = Router({ mergeParams: true });

const transactionsRequestSchema = z.object({
  operations: z.array(resolveActionRequestOperationSchema).min(1),
});

/**
 * POST /api/characters/:id/resolve-action/transactions
 * Commits a resolved weapon swing or spell cast as one undoable `resolveAction` CharacterEvent.
 */
makeTransactionsEndpoint({
  router: resolveActionRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data, userId) => applyResolveActionOperations(characterId, data.operations, userId),
  // batchId rides beside the character for turn undo (#758); the client API layer splits it off.
  respond: (character, batchId) => ({ ...character, batchId }),
});
