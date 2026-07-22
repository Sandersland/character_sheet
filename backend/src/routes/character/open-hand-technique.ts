import { Router } from "express";
import { z } from "zod";

import {
  applyOpenHandTechniqueOperations,
  InvalidOpenHandTechniqueOperationError,
} from "@/lib/classes/open-hand-technique.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const openHandTechniqueRouter = Router({ mergeParams: true });

const imposeOpenHandRiderOpSchema = z.object({
  type: z.literal("imposeOpenHandRider"),
  rider: z.enum(["addle", "push", "topple"]),
  usedThisTurn: z.boolean(),
});

const operationSchema = z.discriminatedUnion("type", [imposeOpenHandRiderOpSchema]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

/**
 * POST /api/characters/:id/open-hand-technique/transactions
 * Imposes one Flurry-of-Blows rider (Addle/Push/Topple). Addle never rolls
 * (no save); Push/Topple roll a flat d20 vs the monk's focus save DC. Returns
 * the updated character plus per-op { rider, dc, roll?, outcome, summary }.
 */
makeTransactionsEndpoint({
  router: openHandTechniqueRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyOpenHandTechniqueOperations(characterId, data.operations),
  domainErrors: [InvalidOpenHandTechniqueOperationError],
  respond: (character, results) => ({ character, results }),
});
