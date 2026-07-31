// Test-only helper (#1524): builds the `ClassFeatureRowsCarrier` deriveResources'
// `featureRows` parameter expects, directly from the TS class/subclass
// definitions — the twelve lib/classes/<class>.ts modules stay the seed's
// AUTHORING input even though production now reads seeded rows instead
// (#1524's Fact 1). Lets every unit test that asserts on `.features` keep
// calling deriveResources with a bare class/subclass name (no DB round-trip)
// while still exercising the real read path (featuresFromRows). The DB-backed
// parity test (class-feature-parity.test.ts) is the proof this fixture and
// the seeded rows agree; if they ever diverge, that test — not this one —
// is what catches it.
//
// FIGHTER (#1227, #1528): `fighter.ts` carries no `.features` at all any more
// — its rows are literal seed data (prisma/seed/fighter-features.ts), which
// this src-side fixture can't import (backend/tsconfig.json's `rootDir:
// "src"` makes a src file importing anything under prisma/ a compile error,
// TS6059). `testFeatureRowsFor("fighter", ...)`'s classRows are therefore
// FIGHTER_BASE_ROWS below (a hardcoded mirror of fighter-features.ts's
// RESOURCE columns only — the TEXT stays empty, which is harmless for
// class-features-snapshot.test.ts: that suite records
// `withoutFeatures(deriveResources(...))`, stripping `.features` before
// snapshotting). class-feature-parity.test.ts is the suite that DOES assert
// on `.features` content, and it skips Fighter entirely for the same
// underlying reason (its own file's LITERAL_ROW_CLASSES check).
import { barbarian } from "@/lib/classes/barbarian.js";
import { bard } from "@/lib/classes/bard.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";
import { cleric } from "@/lib/classes/cleric.js";
import { druid } from "@/lib/classes/druid.js";
import { fighter } from "@/lib/classes/fighter.js";
import { monk } from "@/lib/classes/monk.js";
import { paladin } from "@/lib/classes/paladin.js";
import { ranger } from "@/lib/classes/ranger.js";
import { rogue } from "@/lib/classes/rogue.js";
import { sorcerer } from "@/lib/classes/sorcerer.js";
import type { AuthoredFeature, ClassDefinition, SubclassDefinition } from "@/lib/classes/types.js";
import { warlock } from "@/lib/classes/warlock.js";
import { wizard } from "@/lib/classes/wizard.js";

const TEST_CLASSES: Record<string, ClassDefinition> = {
  barbarian, bard, cleric, druid, fighter, monk, paladin, ranger, rogue, sorcerer, warlock, wizard,
};

// Flat map keyed by subclass name ACROSS all twelve classes, mirroring
// registry.ts's SUBCLASSES table — so testFeatureRowsFor("fighter", "life
// domain") would silently hand back Cleric rows, and any cross-class
// subclass-name collision resolves last-write-wins by TEST_CLASSES iteration
// order. Harmless here: this is a test-fixture convenience keyed the same way
// production's lookup table is (subclass names are unique across the seeded
// catalog today), and production itself never resolves a subclass this way —
// it goes through the FK relation (Character.subclassId), not a name lookup.
const TEST_SUBCLASSES: Record<string, SubclassDefinition> = {};
for (const classDef of Object.values(TEST_CLASSES)) {
  for (const [key, subclassDef] of Object.entries(classDef.subclasses ?? {})) {
    TEST_SUBCLASSES[key] = subclassDef;
  }
}

// Untagged (edition undefined) -> one row per edition, identical text;
// already-tagged -> exactly the one row its tag names. Mirrors
// prisma/seed/class-features.ts's expandFeatureRow — the write-time half of
// the same rule.
function toRows(features: AuthoredFeature[]): ClassFeatureRow[] {
  return features.flatMap((f) => {
    const editions = f.edition ? [f.edition] : (["EDITION_2014", "EDITION_2024"] as const);
    return editions.map((edition) => ({ name: f.name, level: f.level, description: f.description, edition }));
  });
}

