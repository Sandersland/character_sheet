import { Router } from "express";
import { z } from "zod";

import {
  applyClassOperations,
  InvalidClassOperationError,
} from "@/lib/classes/class.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const classRouter = Router({ mergeParams: true });

const setSubclassOpSchema = z.object({
  type: z.literal("setSubclass"),
  subclassId: z.string().min(1),
});

const addClassOpSchema = z.object({
  type: z.literal("addClass"),
  classId: z.string().min(1),
  method: z.enum(["average", "roll"]).optional(),
  roll: z.number().int().positive().optional(),
});

const operationSchema = z.discriminatedUnion("type", [
  setSubclassOpSchema,
  addClassOpSchema,
]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

/**
 * POST /api/characters/:id/class/transactions
 * Operations: setSubclass (choose a subclass once level meets the class's threshold),
 * addClass (multiclass into a new class, validated against 5e ability prerequisites).
 */
makeTransactionsEndpoint({
  router: classRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyClassOperations(characterId, data.operations),
  domainErrors: [InvalidClassOperationError],
});
