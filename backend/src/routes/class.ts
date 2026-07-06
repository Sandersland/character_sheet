import { Router } from "express";
import { z } from "zod";

import {
  applyClassOperations,
  InvalidClassOperationError,
} from "../lib/class.js";
import { makeTransactionsEndpoint } from "../lib/transactions-endpoint.js";

export const classRouter = Router({ mergeParams: true });

// ── Zod schemas ───────────────────────────────────────────────────────────────

const setSubclassOpSchema = z.object({
  type: z.literal("setSubclass"),
  subclassId: z.string().min(1),
});

const setFightingStyleOpSchema = z.object({
  type: z.literal("setFightingStyle"),
  key: z.enum([
    "archery",
    "defense",
    "dueling",
    "greatWeaponFighting",
    "protection",
    "twoWeaponFighting",
  ]),
});

const addClassOpSchema = z.object({
  type: z.literal("addClass"),
  classId: z.string().min(1),
  method: z.enum(["average", "roll"]).optional(),
  roll: z.number().int().positive().optional(),
});

const operationSchema = z.discriminatedUnion("type", [
  setSubclassOpSchema,
  setFightingStyleOpSchema,
  addClassOpSchema,
]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

// ── POST /api/characters/:id/class/transactions ───────────────────────────────
//
// Intent-bearing batch mutation for class-level choices:
//   setSubclass       — choose a subclass when the character's level meets the
//                       class's threshold (e.g. Fighter L3 → Battle Master).
//   setFightingStyle  — choose a Fighter L1 fighting style.
//   addClass          — multiclass into a new class (level-1 entry at the next
//                       position), validated against 5e ability prerequisites.
//
// Returns the full updated character on success.

makeTransactionsEndpoint({
  router: classRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyClassOperations(characterId, data.operations),
  domainErrors: [InvalidClassOperationError],
});
