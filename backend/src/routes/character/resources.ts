// Owns POST /characters/:id/resources/transactions (spend/restore class
// resources, learn/forget maneuvers + tool profs + Expertise). Like every mutation router
// here, it validates a Zod op union, applies it atomically in the lib layer,
// then re-fetches with characterInclude and returns serializeCharacter(updated)
// so the response carries the full, freshly-derived character.
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

// Roll Initiative / combat start (#1239) — applies every pool's onInitiative
// regen at once, so it carries no key.
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

// Exported (#1516) so the level-up ceremony's own submission schema
// (routes/character/level-up.ts) can reuse it verbatim for
// maneuversForgotten — same "one op schema, two call sites" pattern as
// forgetSubclassChoiceOpSchema below.
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

// Exactly-one-of optionId/custom is enforced in the applier (400 on violation),
// so the schema stays a plain ZodObject — no `.refine` (keeps it out of the
// discriminated union's ZodEffects path).
export const learnSubclassChoiceOpSchema = z.object({
  type: z.literal("learnSubclassChoice"),
  choiceKey: z.string().min(1),
  optionId: z.string().optional(),
  custom: z.object({ name: z.string().min(1), description: z.string().min(1) }).optional(),
});

// Exported (#1503) so the level-up ceremony's own submission schema
// (routes/character/level-up.ts) can reuse it verbatim for
// subclassChoicesForgotten — same "one op schema, two call sites" pattern as
// learnSubclassChoiceOpSchema above.
export const forgetSubclassChoiceOpSchema = z.object({
  type: z.literal("forgetSubclassChoice"),
  choiceKey: z.string().min(1),
  entryId: z.string().min(1),
});

// #1588: skill proficiency + the level-derived pick cap are validated in the
// applier (applyLearnExpertiseOp) — never trust a client-supplied legality.
// Exported so the level-up ceremony's own submission schema
// (routes/character/level-up.ts) can reuse it verbatim for the "expertise"
// step, same "one op schema, two call sites" pattern as
// learnToolProficiencyOpSchema above.
export const learnExpertiseOpSchema = z.object({
  type: z.literal("learnExpertise"),
  skill: z.string().min(1),
});

// Freely reversible — no learn-time ceremony gate like forgetManeuver/
// forgetSubclassChoice above (#1588's own decision: Expertise carries no RAW
// swap-only text, so there's nothing to gate). Not exported — mirrors
// forgetToolProficiencyOpSchema above: only the LEARN op needs ceremony reuse.
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
 * Intent-bearing batch mutation for class/subclass resource state — mirrors
 * POST /api/characters/:id/spellcasting/transactions. Operations:
 *   spendResource         — spend one or more units of a pool (e.g. superiority die)
 *   restoreResource       — restore spent units (undo mis-click or Relentless trigger)
 *   rollInitiative        — regain resources on combat start (onInitiative pools, #1239)
 *   learnManeuver         — add a maneuver from catalog or custom payload
 *   forgetManeuver        — 400s here (#1516): both editions bound a maneuver
 *                           replacement to learn-time (PHB'14 Battle Master
 *                           p.73; SRD 5.2 equivalent) — only reachable through
 *                           a validated level-up ceremony step, never this
 *                           generic route.
 *   learnToolProficiency  — choose an artisan's tool (Student of War, level 3+)
 *   forgetToolProficiency — undo a tool proficiency choice by entry id
 *   learnSubclassChoice   — pick an option for a generic subclass choose-N (#899)
 *   forgetSubclassChoice  — 400s here (#1516): same learn-time bound as
 *                           forgetManeuver above (PHB'14 Way of the Four
 *                           Elements p.81 is the other cited text) — only
 *                           reachable through a validated level-up step.
 *   learnExpertise        — double proficiency bonus on a proficient skill (#1588)
 *   forgetExpertise       — undo an Expertise pick by entry id, freely reversible
 *
 * Returns the full updated character on success, plus a top-level `results`
 * array (one ResourceOpAudit per op) so a roll-driven op's outcome — today,
 * rollInitiative's Focus-regen + Uncanny Metabolism heal summary (#1243) —
 * reaches the client for its toast. Mirrors inventory.ts's `useResults`.
 */
makeTransactionsEndpoint({
  router: resourcesRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyResourceOperations(characterId, data.operations),
  domainErrors: [InvalidResourceOperationError],
  respond: (character, results) => ({ ...character, results }),
});
