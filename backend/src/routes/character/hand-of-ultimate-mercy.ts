import { Router } from "express";
import { z } from "zod";

import {
  applyHandOfUltimateMercyOperations,
  InvalidHandOfUltimateMercyOperationError,
} from "@/lib/classes/hand-of-ultimate-mercy.js";
import { InvalidResourceOperationError } from "@/lib/classes/resources.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const handOfUltimateMercyRouter = Router({ mergeParams: true });

const useHandOfUltimateMercyOpSchema = z.object({
  type: z.literal("useHandOfUltimateMercy"),
  roll: z.number().positive(),
});

const operationSchema = z.discriminatedUnion("type", [useHandOfUltimateMercyOpSchema]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

/**
 * POST /api/characters/:id/hand-of-ultimate-mercy/transactions
 * Spends 5 Focus + 1 use of the once-per-long-rest handOfUltimateMercy pool
 * to narrate reviving a creature with the client-rolled 4d10 + Wis mod hit
 * points. Returns the updated character plus per-op { hpRestored, summary }.
 */
makeTransactionsEndpoint({
  router: handOfUltimateMercyRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyHandOfUltimateMercyOperations(characterId, data.operations),
  domainErrors: [InvalidHandOfUltimateMercyOperationError, InvalidResourceOperationError],
  respond: (character, results) => ({ character, results }),
});
