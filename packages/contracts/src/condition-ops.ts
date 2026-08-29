import { z } from "zod";

/** The 14 standard 5e condition keys, latched to backend `CONDITIONS`; exhaustion is excluded because it's a 0–6 level, not a boolean. */
export const conditionKeySchema = z.enum([
  "blinded",
  "charmed",
  "deafened",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
]);
export type ConditionKey = z.infer<typeof conditionKeySchema>;

/** Add a standard 5e condition. `source` is optional provenance, e.g. "Hold Person". */
export const applyConditionOpSchema = z.object({
  type: z.literal("applyCondition"),
  key: conditionKeySchema,
  source: z.string().min(1).optional(),
});
export type ApplyConditionOperation = z.infer<typeof applyConditionOpSchema>;

export const removeConditionOpSchema = z.object({
  type: z.literal("removeCondition"),
  key: conditionKeySchema,
});
export type RemoveConditionOperation = z.infer<typeof removeConditionOpSchema>;

/** Absolute exhaustion level; the 0-6 range is latched to backend `EXHAUSTION_MAX` (6 = death). */
export const setExhaustionOpSchema = z.object({
  type: z.literal("setExhaustion"),
  level: z.number().int().min(0).max(6),
});
export type SetExhaustionOperation = z.infer<typeof setExhaustionOpSchema>;

export const conditionOperationSchema = z.discriminatedUnion("type", [
  applyConditionOpSchema,
  removeConditionOpSchema,
  setExhaustionOpSchema,
]);
export type ConditionOperation = z.infer<typeof conditionOperationSchema>;
