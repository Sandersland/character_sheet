// #1231 commit 4: `lib/classes/rogue.ts` is deleted and `rogue` no longer
// appears in registry.ts's module-private `const CLASSES` map at all —
// direct analogue of fighter-unregistered.test.ts (#1532), which proved the
// same deletion silent for Fighter's three subclasses. `SUBCLASSES` is built
// by seeding SUBCLASS_IDENTITY first (registry.ts), so Rogue's three
// subclasses (Arcane Trickster/Assassin/Thief) resolve entirely through that
// identity-only seed now, with no TS SubclassDefinition backing them. This
// file is the DB-backed proof that they still resolve correctly — real
// seeded rows via loadDbFeatureRows, not a TS fixture mirror, so a
// regression in the real catalog can't hide behind a hand-copied fixture.
import { describe, expect, it } from "vitest";

import { deriveEntryScopedResources, deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { loadDbFeatureRows } from "./db-feature-rows.fixture.js";

const ABILITY_SCORES = {
  strength: 10,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  wisdom: 13,
  charisma: 10,
};

const EDITIONS = ["EDITION_2014", "EDITION_2024"] as const;

// Named, not counted: `mergeLayers` merges base + subclass features, so a
// Rogue's BASE rows (Expertise, Sneak Attack, ...) alone would satisfy a bare
// `features.length > 0` — that shape is exactly the vacuity Fighter's own
// arbiter-mutation review caught (#1532). Naming one subclass-scoped row per
// subclass — each confirmed present in rogue-features.ts, in BOTH editions
// (every Rogue subclass row is forked, #1231 commit 2) — is what actually
// proves a subclass-scoped row survived.
const SUBCLASS_SCOPED_FEATURES: Record<"arcane trickster" | "assassin" | "thief", readonly [string, string]> = {
  "arcane trickster": ["Mage Hand Legerdemain", "Magical Ambush"],
  assassin: ["Assassinate", "Death Strike"],
  thief: ["Fast Hands", "Supreme Sneak"],
};

// Six cells: 3 subclasses x 2 editions, each its own it.each row (not a
// subclass-level test looping editions internally) so a mutation that drops
// every subclass's rows shows as six independently-red lines, not one test
// that aborts at the first failing edition and never reports the second.
const CELLS = (Object.keys(SUBCLASS_SCOPED_FEATURES) as (keyof typeof SUBCLASS_SCOPED_FEATURES)[]).flatMap((subclass) =>
  EDITIONS.map((edition) => [subclass, edition] as const),
);

// Level 17: every Rogue subclass activates at L3 (subclassGateLevel's
// undefined-grantLevel fallback, both editions — Rogue's own grantLevel was
// always 3, matching that fallback, which is WHY this class is deletable at
// all; verified, not assumed). L17 clears every SUBCLASS_SCOPED_FEATURES
// row's own level gate in both editions (Death Strike is the highest, at
// L17 in both).
describe("Arcane Trickster, Assassin and Thief all still resolve their OWN seeded subclass-scoped rows with rogue.ts gone", () => {
  const LEVEL = 17;

  it.each(CELLS)("%s/%s: its own subclass-scoped feature rows survive", async (subclass, edition) => {
    const featureRows = await loadDbFeatureRows("rogue", subclass);
    const info = deriveResources("rogue", subclass, LEVEL, ABILITY_SCORES, proficiencyBonusForLevel(LEVEL), featureRows, edition);
    expect(info, `${subclass}/${edition}`).not.toBeNull();
    const names = info?.features.map((f) => f.name) ?? [];
    for (const expectedName of SUBCLASS_SCOPED_FEATURES[subclass]) {
      expect(names, `${subclass}/${edition} missing "${expectedName}"`).toContain(expectedName);
    }
  });

  it("none of the three subclasses declares a resource pool of its own (Rogue has none in either edition)", async () => {
    for (const subclass of Object.keys(SUBCLASS_SCOPED_FEATURES) as (keyof typeof SUBCLASS_SCOPED_FEATURES)[]) {
      const featureRows = await loadDbFeatureRows("rogue", subclass);
      for (const edition of EDITIONS) {
        const info = deriveResources("rogue", subclass, LEVEL, ABILITY_SCORES, proficiencyBonusForLevel(LEVEL), featureRows, edition);
        expect(info?.resources ?? [], `${subclass}/${edition}`).toEqual([]);
      }
    }
  });
});

// The absent-class base layer: Rogue itself (not a subclass) has no
// `ClassDefinition` in `CLASSES` any more either, so `deriveBaseLayer`'s
// `classDef?.resourceFn` / `classDef?.features ?? []` optional-chaining is
// exercised for real here, not just structurally. Named feature-presence
// checks (not a pool, since Rogue declares none) at levels that discriminate
// each edition's OWN gate/removal — pinned as the pre-deletion baseline this
// issue must not move.
describe("Rogue's absent-class base layer resolves identically to before deletion, at every gate level", () => {
  const GATES: { level: number; edition: (typeof EDITIONS)[number]; expectPresent: string[]; expectAbsent: string[] }[] = [
    { level: 1, edition: "EDITION_2014", expectPresent: ["Expertise", "Sneak Attack", "Thieves' Cant"], expectAbsent: ["Weapon Mastery"] },
    { level: 1, edition: "EDITION_2024", expectPresent: ["Expertise", "Sneak Attack", "Thieves' Cant", "Weapon Mastery"], expectAbsent: [] },
    { level: 7, edition: "EDITION_2014", expectPresent: ["Evasion"], expectAbsent: ["Reliable Talent"] },
    { level: 7, edition: "EDITION_2024", expectPresent: ["Evasion", "Reliable Talent"], expectAbsent: [] },
    { level: 14, edition: "EDITION_2014", expectPresent: ["Blindsense"], expectAbsent: ["Devious Strikes"] },
    { level: 14, edition: "EDITION_2024", expectPresent: ["Devious Strikes"], expectAbsent: ["Blindsense"] },
    { level: 20, edition: "EDITION_2014", expectPresent: ["Stroke of Luck"], expectAbsent: ["Epic Boon"] },
    { level: 20, edition: "EDITION_2024", expectPresent: ["Stroke of Luck", "Epic Boon"], expectAbsent: [] },
  ];

  it.each(GATES)("L$level/$edition: base features gate correctly", async ({ level, edition, expectPresent, expectAbsent }) => {
    const featureRows = await loadDbFeatureRows("rogue", undefined);
    const info = deriveResources("rogue", undefined, level, ABILITY_SCORES, proficiencyBonusForLevel(level), featureRows, edition);
    expect(info, `L${level}/${edition}`).not.toBeNull();
    const names = info?.features.map((f) => f.name) ?? [];
    for (const name of expectPresent) expect(names, `L${level}/${edition} missing "${name}"`).toContain(name);
    for (const name of expectAbsent) expect(names, `L${level}/${edition} unexpectedly has "${name}"`).not.toContain(name);
    expect(info?.resources ?? [], `L${level}/${edition}`).toEqual([]);
  });
});

// A narrow-select caller (rest.ts, level-reconciliation.ts, channel-divinity.ts,
// spellcasting.ts) never loads the `class.features`/`subclassRef.features`
// relation, so `featureRows` arrives as `undefined` (registry.ts's
// `GetFeatureRows` comment). That was ALREADY deriveResources' contract for
// Rogue before this issue — `rogue.ts` never had a top-level
// `resourceFn`/`features` for `deriveBaseLayer` to fall back to — so absence
// from `CLASSES` changes nothing here either.
describe("the narrow-select path (no featureRows carrier) still returns null", () => {
  it("Rogue with no subclass and no featureRows carrier derives null", () => {
    const info = deriveResources("rogue", undefined, 5, ABILITY_SCORES, proficiencyBonusForLevel(5), undefined, "EDITION_2024");
    expect(info).toBeNull();
  });

  it("a wholly unknown class name derives null regardless of a carrier", () => {
    const info = deriveResources("not-a-real-class", undefined, 5, ABILITY_SCORES, proficiencyBonusForLevel(5), { classRows: [], subclassRows: [] }, "EDITION_2024");
    expect(info).toBeNull();
  });
});

// Riskiest regression named by #1532's own AC, replicated for Rogue: a
// multiclass path that iterates `classEntries` must not special-case a
// missing `CLASSES` key. Rogue's row-driven base FEATURES (via
// `featuresFromRows`) and Wizard's still-TS-driven `resourceFn` pool
// (`arcaneRecovery`) must compose in the SAME `deriveEntryScopedResources`
// call, each scoped to its own entry's own effective level.
describe("a Rogue/Wizard multiclass still derives correctly with Rogue absent from CLASSES", () => {
  it("both classes' own pools and features compose", async () => {
    const rogueRows = await loadDbFeatureRows("rogue", undefined);
    const wizardRows = await loadDbFeatureRows("wizard", "school of evocation");

    const classEntries = [
      { name: "Rogue", subclass: null as string | null, level: 5 },
      { name: "Wizard", subclass: "school of evocation", level: 5 },
    ];
    const getFeatureRows = (entry: (typeof classEntries)[number]) => (entry.name === "Rogue" ? rogueRows : wizardRows);

    for (const edition of EDITIONS) {
      const { derived } = deriveEntryScopedResources(classEntries, 10, ABILITY_SCORES, proficiencyBonusForLevel(10), edition, getFeatureRows);
      expect(derived, edition).not.toBeNull();
      // Rogue's row-driven base features survive absence from CLASSES...
      expect(derived?.features.some((f) => f.name === "Sneak Attack"), `${edition} rogue features`).toBe(true);
      // ...alongside Wizard's still-TS-registered resourceFn pool, proving
      // Rogue's absence doesn't disturb the OTHER entry's own CLASSES lookup
      // in the same accumulator.
      const poolKeys = derived?.resources.map((r) => r.key) ?? [];
      expect(poolKeys, `${edition} wizard pool`).toContain("arcaneRecovery");
    }
  });
});
