// #1532: `lib/classes/fighter.ts` is deleted and `fighter` no longer appears
// in registry.ts's module-private `const CLASSES` map at all. This is the
// regression #1546's pre-flight (dec-1546-1) proved silent: `SUBCLASSES` used
// to be built by iterating `Object.values(CLASSES)`, and `deriveSubclassLayer`
// returned early with EMPTY pools AND features on a missing key — so
// un-registering Fighter would have deleted every one of Champion's, Battle
// Master's and Eldritch Knight's seeded rows from every sheet, silently (an
// empty panel, not a test failure). #1546 Part A moved subclass REGISTRATION
// onto SUBCLASS_IDENTITY (subclass-slug.ts) precisely so this doesn't happen;
// this file is the DB-backed proof that it doesn't, now that the deletion
// this issue exists for has actually happened — real seeded rows via
// loadDbFeatureRows, not the TS fixture mirror, so a regression in the real
// catalog can't hide behind a hand-copied fixture.
import { describe, expect, it } from "vitest";

import { deriveEntryScopedResources, deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { deriveAttacksPerAction } from "@/lib/srd/extra-attack.js";

import { loadDbFeatureRows } from "./db-feature-rows.fixture.js";

const ABILITY_SCORES = {
  strength: 16,
  dexterity: 12,
  constitution: 14,
  intelligence: 13,
  wisdom: 10,
  charisma: 8,
};

const EDITIONS = ["EDITION_2014", "EDITION_2024"] as const;

// Named, not counted: `mergeLayers` merges base + subclass features, so
// Fighter's BASE rows (Second Wind, Extra Attack, ...) alone satisfy a bare
// `features.length > 0` — that shape passed vacuously against the arbiter's
// mutation (registry.ts's SUBCLASS_IDENTITY seeding loop skipping
// `classKey === "fighter"`), which silently drops every one of these three
// subclasses' rows and was caught by NOTHING for Eldritch Knight (its 2024
// rows are parked verbatim copies of 2014 pending #1531, so a dropped row
// produces no diff against 2014 either). Naming one subclass-scoped row per
// subclass — each confirmed present in fighter-features.ts — is what
// actually proves a subclass-scoped row survived, in both editions.
const SUBCLASS_SCOPED_FEATURES: Record<"champion" | "battle master" | "eldritch knight", readonly [string, string]> = {
  champion: ["Improved Critical", "Remarkable Athlete"],
  "battle master": ["Combat Superiority", "Student of War"],
  "eldritch knight": ["Eldritch Knight Spellcasting", "Weapon Bond"],
};

// Six cells: 3 subclasses x 2 editions, each its own it.each row (not a
// subclass-level test looping editions internally) so a mutation that drops
// every subclass's rows shows as six independently-red lines, not one test
// that aborts at the first failing edition and never reports the second.
const CELLS = (Object.keys(SUBCLASS_SCOPED_FEATURES) as (keyof typeof SUBCLASS_SCOPED_FEATURES)[]).flatMap((subclass) =>
  EDITIONS.map((edition) => [subclass, edition] as const),
);

// Level 7, not 5: every subclass activates at L3 (subclassGateLevel's
// undefined-grantLevel fallback, both editions), but Champion's 2014
// "Remarkable Athlete" row is itself gated at L7 (SRD 5.2 level-shifts it to
// L3, PHB'14 p.72 keeps it at L7) — L5 would clear the subclass gate while
// still missing that one row's OWN level gate, silently narrowing this test
// back to a "some rows resolve" check instead of "the named rows resolve".
// L7 clears every SUBCLASS_SCOPED_FEATURES row's own level in both editions.
describe("Champion, Battle Master and Eldritch Knight all still resolve their OWN seeded subclass-scoped rows with fighter.ts gone", () => {
  const LEVEL = 7;

  it.each(CELLS)("%s/%s: its own subclass-scoped feature rows survive", async (subclass, edition) => {
    const featureRows = await loadDbFeatureRows("fighter", subclass);
    const info = deriveResources("fighter", subclass, LEVEL, ABILITY_SCORES, proficiencyBonusForLevel(LEVEL), featureRows, edition);
    expect(info, `${subclass}/${edition}`).not.toBeNull();
    const names = info?.features.map((f) => f.name) ?? [];
    for (const expectedName of SUBCLASS_SCOPED_FEATURES[subclass]) {
      expect(names, `${subclass}/${edition} missing "${expectedName}"`).toContain(expectedName);
    }
  });

  // Only Champion and Battle Master have their own subclass-scoped resource
  // pool (Champion's crit-range work is a #1120 gap, not a pool; Eldritch
  // Knight's spellcasting is deferred to #1531 and carries no resourceKey row
  // at all) — asserted separately from the features check above so an absent
  // Eldritch Knight pool reads as "expected" rather than failing a shared
  // assertion.
  it("battle master: its superiority-dice pool resolves in both editions", async () => {
    const featureRows = await loadDbFeatureRows("fighter", "battle master");
    for (const edition of EDITIONS) {
      const info = deriveResources("fighter", "battle master", LEVEL, ABILITY_SCORES, proficiencyBonusForLevel(LEVEL), featureRows, edition);
      expect(info?.resources.map((r) => r.key), edition).toContain("superiorityDice");
      expect(info?.maneuverChoiceCount, edition).toBeGreaterThan(0);
      expect(info?.maneuverSaveDC, edition).toBeGreaterThan(0);
    }
  });

  it("champion: carries its own subclass-scoped features but declares no resource pool of its own (its crit-range bonus is a #1120 gap, not a pool)", async () => {
    const featureRows = await loadDbFeatureRows("fighter", "champion");
    for (const edition of EDITIONS) {
      const info = deriveResources("fighter", "champion", LEVEL, ABILITY_SCORES, proficiencyBonusForLevel(LEVEL), featureRows, edition);
      const names = info?.features.map((f) => f.name) ?? [];
      for (const expectedName of SUBCLASS_SCOPED_FEATURES.champion) {
        expect(names, `${edition} missing "${expectedName}"`).toContain(expectedName);
      }
      expect(info?.resources.map((r) => r.key) ?? [], edition).not.toContain("superiorityDice");
    }
  });
});

// The absent-class base layer: Fighter itself (not a subclass) has no
// `ClassDefinition` in `CLASSES` any more either, so `deriveBaseLayer`'s
// `classDef?.resourceFn` / `classDef?.features ?? []` optional-chaining is
// exercised for real here, not just structurally. Fighter's base pools
// (Second Wind L1, Action Surge L2, Indomitable L9) were ALREADY row-driven
// before this issue (#1528) — `fighter.ts` never populated a top-level
// `resourceFn`/`features` even before its deletion — so removing it from
// `CLASSES` changes nothing about this output; these levels/gates are pinned
// as the pre-deletion baseline this issue must not move.
describe("Fighter's absent-class base layer resolves identically to before deletion, at every gate level", () => {
  const GATES: { level: number; expectSecondWind: boolean; expectActionSurge: boolean; expectIndomitable: boolean }[] = [
    { level: 1, expectSecondWind: true, expectActionSurge: false, expectIndomitable: false },
    { level: 2, expectSecondWind: true, expectActionSurge: true, expectIndomitable: false },
    { level: 5, expectSecondWind: true, expectActionSurge: true, expectIndomitable: false },
    { level: 9, expectSecondWind: true, expectActionSurge: true, expectIndomitable: true },
    { level: 17, expectSecondWind: true, expectActionSurge: true, expectIndomitable: true },
  ];

  it.each(GATES)("level $level: base pools gate correctly in both editions", async ({ level, expectSecondWind, expectActionSurge, expectIndomitable }) => {
    const featureRows = await loadDbFeatureRows("fighter", undefined);
    for (const edition of EDITIONS) {
      const info = deriveResources("fighter", undefined, level, ABILITY_SCORES, proficiencyBonusForLevel(level), featureRows, edition);
      expect(info, `L${level}/${edition}`).not.toBeNull();
      const keys = info?.resources.map((r) => r.key) ?? [];
      expect(keys.includes("secondWind"), `L${level}/${edition} secondWind`).toBe(expectSecondWind);
      expect(keys.includes("actionSurge"), `L${level}/${edition} actionSurge`).toBe(expectActionSurge);
      expect(keys.includes("indomitable"), `L${level}/${edition} indomitable`).toBe(expectIndomitable);
    }
  });
});

// A narrow-select caller (rest.ts, level-reconciliation.ts, channel-divinity.ts,
// spellcasting.ts) never loads the `class.features`/`subclassRef.features`
// relation, so `featureRows` arrives as `undefined` (registry.ts's
// `GetFeatureRows` comment). That was ALREADY deriveResources' contract for
// Fighter before this issue — `fighter.ts` never had a top-level
// `resourceFn`/`features` for `deriveBaseLayer` to fall back to — so absence
// from `CLASSES` changes nothing here either: an unknown-or-dataless class
// still returns null, exactly per this function's own doc comment ("Returns
// null when the class is unknown and no data exists").
describe("the narrow-select path (no featureRows carrier) still returns null", () => {
  it("Fighter with no subclass and no featureRows carrier derives null", () => {
    const info = deriveResources("fighter", undefined, 5, ABILITY_SCORES, proficiencyBonusForLevel(5), undefined, "EDITION_2024");
    expect(info).toBeNull();
  });

  it("a wholly unknown class name derives null regardless of a carrier", () => {
    const info = deriveResources("not-a-real-class", undefined, 5, ABILITY_SCORES, proficiencyBonusForLevel(5), { classRows: [], subclassRows: [] }, "EDITION_2024");
    expect(info).toBeNull();
  });
});

// Riskiest regression named by #1532's own AC: multiclass paths that iterate
// `classEntries` must not special-case a missing `CLASSES` key. Fighter's and
// Wizard's row-driven base pools (via `poolsFromRows` — Wizard's `arcaneRecovery`
// moved off wizard.ts's resourceFn onto its row in #1234 commit 3) must compose
// in the SAME `deriveEntryScopedResources` call, each scoped to its own entry's
// own effective level (PHB'24 p.163) — proving `CLASSES[classKey]` inside
// `deriveResources` (the one `CLASSES` lookup in the repo, per this issue's
// corrected AC) resolves to `undefined` for the Fighter entry without
// disturbing the Wizard entry's own resolution in the same accumulator.
describe("a Fighter/Wizard multiclass still derives correctly with Fighter absent from CLASSES", () => {
  it("both classes' own pools and features compose, and Extra Attack resolves off Fighter's row", async () => {
    const fighterRows = await loadDbFeatureRows("fighter", undefined);
    const wizardRows = await loadDbFeatureRows("wizard", "school of evocation");

    const classEntries = [
      { name: "Fighter", subclass: null as string | null, level: 5 },
      { name: "Wizard", subclass: "school of evocation", level: 5 },
    ];
    const getFeatureRows = (entry: (typeof classEntries)[number]) => (entry.name === "Fighter" ? fighterRows : wizardRows);

    for (const edition of EDITIONS) {
      const { derived } = deriveEntryScopedResources(classEntries, 10, ABILITY_SCORES, proficiencyBonusForLevel(10), edition, getFeatureRows);
      expect(derived, edition).not.toBeNull();
      const poolKeys = derived?.resources.map((r) => r.key) ?? [];
      // Fighter's row-driven base pools survive absence from CLASSES...
      expect(poolKeys, `${edition} fighter pools`).toEqual(expect.arrayContaining(["secondWind", "actionSurge"]));
      // ...alongside Wizard's own row-driven pool (#1234 commit 3), proving
      // Fighter's absence doesn't disturb the OTHER entry's own CLASSES
      // lookup in the same accumulator.
      expect(poolKeys, `${edition} wizard pool`).toContain("arcaneRecovery");
      // The Fighter entry's own "Extra Attack" feature TEXT is present at L5
      // (a plain seeded row, gated by featuresFromRows same as any other).
      expect(derived?.features.some((f) => f.name === "Extra Attack"), `${edition} extra attack feature`).toBe(true);
    }

    // deriveAttacksPerAction is a SEPARATE call from deriveEntryScopedResources
    // (character-serialize.ts computes it independently) — the actual
    // multiclass risk this issue's AC names, since it iterates classEntries
    // and reads Fighter's row-driven derivedStatTiers directly, with no
    // `CLASSES` lookup of its own. At fighter-entry-level 5 that's 2 attacks
    // (both editions, #1530's L5 tier) — the Wizard entry contributes no
    // qualifying row, so the max stays Fighter's.
    for (const edition of EDITIONS) {
      expect(deriveAttacksPerAction(classEntries, edition, getFeatureRows), edition).toBe(2);
    }
  });
});
