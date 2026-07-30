/**
 * Status-condition transaction-op schemas for
 * POST /api/characters/:id/conditions/transactions (#1390). The route
 * value-imports the union and runs `.parse()`; `applyConditionsOperations` and
 * the frontend both take their types from `z.infer` of these same schemas.
 *
 * Unlike the other families here, this one cannot reach exactly one declaration:
 * the route's enum used to be built from `CONDITIONS`, and its exhaustion bound
 * from `EXHAUSTION_MAX`, both backend rules data that this package may never
 * import (the contracts zone allows no imports at all — see `.fallowrc.jsonc`).
 * So the keys and the bound are literal copies here, and a BACKEND test
 * (`conditions-op-contract.test.ts`, which may import both) asserts they still
 * match the authority. That is still one fewer declaration than before, since
 * the frontend's own 14-key copy is gone. #1391 owns whether to keep this
 * literal-copy-plus-latch shape or find a way to share the source.
 */
import { z } from "zod";

/**
 * The 14 standard 5e status condition keys, for both editions. `CONDITIONS` in
 * backend `lib/srd/condition-data.ts` is the authority; this tuple is a copy
 * latched to it by `conditions-op-contract.test.ts`. Exhaustion is deliberately
 * absent — it is a 0–6 level, not a boolean presence in the active list.
 */
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

/** Remove an active condition by key. */
export const removeConditionOpSchema = z.object({
  type: z.literal("removeCondition"),
  key: conditionKeySchema,
});
export type RemoveConditionOperation = z.infer<typeof removeConditionOpSchema>;

/**
 * Set exhaustion to an absolute level. The 6 is a copy of `EXHAUSTION_MAX`
 * (6 = death) latched to it by `conditions-op-contract.test.ts`; the lib
 * re-checks the same range against that constant.
 */
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
