/**
 * Hit-point transaction-op schemas for POST /api/characters/:id/hp (#1390).
 * The route value-imports `hitPointOperationSchema` and runs `.parse()`; the
 * lib/combat dispatcher and the frontend both take their types from `z.infer`
 * of these same schemas, replacing what used to be three declarations per op
 * (the route's zod object, a backend lib interface, and a frontend interface).
 *
 * Upper bounds that depend on live character state — how many hit dice remain,
 * which die a class rolls, whether the character is actually at 0 HP — are
 * deliberately NOT here: they are validated in lib/combat against the fetched
 * row. A schema here is a shape contract, never a 5e rule.
 *
 * `LongRestOperation` and `StabilizeOperation` have no type export on purpose:
 * neither has a consumer (both ops are payload-free and reachable as members of
 * `HitPointOperation`), and a forwarded-only name is a dead export under the
 * repo-wide fallow gate.
 */
import { z } from "zod";

/** HP damage: temp absorbs first, then current. Floors at 0. */
export const damageOpSchema = z.object({
  type: z.literal("damage"),
  amount: z.number().int().positive(),
  /** Optional 5e damage type (e.g. "slashing"); drives resistance auto-halving (#456). */
  damageType: z.string().min(1).optional(),
  /**
   * Manual override for resistance auto-halving (#456). Omitted/true auto-halves
   * when a matching resistance is active; false declines (take the full amount).
   */
  applyResistance: z.boolean().optional(),
  /**
   * Whether a triggered concentration CON save is auto-rolled server-side
   * (default) or deferred for the client to roll (issue #76). Treated as
   * auto when omitted or true; only `false` defers. The death/0-HP path
   * ends concentration with no save regardless of this flag.
   */
  autoRollConcentration: z.boolean().optional(),
});
export type DamageOperation = z.infer<typeof damageOpSchema>;

/** HP healing. If current was 0 (dying), resets death saves. */
export const healOpSchema = z.object({
  type: z.literal("heal"),
  amount: z.number().int().positive(),
});
export type HealOperation = z.infer<typeof healOpSchema>;

/** Set temporary HP. 5e rule: doesn't stack — takes the higher. */
export const setTempOpSchema = z.object({
  type: z.literal("setTemp"),
  amount: z.number().int().nonnegative(),
});
export type SetTempOperation = z.infer<typeof setTempOpSchema>;

/**
 * Short rest: spend hit dice to heal. `rolls` is an array of raw die values
 * (1..hitDieFace), one per die spent. Client rolls via dice.ts and sends the
 * raw values; server validates range and applies the rules math.
 *
 * `rolls` may be empty (spending 0 dice is a no-op; the UI typically disables
 * this). Upper-bound / range validation is done in lib/combat against live state.
 */
export const shortRestOpSchema = z.object({
  type: z.literal("shortRest"),
  rolls: z.array(z.number().int().min(1)),
});
export type ShortRestOperation = z.infer<typeof shortRestOpSchema>;

/** Long rest: restore full HP, clear temp, recover half spent hit dice (min 1). */
export const longRestOpSchema = z.object({
  type: z.literal("longRest"),
});

/**
 * Which class a level-up advances (issue #124):
 * - omitted → position-0 self-heal, exactly as before multiclassing (BC).
 * - existing → increment an existing CharacterClassEntry by classEntryId.
 * - new → add a second class (multiclass); enforces 5e ability prerequisites.
 *
 * Also parsed on its own by the level-up ceremony endpoint, which takes a bare
 * `target` rather than a levelUp op.
 */
export const levelUpTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), classEntryId: z.string().min(1) }),
  z.object({ kind: z.literal("new"), classId: z.string().min(1) }),
]);
export type LevelUpTarget = z.infer<typeof levelUpTargetSchema>;

/**
 * Level-up: adds 1 to hitDice.total, increases max and current HP.
 * Requires a pending level (derivedLevel > hitDice.total).
 * For "roll" method the client rolls via dice.ts and sends the raw die face;
 * for "average" the server computes the fixed average.
 * `target` chooses which class advances; HP/hit-dice use THAT class's hit die.
 *
 * `roll` is optional here — the lib validates it's present and within the
 * advancing class's die faces when method === "roll".
 */
export const levelUpOpSchema = z.object({
  type: z.literal("levelUp"),
  method: z.enum(["average", "roll"]),
  roll: z.number().int().min(1).optional(),
  target: levelUpTargetSchema.optional(),
});
export type LevelUpOperation = z.infer<typeof levelUpOpSchema>;

/**
 * Roll a death save (d20). Only valid when current === 0.
 * Client rolls via dice.ts and sends the raw value.
 */
export const deathSaveOpSchema = z.object({
  type: z.literal("deathSave"),
  roll: z.number().int().min(1).max(20),
});
export type DeathSaveOperation = z.infer<typeof deathSaveOpSchema>;

/** Stabilize the character (Medicine check success, etc.). Only valid when current === 0. */
export const stabilizeOpSchema = z.object({
  type: z.literal("stabilize"),
});

/**
 * Resolve a deferred concentration CON save with a client-rolled d20 (issue #76).
 * Emitted as a follow-up to a `damage` op that ran with `autoRollConcentration:
 * false` and returned a `pending` check. The server recomputes the DC from
 * `damage` (it never trusts a client DC) and the save bonus from the live
 * character; `roll` is the only client-supplied value (validated 1..20, like
 * deathSave). No-op if the character is no longer concentrating on `entryId`.
 */
export const concentrationSaveOpSchema = z.object({
  type: z.literal("concentrationSave"),
  entryId: z.string().min(1),
  roll: z.number().int().min(1).max(20),
  damage: z.number().int().positive(),
});
export type ConcentrationSaveOperation = z.infer<typeof concentrationSaveOpSchema>;

export const hitPointOperationSchema = z.discriminatedUnion("type", [
  damageOpSchema,
  healOpSchema,
  setTempOpSchema,
  shortRestOpSchema,
  longRestOpSchema,
  levelUpOpSchema,
  deathSaveOpSchema,
  stabilizeOpSchema,
  concentrationSaveOpSchema,
]);
export type HitPointOperation = z.infer<typeof hitPointOperationSchema>;
