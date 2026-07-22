import { Router } from "express";
import { z } from "zod";

import { applyHandOfHarmOperations, InvalidHandOfHarmOperationError } from "@/lib/classes/hand-of-harm.js";
import { InvalidResourceOperationError } from "@/lib/classes/resources.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const handOfHarmRouter = Router({ mergeParams: true });

const dealHandOfHarmOpSchema = z.object({
  type: z.literal("dealHandOfHarm"),
  usedThisTurn: z.boolean(),
  roll: z.number().positive(),
  freeFromFlurry: z.boolean().optional(),
});

const operationSchema = z.discriminatedUnion("type", [dealHandOfHarmOpSchema]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

/**
 * POST /api/characters/:id/hand-of-harm/transactions
 * Once per turn, spends 1 Focus (or a Flurry of Healing and Harm free use at
 * L11+, via `freeFromFlurry`) to narrate the client-rolled necrotic bonus on
 * an Unarmed Strike hit; Physician's Touch (L6+) adds the Poisoned rider.
 * Returns the updated character plus per-op { necroticDamage, poisoned, summary }.
 */
makeTransactionsEndpoint({
  router: handOfHarmRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyHandOfHarmOperations(characterId, data.operations),
  domainErrors: [InvalidHandOfHarmOperationError, InvalidResourceOperationError],
  respond: (character, results) => ({ character, results }),
});