// FIGHTER's base pools + actions (#1528): Second Wind/Action Surge/
// Indomitable moved off fighter.ts's resourceFn/DERIVED_ACTIONS onto
// ClassFeature descriptor columns (prisma/seed/fighter-features.ts) — a
// prisma/ file this src-side fixture can't import (the same rootDir boundary
// the file header explains for `.features`). Hardcoded here, once, mirroring
// fighter-features.ts's own descriptor values AND description text exactly
// (pinned by class-feature-parity.test.ts's DB-backed proof that the two
// never diverge). Exported so entry-scoped-actions.test.ts/
// entry-scoped-resources.test.ts can build their own per-entry
// getFeatureRows callback around it.
export const FIGHTER_BASE_ROWS: ClassFeatureRow[] = (["EDITION_2014", "EDITION_2024"] as const).flatMap((edition) => [
  {
    name: "Second Wind",
    level: 1,
    description:
      edition === "EDITION_2014"
        ? "As a bonus action, regain 1d10 + your fighter level HP. Regain use on a short or long rest."
        : "As a Bonus Action, regain Hit Points equal to 1d10 plus your Fighter level. You have 2 uses of this feature (3 at level 4, 4 at level 10). You regain one expended use when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest.",
    edition,
    resourceKey: "secondWind",
    resourceRecharge: edition === "EDITION_2014" ? "short-or-long" : "longRest",
    resourceTotals: edition === "EDITION_2014" ? [{ minLevel: 1, total: 1 }] : [
      { minLevel: 1, total: 2, shortRestRegain: 1 },
      { minLevel: 4, total: 3, shortRestRegain: 1 },
      { minLevel: 10, total: 4, shortRestRegain: 1 },
    ],
    activationCost: "bonusAction",
    resolverKind: "heal-roll",
    costKind: "pool",
    costPoolKey: "secondWind",
    costBase: 1,
    effectKind: "heal",
    effectDiceCount: 1,
    effectDiceFaces: 10,
    effectModifierSource: "classLevel",
  },
  {
    name: "Action Surge",
    level: 2,
    description:
      edition === "EDITION_2014"
        ? "Take one additional action on your turn. Regain use(s) on a short or long rest. You have 2 uses starting at level 17."
        : "Take one additional action on your turn, except the Magic action. Regain your use of this feature on a Short or Long Rest. You have 2 uses starting at level 17, but only once on a turn.",
    edition,
    resourceKey: "actionSurge",
    resourceRecharge: "short-or-long",
    resourceTotals: [
      { minLevel: 2, total: 1 },
      { minLevel: 17, total: 2 },
    ],
    activationCost: "special",
    resolverKind: "simple-confirm",
    costKind: "pool",
    costPoolKey: "actionSurge",
    costBase: 1,
  },
  {
    name: "Indomitable",
    level: 9,
    description:
      edition === "EDITION_2014"
        ? "Reroll a failed saving throw (you must use the new roll). Regain use(s) on a long rest. Two uses at level 13, three at level 17."
        : "Reroll a failed saving throw, adding a bonus equal to your Fighter level, and use the new roll. Two uses at level 13, three at level 17. Regain expended uses on a Long Rest.",
    edition,
    resourceKey: "indomitable",
    resourceRecharge: "longRest",
    resourceTotals: [
      { minLevel: 9, total: 1 },
      { minLevel: 13, total: 2 },
      { minLevel: 17, total: 3 },
    ],
  },
]);

