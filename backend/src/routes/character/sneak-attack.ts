import { Router } from "express";
import { z } from "zod";

import {
  applySneakAttackOperations,
  InvalidSneakAttackOperationError,
} from "@/lib/classes/sneak-attack.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const sneakAttackRouter = Router({ mergeParams: true });

const rollSneakAttackOpSchema = z.object({
  type: z.literal("rollSneakAttack"),
  eligible: z.boolean(),
  usedThisTurn: z.boolean(),
});

const operationSchema = z.discriminatedUnion("type", [rollSneakAttackOpSchema]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

/**
 * POST /api/characters/:id/sneak-attack/transactions
 * Rolls the rogue's level-derived Nd6 Sneak Attack server-side, enforcing the
 * once-per-turn + eligibility guard, and logs the roll. Returns the updated
 * character plus per-op { roll, dice, faces } so the client folds the roll into
 * the attack's damage tally.
 */
makeTransactionsEndpoint({
  router: sneakAttackRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applySneakAttackOperations(characterId, data.operations),
  domainErrors: [InvalidSneakAttackOperationError],
  respond: (character, results) => ({ character, results }),
});
