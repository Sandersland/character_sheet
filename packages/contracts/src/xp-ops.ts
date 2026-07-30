/**
 * XP transaction-op schemas for POST /api/characters/:id/experience (#1390).
 * The route value-imports these and runs `.parse()`; `applyExperienceOperations`
 * and the frontend both take their types from `z.infer` of the same schemas.
 *
 * The `{ operations, sessionId }` envelope stays route-local: `sessionId` is a
 * retroactive-tagging concern of that one endpoint, not part of an op's shape.
 */
import { z } from "zod";

/** Award or deduct XP by a signed delta ("Earned 450 XP from encounter"). */
export const awardXpOpSchema = z.object({
  type: z.literal("award"),
  /** Signed — positive = gain, negative = correction/deduction. */
  amount: z.number().int(),
});

/** Set total XP to an exact value ("Set to 23,000 XP"). */
export const setXpOpSchema = z.object({
  type: z.literal("set"),
  value: z.number().int().nonnegative(),
});

export const experienceOperationSchema = z.discriminatedUnion("type", [awardXpOpSchema, setXpOpSchema]);
export type ExperienceOperation = z.infer<typeof experienceOperationSchema>;
