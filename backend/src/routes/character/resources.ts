import { Router } from "express";
import { z } from "zod";

import {
  applyResourceOperations,
  InvalidResourceOperationError,
} from "@/lib/classes/resources.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const resourcesRouter = Router({ mergeParams: true });

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

// Applies every pool's onInitiative regen at once, so it carries no key.
const rollInitiativeOpSchema = z.object({
  type: z.literal("rollInitiative"),
});

export const learnManeuverOpSchema = z
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

// Exported for reuse by the level-up ceremony's maneuversForgotten step.
export const forgetManeuverOpSchema = z.object({
  type: z.literal("forgetManeuver"),
  entryId: z.string().min(1),
});

export const learnToolProficiencyOpSchema = z.object({
  type: z.literal("learnToolProficiency"),
  name: z.string().min(1),
});

const forgetToolProficiencyOpSchema = z.object({
  type: z.literal("forgetToolProficiency"),
  entryId: z.string().min(1),
});

// Exactly-one-of optionId/custom is enforced in the applier (400 on violation), so the schema stays a plain ZodObject — no `.refine` (keeps it out of the discriminated union's ZodEffects path).
export const learnSubclassChoiceOpSchema = z.object({
  type: z.literal("learnSubclassChoice"),
  choiceKey: z.string().min(1),
  optionId: z.string().optional(),
  custom: z.object({ name: z.string().min(1), description: z.string().min(1) }).optional(),
});

// Exported for reuse by the level-up ceremony's subclassChoicesForgotten step.
export const forgetSubclassChoiceOpSchema = z.object({
  type: z.literal("forgetSubclassChoice"),
  choiceKey: z.string().min(1),
  entryId: z.string().min(1),
});

// Skill proficiency + the level-derived pick cap are validated in the applier (applyLearnExpertiseOp) — never trust a client-supplied legality. Exported for reuse by the level-up ceremony's expertise step.
export const learnExpertiseOpSchema = z.object({
  type: z.literal("learnExpertise"),
  skill: z.string().min(1),
});

// Freely reversible — no learn-time ceremony gate like forgetManeuver/forgetSubclassChoice above (Expertise carries no RAW swap-only text, so there's nothing to gate).
const forgetExpertiseOpSchema = z.object({
  type: z.literal("forgetExpertise"),
  entryId: z.string().min(1),
});

const operationSchema = z.discriminatedUnion("type", [
  spendResourceOpSchema,
  restoreResourceOpSchema,
  rollInitiativeOpSchema,
  learnManeuverOpSchema,
  forgetManeuverOpSchema,
  learnToolProficiencyOpSchema,
  forgetToolProficiencyOpSchema,
  learnSubclassChoiceOpSchema,
  forgetSubclassChoiceOpSchema,
  learnExpertiseOpSchema,
  forgetExpertiseOpSchema,
]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

/**
 * POST /api/characters/:id/resources/transactions
 * forgetManeuver 400s here — both editions bind a maneuver replacement to learn-time (PHB'14 Battle Master p.73; SRD 5.2 equivalent), only reachable through a validated level-up step.
 * forgetSubclassChoice 400s here for the same reason (PHB'14 Way of the Four Elements p.81).
 * Returns the character plus a top-level `results` array (one ResourceOpAudit per op), mirroring inventory.ts's `useResults`.
 */
makeTransactionsEndpoint({
  router: resourcesRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyResourceOperations(characterId, data.operations),
  domainErrors: [InvalidResourceOperationError],
  respond: (character, results) => ({ ...character, results }),
});
