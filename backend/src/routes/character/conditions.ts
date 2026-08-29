import { conditionOperationSchema } from "@character-sheet/contracts";
import { Router } from "express";
import { z } from "zod";

import {
  applyConditionsOperations,
  InvalidConditionOperationError,
} from "@/lib/combat/conditions.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const conditionsRouter = Router({ mergeParams: true });

const transactionsRequestSchema = z.object({
  operations: z.array(conditionOperationSchema).min(1),
});

/**
 * POST /api/characters/:id/conditions/transactions
 * Operations: applyCondition, removeCondition, setExhaustion (absolute level 0-6).
 */
makeTransactionsEndpoint({
  router: conditionsRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyConditionsOperations(characterId, data.operations),
  domainErrors: [InvalidConditionOperationError],
});
