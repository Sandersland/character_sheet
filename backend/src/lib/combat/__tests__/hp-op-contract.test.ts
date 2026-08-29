// expectTypeOf is erased at runtime, so these type assertions are gated by `npm run typecheck`, not vitest.
// Route tests assert only res.status, so these safeParse bound checks are what catches schema drift from lib/combat's runtime checks.
import {
  concentrationSaveOpSchema,
  damageOpSchema,
  deathSaveOpSchema,
  healOpSchema,
  hitPointOperationSchema,
  levelUpOpSchema,
  levelUpTargetSchema,
  longRestOpSchema,
  setTempOpSchema,
  shortRestOpSchema,
  stabilizeOpSchema,
  type ConcentrationSaveOperation,
  type DamageOperation,
  type DeathSaveOperation,
  type HealOperation,
  type HitPointOperation,
  type LevelUpOperation,
  type SetTempOperation,
  type ShortRestOperation,
} from "@character-sheet/contracts";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

describe("hit-point op wire contract", () => {
  it("keeps every migrated op's client-constructible input identical to its inferred type", () => {
    expectTypeOf<z.input<typeof damageOpSchema>>().toEqualTypeOf<z.output<typeof damageOpSchema>>();
    expectTypeOf<z.input<typeof healOpSchema>>().toEqualTypeOf<z.output<typeof healOpSchema>>();
    expectTypeOf<z.input<typeof setTempOpSchema>>().toEqualTypeOf<z.output<typeof setTempOpSchema>>();
    expectTypeOf<z.input<typeof shortRestOpSchema>>().toEqualTypeOf<z.output<typeof shortRestOpSchema>>();
    expectTypeOf<z.input<typeof longRestOpSchema>>().toEqualTypeOf<z.output<typeof longRestOpSchema>>();
    expectTypeOf<z.input<typeof levelUpTargetSchema>>().toEqualTypeOf<z.output<typeof levelUpTargetSchema>>();
    expectTypeOf<z.input<typeof levelUpOpSchema>>().toEqualTypeOf<z.output<typeof levelUpOpSchema>>();
    expectTypeOf<z.input<typeof deathSaveOpSchema>>().toEqualTypeOf<z.output<typeof deathSaveOpSchema>>();
    expectTypeOf<z.input<typeof stabilizeOpSchema>>().toEqualTypeOf<z.output<typeof stabilizeOpSchema>>();
    expectTypeOf<z.input<typeof concentrationSaveOpSchema>>().toEqualTypeOf<
      z.output<typeof concentrationSaveOpSchema>
    >();
    expectTypeOf<z.input<typeof hitPointOperationSchema>>().toEqualTypeOf<
      z.output<typeof hitPointOperationSchema>
    >();
  });

  it("carries every HP op the dispatcher accepts", () => {
    // longRest and stabilize are payload-free with no exported type, so they are named by z.infer here.
    expectTypeOf<HitPointOperation>().toEqualTypeOf<
      | DamageOperation
      | HealOperation
      | SetTempOperation
      | ShortRestOperation
      | z.infer<typeof longRestOpSchema>
      | LevelUpOperation
      | DeathSaveOperation
      | z.infer<typeof stabilizeOpSchema>
      | ConcentrationSaveOperation
    >();
  });

  it("bounds a death save to a real d20 face", () => {
    const at = (roll: number) => hitPointOperationSchema.safeParse({ type: "deathSave", roll }).success;
    expect(at(0)).toBe(false);
    expect(at(1)).toBe(true);
    expect(at(20)).toBe(true);
    expect(at(21)).toBe(false);
  });

  it("requires damage to be a positive whole number", () => {
    expect(hitPointOperationSchema.safeParse({ type: "damage", amount: 0 }).success).toBe(false);
    expect(hitPointOperationSchema.safeParse({ type: "damage", amount: -1 }).success).toBe(false);
    expect(hitPointOperationSchema.safeParse({ type: "damage", amount: 1.5 }).success).toBe(false);
    expect(hitPointOperationSchema.safeParse({ type: "damage", amount: 7 }).success).toBe(true);
  });

  it("allows zero temp HP but not negative — setTemp is an absolute value", () => {
    expect(hitPointOperationSchema.safeParse({ type: "setTemp", amount: 0 }).success).toBe(true);
    expect(hitPointOperationSchema.safeParse({ type: "setTemp", amount: -1 }).success).toBe(false);
  });

  it("accepts a short rest that spends no hit dice, and rejects a die face below 1", () => {
    expect(hitPointOperationSchema.safeParse({ type: "shortRest", rolls: [] }).success).toBe(true);
    expect(hitPointOperationSchema.safeParse({ type: "shortRest", rolls: [4, 6] }).success).toBe(true);
    expect(hitPointOperationSchema.safeParse({ type: "shortRest", rolls: [0] }).success).toBe(false);
  });

  it("leaves the levelUp roll optional — the lib decides when it is required", () => {
    expect(hitPointOperationSchema.safeParse({ type: "levelUp", method: "average" }).success).toBe(true);
    expect(hitPointOperationSchema.safeParse({ type: "levelUp", method: "roll" }).success).toBe(true);
    expect(hitPointOperationSchema.safeParse({ type: "levelUp", method: "guess" }).success).toBe(false);
  });

  it("still floors the levelUp roll at a real die face when one is sent", () => {
    const at = (roll: number) =>
      hitPointOperationSchema.safeParse({ type: "levelUp", method: "roll", roll }).success;
    expect(at(1)).toBe(true);
    expect(at(0)).toBe(false);
    expect(at(-1)).toBe(false);
    expect(at(1.5)).toBe(false);
  });

  it("requires a level-up target to name exactly one of classEntryId / classId", () => {
    expect(levelUpTargetSchema.safeParse({ kind: "existing", classEntryId: "ce-1" }).success).toBe(true);
    expect(levelUpTargetSchema.safeParse({ kind: "new", classId: "cls-1" }).success).toBe(true);
    expect(levelUpTargetSchema.safeParse({ kind: "existing", classId: "cls-1" }).success).toBe(false);
    expect(levelUpTargetSchema.safeParse({ kind: "existing", classEntryId: "" }).success).toBe(false);
  });

  it("bounds a deferred concentration save's roll and its triggering damage", () => {
    const base = { type: "concentrationSave", entryId: "spell-1" };
    expect(hitPointOperationSchema.safeParse({ ...base, roll: 14, damage: 9 }).success).toBe(true);
    expect(hitPointOperationSchema.safeParse({ ...base, roll: 21, damage: 9 }).success).toBe(false);
    expect(hitPointOperationSchema.safeParse({ ...base, roll: 14, damage: 0 }).success).toBe(false);
  });
});
