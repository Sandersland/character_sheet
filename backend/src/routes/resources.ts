// Owns POST /characters/:id/resources/transactions (spend/restore class
// resources, learn/forget maneuvers + tool profs). Like every mutation router
// here, it validates a Zod op union, applies it atomically in the lib layer,
// then re-fetches with characterInclude and returns serializeCharacter(updated)
// so the response carries the full, freshly-derived character.
import { Router } from "express";
import { z } from "zod";

import {
  applyResourceOperations,
  InvalidResourceOperationError,
} from "../lib/resources.js";
import { makeTransactionsEndpoint } from "../lib/transactions-endpoint.js";

export const resourcesRouter = Router({ mergeParams: true });

// ── Zod schemas ───────────────────────────────────────────────────────────────

const spendResourceOpSchema = z.object({
  type: z.literal("spendResource"),
  key: z.string().min(1),
  amount: z.number().int().positive().optional(),
  roll: z.number().int().optional(),
});

const restoreResourceOpSchema = z.object({
  type: z.literal("restoreResource"),
  key: z.string().min(1),
  amount: z.number().int().positive().optional(),
});

const learnManeuverOpSchema = z
  .object({
    type: z.literal("learnManeuver"),
    maneuverId: z.string().optional(),
    custom: z
      .object({ name: z.string().min(1), description: z.string().min(1) })
      .optional(),
  })
  .refine((op) => Boolean(op.maneuverId) !== Boolean(op.custom), {
    message: "Provide exactly one of maneuverId or custom",
  });

const forgetManeuverOpSchema = z.object({
  type: z.literal("forgetManeuver"),
  entryId: z.string().min(1),
});

const customDisciplineSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  minLevel: z.number().int().positive().optional(),
});

const learnDisciplineOpSchema = z
  .object({
    type: z.literal("learnDiscipline"),
    disciplineId: z.string().optional(),
    custom: customDisciplineSchema.optional(),
  })
  .refine((op) => Boolean(op.disciplineId) !== Boolean(op.custom), {
    message: "Provide exactly one of disciplineId or custom",
  });

const forgetDisciplineOpSchema = z.object({
  type: z.literal("forgetDiscipline"),
  entryId: z.string().min(1),
});

const swapDisciplineOpSchema = z
  .object({
    type: z.literal("swapDiscipline"),
    entryId: z.string().min(1),
    disciplineId: z.string().optional(),
    custom: customDisciplineSchema.optional(),
  })
  .refine((op) => Boolean(op.disciplineId) !== Boolean(op.custom), {
    message: "Provide exactly one of disciplineId or custom",
  });

const learnToolProficiencyOpSchema = z.object({
  type: z.literal("learnToolProficiency"),
  name: z.string().min(1),
});

const forgetToolProficiencyOpSchema = z.object({
  type: z.literal("forgetToolProficiency"),
  entryId: z.string().min(1),
});

const operationSchema = z.discriminatedUnion("type", [
  spendResourceOpSchema,
  restoreResourceOpSchema,
  learnManeuverOpSchema,
  forgetManeuverOpSchema,
  learnDisciplineOpSchema,
  forgetDisciplineOpSchema,
  swapDisciplineOpSchema,
  learnToolProficiencyOpSchema,
  forgetToolProficiencyOpSchema,
]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

// ── POST /api/characters/:id/resources/transactions ───────────────────────────
//
// Intent-bearing batch mutation for class/subclass resource state — mirrors
// POST /api/characters/:id/spellcasting/transactions. Operations:
//   spendResource         — spend one or more units of a pool (e.g. superiority die)
//   restoreResource       — restore spent units (undo mis-click or Relentless trigger)
//   learnManeuver         — add a maneuver from catalog or custom payload
//   forgetManeuver        — remove a known maneuver by entry id
//   learnDiscipline       — add an elemental discipline (Four Elements monk)
//   forgetDiscipline      — remove a known discipline by entry id
//   swapDiscipline        — retrain one discipline for another (1 per monk level)
//   learnToolProficiency  — choose an artisan's tool (Student of War, level 3+)
//   forgetToolProficiency — undo a tool proficiency choice by entry id
//
// Returns the full updated character on success.

makeTransactionsEndpoint({
  router: resourcesRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyResourceOperations(characterId, data.operations),
  domainErrors: [InvalidResourceOperationError],
});
