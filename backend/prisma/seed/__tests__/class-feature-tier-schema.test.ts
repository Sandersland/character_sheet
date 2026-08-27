// Pure unit test (NO database) for #1522's settled tier-array ordering rule:
// every ClassFeature tier column (resourceTotals/resourceDieTiers/
// derivedStatTiers/resourceRechargeTiers) is authored ASCENDING by minLevel,
// last-match-wins. Settled because the two shapes being merged disagreed —
// EXTRA_ATTACK_TIERS is descending/first-match while #1522's own
// resourceTotals example is ascending — so every one of these columns shares
// ONE zod-enforced invariant rather than inheriting the ambiguity. Nothing in
// this migration populates resourceTotals/resourceDieTiers/derivedStatTiers
// yet (#1528+ is the first consumer); this only proves the validator itself
// rejects a descending array.
//
// Driven through classFeatureSeedSchema.safeParse, not the per-column tier
// schemas directly: those are intentionally un-exported (class-features.ts)
// since classFeatureSeedSchema is the surface that actually ships, and
// testing through it exercises the SAME `.refine` predicate as the
// production validation path (prisma/seed/validate.ts) rather than a second,
// bypassable entry point.
import { describe, expect, it } from "vitest";

import { classFeatureSeedSchema } from "../class-features.js";

const baseRow = {
  className: "Fighter",
  subclassSlug: null,
  name: "Test Feature",
  level: 1,
  description: "test",
  edition: "EDITION_2024" as const,
};

