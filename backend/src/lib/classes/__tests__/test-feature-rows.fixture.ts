// Test-only helper (#1524): builds the `ClassFeatureRowsCarrier` deriveResources'
// `featureRows` parameter expects, directly from the TS class/subclass
// definitions — the NINE remaining lib/classes/<class>.ts modules stay the
// seed's AUTHORING input even though production now reads seeded rows instead
// (#1524's Fact 1). Lets every unit test that asserts on `.features` keep
// calling deriveResources with a bare class/subclass name (no DB round-trip)
// while still exercising the real read path (featuresFromRows). The DB-backed
// parity test (class-feature-parity.test.ts) is the proof this fixture and
// the seeded rows agree; if they ever diverge, that test — not this one —
// is what catches it.
//
// FIGHTER (#1227, #1528, #1532), BARBARIAN (#1223), ROGUE (#1231) and WIZARD
// (#1234): `lib/classes/fighter.ts`, `lib/classes/barbarian.ts` and
// `lib/classes/rogue.ts` are all deleted outright, and `lib/classes/wizard.ts`'s
// feature TEXT (all four schools) moved out while the module itself survives for
// its subclass `grantLevel` (#1576). Every one of their rows is literal seed
// data (prisma/seed/fighter-features.ts, barbarian-features.ts,
// rogue-features.ts, wizard-features.ts), which this src-side fixture can't
// import (backend/tsconfig.json's `rootDir: "src"` makes a src file importing
// anything under prisma/ a compile error, TS6059). `testFeatureRowsFor(
// "fighter"/"barbarian"/"wizard", ...)`'s rows are therefore the hardcoded
// mirrors below (LITERAL_CLASS_ROWS/LITERAL_SUBCLASS_ROWS, mirroring each seed
// file's RESOURCE columns) — class-features-snapshot.test.ts records
// `withoutFeatures(deriveResources(...))`, stripping `.features` before
// snapshotting, so the row TEXT matters only for readability here, never for a
// passing assertion. class-feature-parity.test.ts is the suite that DOES assert
// on `.features` content, and it skips all four classes entirely for the same
// underlying reason (its own file's LITERAL_ROW_CLASSES check).
//
// Barbarian's two subclasses (Totem Warrior, Berserker) need no hardcoded
// subclassRows stand-in: neither declares a resourceKey/derivedStat in
// barbarian-features.ts, so falling through to `toRows(subDef?.features ?? [])`
// -> `toRows([])` -> `[]` (TEST_SUBCLASSES has no entry for either, same as
// Champion/Eldritch Knight) loses nothing a `.resources`-observing test could
// see.
//
// ROGUE NEEDS NO MIRROR AT ALL, unlike the other three: its rows declare no
// resourceKey/derivedStat/saveDcAbilities anywhere (Sneak Attack's Nd6 is a
// computed rule function, never a persisted pool — see sneakAttackSpec), so
// falling out of LITERAL_CLASS_ROWS/LITERAL_SUBCLASS_ROWS entirely — the same
// `toRows(undefined?.features ?? [])` -> `[]` fallthrough — loses nothing a
// `.resources`-observing test could see. rogue-thief.test.ts (which used to call
// `testFeatureRowsFor("rogue", "thief")`) is rewritten onto `loadDbFeatureRows`
// instead, same shape as fighter-unregistered.test.ts.
import { bard } from "@/lib/classes/bard.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";
import { cleric } from "@/lib/classes/cleric.js";
import { druid } from "@/lib/classes/druid.js";
import { monk } from "@/lib/classes/monk.js";
import { paladin } from "@/lib/classes/paladin.js";
import { ranger } from "@/lib/classes/ranger.js";
import { sorcerer } from "@/lib/classes/sorcerer.js";
import type { AuthoredFeature, ClassDefinition, SubclassDefinition } from "@/lib/classes/types.js";
import { warlock } from "@/lib/classes/warlock.js";
import { wizard } from "@/lib/classes/wizard.js";

