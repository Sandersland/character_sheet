import { Router } from "express";
import { z } from "zod";

import {
  applyStunningStrikeOperations,
  InvalidStunningStrikeOperationError,
} from "@/lib/classes/stunning-strike.js";
import { InvalidResourceOperationError } from "@/lib/classes/resources.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const stunningStrikeRouter = Router({ mergeParams: true });

const attemptStunningStrikeOpSchema = z.object({
  type: z.literal("attemptStunningStrike"),
  usedThisTurn: z.boolean(),
});

const operationSchema = z.discriminatedUnion("type", [attemptStunningStrikeOpSchema]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

/**
 * POST /api/characters/:id/stunning-strike/transactions
 * Spends 1 focus and rolls the target's Constitution save (flat d20) against
 * the monk's focus save DC, enforcing the once-per-turn guard. Returns the
 * updated character plus per-op { dc, roll, outcome, summary } so the client
 * surfaces the fail(Stunned)/success(half-speed+advantage) rider inline.
 */
makeTransactionsEndpoint({
  router: stunningStrikeRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyStunningStrikeOperations(characterId, data.operations),
  domainErrors: [InvalidStunningStrikeOperationError, InvalidResourceOperationError],
  respond: (character, results) => ({ character, results }),
});