// BATTLE MASTER's own subclass rows (#1546 Part B-i scaffolding, descriptor
// columns filled in by Part B-ii): mirrors prisma/seed/fighter-features.ts's
// BATTLE_MASTER_RAW verbatim, INCLUDING the resourceKey/resourceTotals/
// resourceDieTiers/derivedStat/derivedStatTiers/saveDcAbilities columns Part
// B-ii adds there — Combat Superiority's superiority-dice pool +
// maneuverChoiceCount + maneuverSaveDC, and Student of War's
// toolProfChoiceCount, are now ALL row-driven (fighter.ts's old
// resourceFn/deriveExtras are gone). Same rootDir boundary as
// FIGHTER_BASE_ROWS above (a src file can't import prisma/), same reason for
// hardcoding rather than re-deriving. Exported so test-support/
// fighter-resource-rows.ts's battleMasterResourceRowsData can scope it to a
// bespoke fixture's classId/subclassId, the same way fighterResourceRowsData
// derives from FIGHTER_BASE_ROWS — one shared source for every suite that
// builds its own Battle Master Subclass row, instead of each hand-copying the
// descriptor text a second (or third) time.
export const BATTLE_MASTER_ROWS: ClassFeatureRow[] = (["EDITION_2014", "EDITION_2024"] as const).flatMap((edition) => [
  {
    name: "Combat Superiority",
    level: 3,
    edition,
    description:
      edition === "EDITION_2014"
        ? "You learn maneuvers fueled by superiority dice (d8s). You have 4 dice and regain all expended dice on a short or long rest. Maneuvers can only be used once per attack unless otherwise stated."
        : "You learn maneuvers fueled by Superiority Dice. You have 4 d8s (5 at level 7, 6 at level 15), and you know 3 maneuvers (5 at level 7, 7 at level 10, 9 at level 15). The save DC for a maneuver that requires one equals 8 + your Proficiency Bonus + your Strength or Dexterity modifier. You regain all expended dice on a short or long rest.",
    resourceKey: "superiorityDice",
    resourceLabel: "Superiority Dice",
    resourceRecharge: "short-or-long",
    resourceTotals: [
      { minLevel: 3, total: 4 },
      { minLevel: 7, total: 5 },
      { minLevel: 15, total: 6 },
    ],
    resourceDieTiers: [
      { minLevel: 3, die: "d8" },
      { minLevel: 10, die: "d10" },
      { minLevel: 18, die: "d12" },
    ],
    derivedStat: "maneuverChoiceCount",
    derivedStatTiers: [
      { minLevel: 3, value: 3 },
      { minLevel: 7, value: 5 },
      { minLevel: 10, value: 7 },
      { minLevel: 15, value: 9 },
    ],
    saveDcAbilities: ["strength", "dexterity"],
  },
  {
    name: "Student of War",
    level: 3,
    edition,
    description:
      edition === "EDITION_2014"
        ? "You gain proficiency with one type of artisan's tools of your choice."
        : "You gain proficiency with one type of artisan's tools of your choice, and you gain proficiency in one skill of your choice from the Fighter's level 1 skill list.",
    derivedStat: "toolProfChoiceCount",
    derivedStatTiers: [{ minLevel: 3, value: 1 }],
  },
  {
    name: "Know Your Enemy",
    level: 7,
    edition,
    description:
      edition === "EDITION_2014"
        ? "If you spend at least 1 minute observing or interacting with another creature outside combat, you can compare two of its ability scores, armor class, hit points, hit dice, or levels to your own."
        : "As a Bonus Action, choose a creature you can see within 30 feet of yourself and learn whether it has any damage Immunities, Resistances, or Vulnerabilities, and what they are if any. You can use this feature once, and you regain your use of it when you finish a Long Rest or when you expend a Superiority Die to restore it (no action required).",
  },
  {
    name: "Improved Combat Superiority (d10)",
    level: 10,
    edition,
    description: edition === "EDITION_2014" ? "Your superiority dice turn into d10s." : "Your Superiority Dice turn into d10s.",
  },
  {
    name: "Relentless",
    level: 15,
    edition,
    description:
      edition === "EDITION_2014"
        ? "When you roll initiative and have no superiority dice remaining, you regain 1 superiority die."
        : "Once per turn when you use a maneuver, you can roll 1d8 and use the number rolled instead of expending a Superiority Die.",
  },
  edition === "EDITION_2014"
    ? { name: "Improved Combat Superiority (d12)", level: 18, edition, description: "Your superiority dice turn into d12s." }
    : { name: "Ultimate Combat Superiority", level: 18, edition, description: "Your Superiority Dice turn into d12s." },
]);

/** The featureRows carrier for a (className, subclass) pair, sourced from the TS modules. */
export function testFeatureRowsFor(className: string, subclass: string | undefined): ClassFeatureRowsCarrier {
  const classDef = TEST_CLASSES[(className ?? "").toLowerCase()];
  const subDef = subclass ? TEST_SUBCLASSES[subclass.toLowerCase()] : undefined;
  const isFighter = (className ?? "").toLowerCase() === "fighter";
  // #1546 Part B-ii: Battle Master's SubclassDefinition (fighter.ts) carries
  // no `.features` at all any more (its rows are BATTLE_MASTER_ROWS above,
  // the same rootDir-boundary reason FIGHTER_BASE_ROWS exists) — so
  // `toRows(subDef?.features ?? [])` would silently go empty for it, same
  // failure mode FIGHTER_BASE_ROWS' own isFighter branch fixes for the base class.
  const isBattleMaster = (subclass ?? "").toLowerCase() === "battle master";
  return {
    classRows: isFighter ? FIGHTER_BASE_ROWS : toRows(classDef?.features ?? []),
    subclassRows: isBattleMaster ? BATTLE_MASTER_ROWS : toRows(subDef?.features ?? []),
  };
}