const TEST_CLASSES: Record<string, ClassDefinition> = {
  bard, cleric, druid, monk, paladin, ranger, sorcerer, warlock, wizard,
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

// BARBARIAN's Rage pool (#1223): moved off barbarian.ts's resourceFn
// (rageCountForLevel) onto the Rage row's own descriptor columns
// (prisma/seed/barbarian-features.ts) — the same rootDir boundary FIGHTER_
// BASE_ROWS' comment explains. Hardcoded here, once, mirroring
// barbarian-features.ts's own resourceKey/resourceTotals values exactly. 2014
// keeps the pre-existing 99-at-L20 "unlimited" encoding with no
// shortRestRegain; 2024 caps at 6 from L17 (no L20 tier) with
// shortRestRegain: 1 on every tier (SRD 5.2 p.20).
export const BARBARIAN_BASE_ROWS: ClassFeatureRow[] = [
  {
    name: "Rage",
    level: 1,
    edition: "EDITION_2014",
    description:
      "As a bonus action, enter a rage lasting up to 1 minute. You gain advantage on Strength checks and saves, a bonus to melee damage (+2 at L1; +3 at L9; +4 at L16), and resistance to bludgeoning, piercing, and slashing damage. You can't cast or concentrate on spells while raging.",
    resourceKey: "rage",
    resourceLabel: "Rage",
    resourceRecharge: "longRest",
    resourceTotals: [
      { minLevel: 1, total: 2 },
      { minLevel: 3, total: 3 },
      { minLevel: 6, total: 4 },
      { minLevel: 12, total: 5 },
      { minLevel: 17, total: 6 },
      { minLevel: 20, total: 99 },
    ],
  },
  {
    name: "Rage",
    level: 1,
    edition: "EDITION_2024",
    description:
      "As a Bonus Action, enter a Rage if you aren't wearing Heavy armor. While raging, you have Resistance to Bludgeoning, Piercing, and Slashing damage, Advantage on Strength checks and saving throws, and a bonus to damage when you attack using Strength with a weapon or an Unarmed Strike (the Rage Damage column); you can't cast spells or maintain Concentration. The Rage lasts until the end of your next turn, ending early if you don Heavy armor or have the Incapacitated condition, and extends another round if you make an attack roll, force a saving throw, or take a Bonus Action to extend it — for up to 10 minutes total. You regain one expended use on a Short Rest and all expended uses on a Long Rest.",
    resourceKey: "rage",
    resourceLabel: "Rage",
    resourceRecharge: "longRest",
    resourceTotals: [
      { minLevel: 1, total: 2, shortRestRegain: 1 },
      { minLevel: 3, total: 3, shortRestRegain: 1 },
      { minLevel: 6, total: 4, shortRestRegain: 1 },
      { minLevel: 12, total: 5, shortRestRegain: 1 },
      { minLevel: 17, total: 6, shortRestRegain: 1 },
    ],
  },
];

// WIZARD's base-class rows (#1234): `lib/classes/wizard.ts`'s feature TEXT
// (base + all three schools) moved to literal seed data
// (prisma/seed/wizard-features.ts) — the same rootDir boundary FIGHTER_BASE_
// ROWS' comment explains (unlike Fighter/Barbarian, wizard.ts itself still
// exists — see that file's own header for why it isn't deletable — but its
// `.features` are gone). Hardcoded here, once, mirroring wizard-features.ts's
// own text exactly (commit 1: untagged, byte-identical across editions —
// commit 2 retags these to the real per-edition split).
export const WIZARD_BASE_ROWS: ClassFeatureRow[] = toRows([
  {
    name: "Spellcasting",
    level: 1,
    source: "class",
    description:
      "You cast spells using Intelligence. Full-caster progression. You copy spells into your spellbook and prepare a number equal to your Intelligence modifier + your wizard level (minimum 1) after each long rest.",
  },
  {
    name: "Arcane Recovery",
    level: 1,
    source: "class",
    description:
      "Once per day when finishing a short rest, choose expended spell slots to recover. Total levels of slots recovered can be up to half your wizard level (rounded up, max 5th-level slots).",
  },
  {
    name: "Spell Mastery",
    level: 18,
    source: "class",
    description:
      "Choose one 1st-level and one 2nd-level wizard spell in your spellbook. You can cast each of those spells at their lowest level without expending a spell slot. Changing choices requires 8 hours of study.",
  },
  {
    name: "Signature Spells",
    level: 20,
    source: "class",
    description:
      "Choose two 3rd-level wizard spells in your spellbook as signature spells. They are always prepared and don't count against your prepared spells count. You can cast each once without expending a slot; regain both uses after a short or long rest.",
  },
]);

/** WIZARD's per-subclass rows (#1234) — same hardcoding reason as WIZARD_BASE_ROWS above. */
export const WIZARD_EVOCATION_ROWS: ClassFeatureRow[] = toRows([
  { name: "Evocation Savant", level: 2, source: "subclass", description: "The gold and time you must spend to copy an evocation spell into your spellbook is halved." },
  {
    name: "Sculpt Spells",
    level: 2,
    source: "subclass",
    description:
      "When you cast an evocation spell, choose a number of creatures equal to 1 + the spell's level. Those creatures automatically succeed on their saving throw and take no damage (even if they'd normally take half on a success).",
  },
  { name: "Potent Cantrip", level: 6, source: "subclass", description: "When a creature succeeds on a saving throw against your cantrip, it takes half the cantrip's damage rather than none." },
  { name: "Empowered Evocation", level: 10, source: "subclass", description: "Add your Intelligence modifier to one damage roll of any evocation spell you cast." },
  {
    name: "Overchannel",
    level: 14,
    source: "subclass",
    description:
      "When you cast a wizard spell of 1st–5th level that deals damage, you can deal maximum damage with it. The first time per long rest you do so, you suffer no ill effect. Each use thereafter costs 2d12 necrotic per spell level (before the rest).",
  },
]);

export const WIZARD_ABJURATION_ROWS: ClassFeatureRow[] = toRows([
  { name: "Abjuration Savant", level: 2, source: "subclass", description: "The gold and time you must spend to copy an abjuration spell into your spellbook is halved." },
  {
    name: "Arcane Ward",
    level: 2,
    source: "subclass",
    description:
      "When you cast an abjuration spell of 1st level or higher, a magical ward forms with HP equal to twice your wizard level + your Intelligence modifier. The ward absorbs damage before you do, and is recharged (2× the spell's level) each time you cast an abjuration spell.",
  },
  { name: "Projected Ward", level: 6, source: "subclass", description: "When a creature within 30 ft takes damage, use your reaction to have your Arcane Ward absorb that damage instead." },
  { name: "Improved Abjuration", level: 10, source: "subclass", description: "When you cast an abjuration spell that requires an ability check, you add your proficiency bonus to that check." },
  { name: "Spell Resistance", level: 14, source: "subclass", description: "You have advantage on saving throws against spells, and resistance to spell damage." },
]);

export const WIZARD_ILLUSION_ROWS: ClassFeatureRow[] = toRows([
  { name: "Illusion Savant", level: 2, source: "subclass", description: "The gold and time you must spend to copy an illusion spell into your spellbook is halved." },
  {
    name: "Improved Minor Illusion",
    level: 2,
    source: "subclass",
    description:
      "You know the Minor Illusion cantrip (or a different wizard cantrip if you already know it). When you cast it, you can create both a sound and an image with a single casting.",
  },
  {
    name: "Malleable Illusions",
    level: 6,
    source: "subclass",
    description:
      "When you cast an illusion spell with a duration of 1 minute or longer, you can use your action to change the nature of that illusion (within its original parameters) while you can see it.",
  },
  {
    name: "Illusory Self",
    level: 10,
    source: "subclass",
    description:
      "When a creature makes an attack roll against you, use your reaction to interpose an illusory duplicate — the attack automatically misses. Once used, you regain this ability on a short or long rest.",
  },
  {
    name: "Illusory Reality",
    level: 14,
    source: "subclass",
    description:
      "When you cast an illusion spell of 1st level or higher, you can make one inanimate, nonmagical object part of the illusion real for 1 minute. The object can't deal damage or cause harm.",
  },
]);

// The two lookup maps every LITERAL_ROW_CLASSES member's rows resolve
// through (#1234): replaces the `isFighter ? … : isBarbarian ? … :
// isBattleMaster ? …` ternary chain, which didn't survive a fourth class
// cleanly. Keyed lowercase to match testFeatureRowsFor's own
// `.toLowerCase()` calls. LITERAL_CLASS_ROWS scopes a class's BASE rows;
// LITERAL_SUBCLASS_ROWS scopes one subclass's own rows (Battle Master's
// SubclassDefinition, fighter.ts, carries no `.features` at all any more —
// its rows are BATTLE_MASTER_ROWS above, the same rootDir-boundary reason
// FIGHTER_BASE_ROWS exists — so falling through to `toRows(subDef?.features
// ?? [])` would silently go empty for it, same failure mode this map exists
// to avoid for every literal-row subclass).
const LITERAL_CLASS_ROWS: Record<string, ClassFeatureRow[]> = {
  fighter: FIGHTER_BASE_ROWS,
  barbarian: BARBARIAN_BASE_ROWS,
  wizard: WIZARD_BASE_ROWS,
};

const LITERAL_SUBCLASS_ROWS: Record<string, ClassFeatureRow[]> = {
  "battle master": BATTLE_MASTER_ROWS,
  "school of evocation": WIZARD_EVOCATION_ROWS,
  "school of abjuration": WIZARD_ABJURATION_ROWS,
  "school of illusion": WIZARD_ILLUSION_ROWS,
};

/** The featureRows carrier for a (className, subclass) pair, sourced from the TS modules. */
export function testFeatureRowsFor(className: string, subclass: string | undefined): ClassFeatureRowsCarrier {
  const classKey = (className ?? "").toLowerCase();
  const subclassKey = (subclass ?? "").toLowerCase();
  const classDef = TEST_CLASSES[classKey];
  const subDef = subclass ? TEST_SUBCLASSES[subclassKey] : undefined;
  return {
    classRows: LITERAL_CLASS_ROWS[classKey] ?? toRows(classDef?.features ?? []),
    subclassRows: LITERAL_SUBCLASS_ROWS[subclassKey] ?? toRows(subDef?.features ?? []),
  };
}
