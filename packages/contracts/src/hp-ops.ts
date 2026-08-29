/** Upper bounds that depend on live character state are validated in lib/combat, not here — this is a shape contract, not a 5e rule. */
import { z } from "zod";

/** HP damage: temp absorbs first, then current. Floors at 0. */
export const damageOpSchema = z.object({
  type: z.literal("damage"),
  amount: z.number().int().positive(),
  /** Optional 5e damage type (e.g. "slashing"); drives resistance auto-halving. */
  damageType: z.string().min(1).optional(),
  /** Manual override for resistance auto-halving: omitted/true auto-halves when a matching resistance is active, false takes the full amount. */
  applyResistance: z.boolean().optional(),
  /** Whether a triggered concentration save auto-rolls server-side (default) or defers to the client; only `false` defers, and the death/0-HP path always ends concentration with no save. */
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

/** `rolls` are raw die values (1..hitDieFace), one per hit die spent; server validates range and applies the math. Empty array is a no-op. */
export const shortRestOpSchema = z.object({
  type: z.literal("shortRest"),
  rolls: z.array(z.number().int().min(1)),
});
export type ShortRestOperation = z.infer<typeof shortRestOpSchema>;

/**
 * Long rest: restore full HP, clear temp, recover half spent hit dice (min 1).
 * No type export: unused so far, and an unused export fails the dead-code gate.
 */
export const longRestOpSchema = z.object({
  type: z.literal("longRest"),
});

/** Which class a level-up advances: omitted is the position-0 class; `existing` increments that CharacterClassEntry; `new` adds a multiclass and enforces the 5e ability prerequisites. */
export const levelUpTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), classEntryId: z.string().min(1) }),
  z.object({ kind: z.literal("new"), classId: z.string().min(1) }),
]);
export type LevelUpTarget = z.infer<typeof levelUpTargetSchema>;

/** Requires a pending level (derivedLevel > hitDice.total); `roll` method sends the raw die face (validated present/in-range only then), `average` has the server compute it; `target` selects which class's hit die is used. */
export const levelUpOpSchema = z.object({
  type: z.literal("levelUp"),
  method: z.enum(["average", "roll"]),
  roll: z.number().int().min(1).optional(),
  target: levelUpTargetSchema.optional(),
});
export type LevelUpOperation = z.infer<typeof levelUpOpSchema>;

/** Roll a death save (d20). Only valid when current === 0. Client sends the raw value. */
export const deathSaveOpSchema = z.object({
  type: z.literal("deathSave"),
  roll: z.number().int().min(1).max(20),
});
export type DeathSaveOperation = z.infer<typeof deathSaveOpSchema>;

/**
 * Stabilize the character (Medicine check success, etc.). Only valid when
 * current === 0. No type export: unused so far, and an unused export fails the
 * dead-code gate.
 */
export const stabilizeOpSchema = z.object({
  type: z.literal("stabilize"),
});

/** Server recomputes the DC from `damage` and the save bonus from the live character (never trusts a client DC); no-op if no longer concentrating on `entryId`. */
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