describe("ClassFeature tier-array schemas reject a descending minLevel order (#1522)", () => {
  it("resourceTotals accepts strictly ascending minLevel", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [
        { minLevel: 1, total: 2 },
        { minLevel: 4, total: 3 },
        { minLevel: 10, total: 4 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("resourceTotals rejects a DESCENDING array — the EXTRA_ATTACK_TIERS shape", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [
        { minLevel: 20, total: 4 },
        { minLevel: 11, total: 3 },
        { minLevel: 5, total: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("resourceTotals rejects a repeated minLevel (not strictly increasing)", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [
        { minLevel: 1, total: 2 },
        { minLevel: 1, total: 3 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("resourceDieTiers rejects descending order", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceDieTiers: [
        { minLevel: 18, die: "d12" },
        { minLevel: 10, die: "d10" },
        { minLevel: 1, die: "d8" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("derivedStatTiers rejects descending order", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      derivedStatTiers: [
        { minLevel: 11, value: 3 },
        { minLevel: 5, value: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("derivedStatTiers accepts ascending order with a string value", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      derivedStatTiers: [
        { minLevel: 5, value: "19-20" },
        { minLevel: 15, value: "18-20" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("resourceRechargeTiers accepts strictly ascending minLevel", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceRechargeTiers: [
        { minLevel: 1, recharge: "longRest" },
        { minLevel: 5, recharge: "short-or-long" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("resourceRechargeTiers rejects descending order", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceRechargeTiers: [
        { minLevel: 5, recharge: "short-or-long" },
        { minLevel: 1, recharge: "longRest" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("resourceRechargeTiers rejects an unrecognized recharge value", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceRechargeTiers: [{ minLevel: 1, recharge: "everyTurn" }],
    });
    expect(result.success).toBe(false);
  });
});

// resourceDetailTiers (#1685): ASCENDING PER LABEL, not globally — two
// different labels may interleave their minLevels freely, since each forms
// its own independent progression (2014 Wild Shape's "Max CR"/"Duration").
describe("resourceDetailTiers accepts interleaved-but-per-label-ascending order and rejects a per-label descending pair (#1685)", () => {
  it("accepts two labels interleaved in the array, each strictly ascending on its own", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceDetailTiers: [
        { minLevel: 2, label: "Max CR", value: "1/4" },
        { minLevel: 2, label: "Duration", value: "1 hour(s)" },
        { minLevel: 4, label: "Max CR", value: "1/2 (no flying speed)" },
        { minLevel: 6, label: "Duration", value: "3 hour(s)" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a descending pair WITHIN the same label, even though the array's raw order looks fine for a different label", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceDetailTiers: [
        { minLevel: 4, label: "Max CR", value: "1/2" },
        { minLevel: 2, label: "Max CR", value: "1/4" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a repeated minLevel within the same label (not strictly increasing)", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceDetailTiers: [
        { minLevel: 2, label: "Max CR", value: "1/4" },
        { minLevel: 2, label: "Max CR", value: "1/2" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty array — authoring garbage, same as resourceRechargeTiers", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceDetailTiers: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty label", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceDetailTiers: [{ minLevel: 1, label: "", value: "1/4" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty value", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceDetailTiers: [{ minLevel: 1, label: "Max CR", value: "" }],
    });
    expect(result.success).toBe(false);
  });
});

// A row with resourceRechargeTiers and no resourceRecharge scalar has no
// fallback below the tiers' first minLevel — poolFromRow would silently
// resolve "none" at any level the pool exists but no tier is reached yet.
describe("resourceRechargeTiers' first tier must be reached by resourceTotals' first tier when there is no resourceRecharge fallback", () => {
  it("rejects a gap: the pool opens at level 1 but the first recharge tier isn't reached until level 5", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: 2 }],
      resourceRechargeTiers: [{ minLevel: 5, recharge: "short-or-long" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts the same gap when a resourceRecharge scalar covers the levels below the first tier", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceRecharge: "longRest",
      resourceTotals: [{ minLevel: 1, total: 2 }],
      resourceRechargeTiers: [{ minLevel: 5, recharge: "short-or-long" }],
    });
    expect(result.success).toBe(true);
  });

  // An empty array is truthy in JS, so `!row.resourceRechargeTiers` alone
  // doesn't short-circuit the refine for it — reading `[0].minLevel` off an
  // empty array would throw inside the refine instead of failing validation.
  it("resourceRechargeTiers: [] is a clean validation FAILURE, not a thrown error", () => {
    expect(() =>
      classFeatureSeedSchema.safeParse({
        ...baseRow,
        resourceRechargeTiers: [],
      }),
    ).not.toThrow();
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceRechargeTiers: [],
    });
    expect(result.success).toBe(false);
  });

  // Same empty-array hazard on the OTHER side of the refine's condition:
  // `!row.resourceTotals` doesn't short-circuit for `resourceTotals: []`
  // either. This row has valid recharge tiers and no scalar fallback, so the
  // refine reaches the `resourceTotals[0]` read — it must not throw. Whether
  // safeParse then accepts or rejects the row is secondary to that; it
  // ACCEPTS here, since an empty resourceTotals means no pool ever opens, so
  // there is no level at which the missing recharge coverage matters.
  it("resourceTotals: [] alongside recharge tiers and no scalar does not throw, and is accepted (no pool ever opens to need recharge coverage)", () => {
    expect(() =>
      classFeatureSeedSchema.safeParse({
        ...baseRow,
        resourceRechargeTiers: [{ minLevel: 5, recharge: "short-or-long" }],
        resourceTotals: [],
      }),
    ).not.toThrow();
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceRechargeTiers: [{ minLevel: 5, recharge: "short-or-long" }],
      resourceTotals: [],
    });
    expect(result.success).toBe(true);
  });
});

// #1685/#416 C3: total may be a formula instead of a flat number. Driven
// through classFeatureSeedSchema.safeParse for the same reason as the suite
// above — the one surface that actually ships (prisma/seed/validate.ts's
// assertSeedContentValid runs it at seed time, so a malformed formula fails
// the seed, never a character's read path).
describe("resourceTotals' `total` accepts the #1685 formula vocabulary and rejects malformed formulas", () => {
  it('accepts "proficiencyBonus"', () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: "proficiencyBonus" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts { abilityMod, min }", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: { abilityMod: "charisma", min: 1 } }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts { abilityMod } with no min", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: { abilityMod: "wisdom" } }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts { levelTimes }", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: { levelTimes: 5 } }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unrecognized formula string (e.g. a typo\'d "proficiencyBonus")', () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: "proficiencyBonu" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized abilityMod name", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: { abilityMod: "luck" } }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive levelTimes", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: { levelTimes: 0 } }],
    });
    expect(result.success).toBe(false);
  });
});

// #1686: effectBuffs is a NEW nullable/optional list on ClassFeature — a
// "toggle" resolverKind row's while-active buff descriptors. Driven through
// classFeatureSeedSchema.safeParse for the same reason as every suite above:
// prisma/seed/validate.ts's assertSeedContentValid is the one surface that
// actually ships.
describe("effectBuffs (#1686) — the toggle-resolver buff-list vocabulary", () => {
  it("accepts a minimal buff (flat number modifier, a known target)", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      effectBuffs: [{ key: "rage", target: "meleeDamage", modifier: 2, duration: "while-active" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown target that isn't the buff's own key", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      effectBuffs: [{ key: "rage", target: "notARealTarget", modifier: 2, duration: "while-active" }],
    });
    expect(result.success).toBe(false);
  });

  it("admits the marker-buff form — target equal to the buff's own key — even though it names no known stat (Elemental Attunement's shape)", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      effectBuffs: [{ key: "elementalAttunement", target: "elementalAttunement", modifier: 0, duration: "while-active" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a skill-name target (any of the 18 skill keys)", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      effectBuffs: [{ key: "guidance", target: "athletics", modifier: 1, duration: "concentration" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unrecognized duration", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      effectBuffs: [{ key: "rage", target: "meleeDamage", modifier: 2, duration: "forever" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a tiered modifier — ascending minLevel, last-match-wins — mirroring resourceTotals' own tier invariant", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      effectBuffs: [
        {
          key: "rage",
          target: "meleeDamage",
          modifier: [
            { minLevel: 1, value: 2 },
            { minLevel: 9, value: 3 },
            { minLevel: 16, value: 4 },
          ],
          duration: "while-active",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a DESCENDING tiered modifier — the same ordering rule every other tier column enforces", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      effectBuffs: [
        {
          key: "rage",
          target: "meleeDamage",
          modifier: [
            { minLevel: 16, value: 4 },
            { minLevel: 1, value: 2 },
          ],
          duration: "while-active",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts resistDamageTypes and rollEffects (Rage needs both)", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      effectBuffs: [
        {
          key: "rage",
          target: "meleeDamage",
          modifier: 2,
          duration: "while-active",
          resistDamageTypes: ["bludgeoning", "piercing", "slashing"],
          rollEffects: [
            { mode: "advantage", kind: "check", ability: "strength" },
            { mode: "advantage", kind: "save", ability: "strength" },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unrecognized rollEffects mode", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      effectBuffs: [
        {
          key: "rage",
          target: "meleeDamage",
          modifier: 2,
          duration: "while-active",
          rollEffects: [{ mode: "sneaky", kind: "check", ability: "strength" }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an entry-level minLevel gate plus an endReminder/clearOn (#1688's equip-trigger vocabulary, a list)", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      effectBuffs: [
        {
          key: "bladesong",
          target: "ac",
          modifier: { abilityMod: "intelligence", min: 1 },
          duration: "concentration",
          minLevel: 14,
          clearOn: ["equipMediumArmor", "equipHeavyArmor", "equipShield"],
          endReminder: "Bladesong ends if you attack with a weapon other than a light one, or cast a spell other than an Illusion or Transmutation spell.",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a clearOn entry outside the closed CLEAR_ON_TRIGGERS vocabulary", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      effectBuffs: [
        { key: "bladesong", target: "ac", modifier: 1, duration: "while-active", clearOn: ["concentrationEnds"] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a buff missing a required field (no `key`)", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      effectBuffs: [{ target: "meleeDamage", modifier: 2, duration: "while-active" }],
    });
    expect(result.success).toBe(false);
  });
});

// #1688: activationRequires' closed vocabulary — an armor/shield literal or a
// `requiresActiveBuff` object. Driven through classFeatureSeedSchema.safeParse
// for the same reason as effectBuffs above: the production validation path
// (prisma/seed/validate.ts) is what this pins, not an un-exported schema.
describe("activationRequires (#1688) — the declarative activation-constraint vocabulary", () => {
  it("accepts every armor/shield literal", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      activationRequires: ["noMediumArmor", "noHeavyArmor", "noShield", "noBodyArmor"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a requiresActiveBuff object naming another buff's key", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      activationRequires: [{ requiresActiveBuff: "bladesong" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a mix of armor literals and requiresActiveBuff in one list", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      activationRequires: ["noMediumArmor", "noShield", { requiresActiveBuff: "bladesong" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unrecognized literal outside the closed vocabulary", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      activationRequires: ["noRobe"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a requiresActiveBuff object with an empty key", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      activationRequires: [{ requiresActiveBuff: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a requiresActiveBuff object carrying an unknown extra field (strict)", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      activationRequires: [{ requiresActiveBuff: "bladesong", extra: true }],
    });
    expect(result.success).toBe(false);
  });

  it("null/absent activationRequires is valid (the common case)", () => {
    expect(classFeatureSeedSchema.safeParse({ ...baseRow, activationRequires: null }).success).toBe(true);
    expect(classFeatureSeedSchema.safeParse({ ...baseRow }).success).toBe(true);
  });
});
