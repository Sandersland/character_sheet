import { Router } from "express";
import { z } from "zod";

import {
  applyQuiveringPalmOperations,
  InvalidQuiveringPalmOperationError,
} from "@/lib/classes/quivering-palm.js";
import { InvalidResourceOperationError } from "@/lib/classes/resources.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const quiveringPalmRouter = Router({ mergeParams: true });

const setQuiveringPalmOpSchema = z.object({
  type: z.literal("setQuiveringPalm"),
});

const triggerQuiveringPalmOpSchema = z.object({
  type: z.literal("triggerQuiveringPalm"),
  roll: z.number().positive(),
});

const operationSchema = z.discriminatedUnion("type", [setQuiveringPalmOpSchema, triggerQuiveringPalmOpSchema]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

/**
 * POST /api/characters/:id/quivering-palm/transactions
 * setQuiveringPalm: spends 4 focus and marks vibrations active (lasts monk
 * level days, narrated). triggerQuiveringPalm: rolls a flat d20 Con save vs
 * the monk's focus save DC and halves the client-rolled 10d12 on a success,
 * clearing the active flag. Returns the updated character plus per-op result.
 */
makeTransactionsEndpoint({
  router: quiveringPalmRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyQuiveringPalmOperations(characterId, data.operations),
  domainErrors: [InvalidQuiveringPalmOperationError, InvalidResourceOperationError],
  respond: (character, results) => ({ character, results }),
});
