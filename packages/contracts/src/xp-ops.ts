import { z } from "zod";

export const awardXpOpSchema = z.object({
  type: z.literal("award"),
  /** Signed — positive = gain, negative = correction/deduction. */
  amount: z.number().int(),
});

export const setXpOpSchema = z.object({
  type: z.literal("set"),
  value: z.number().int().nonnegative(),
});

export const experienceOperationSchema = z.discriminatedUnion("type", [awardXpOpSchema, setXpOpSchema]);
export type ExperienceOperation = z.infer<typeof experienceOperationSchema>;
