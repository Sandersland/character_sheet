// Test-only helper (#1524): builds the `ClassFeatureRowsCarrier` deriveResources'
// `featureRows` parameter expects, directly from the TS class/subclass
// definitions — the remaining lib/classes/<class>.ts modules stay the
// seed's AUTHORING input even though production now reads seeded rows instead
// (#1524's Fact 1). Lets every unit test that asserts on `.features` keep
// calling deriveResources with a bare class/subclass name (no DB round-trip)
// while still exercising the real read path (featuresFromRows). The DB-backed
// parity test (class-feature-parity.test.ts) is the proof this fixture and
// the seeded rows agree; if they ever diverge, that test — not this one —
// is what catches it.
//
// FIGHTER (#1227, #1528, #1532), BARBARIAN (#1223), ROGUE (#1231), WARLOCK
// (#1233) and WIZARD (#1234) all author their ClassFeature rows as literal seed
// data (prisma/seed/<class>-features.ts), which this src-side fixture can't
// import — backend/tsconfig.json's `rootDir: "src"` makes a src file importing
// anything under prisma/ a compile error (TS6059). Their rows therefore come
// from the hardcoded LITERAL_CLASS_ROWS/LITERAL_SUBCLASS_ROWS maps below,
// mirroring each seed file's RESOURCE columns. class-features-snapshot.test.ts
// records `withoutFeatures(deriveResources(...))`, stripping `.features` before
// snapshotting, so the row TEXT matters only for readability here, never for a
// passing assertion; class-feature-parity.test.ts is the suite that DOES assert
// on `.features` content, and it skips all five classes for the same underlying
// reason (its own file's LITERAL_ROW_CLASSES check).
//
// Two different end states sit behind that one list. `lib/classes/fighter.ts`,
// `barbarian.ts` and `rogue.ts` are deleted outright. `warlock.ts` and
// `wizard.ts` survive — each carries a subclass `grantLevel` (1 for Warlock's
// patrons, 2 for Wizard's schools) that no seeded row can express while
// subclassGateLevel's undefined fallback is 3, so deleting either would
// silently move that class's 2014 subclass gate (#1576). Neither still exports
// a `features` array, which is what matters here.
//
// Barbarian's two subclasses (Totem Warrior, Berserker) need no subclassRows
// stand-in: neither declares a resourceKey/derivedStat in barbarian-features.ts,
// so falling through to `toRows(subDef?.features ?? [])` -> `[]`
// (TEST_SUBCLASSES has no entry for either, same as Champion/Eldritch Knight)
// loses nothing a `.resources`-observing test could see.
//
// ROGUE NEEDS NO MIRROR AT ALL, unlike the other four: its rows declare no
// resourceKey/derivedStat/saveDcAbilities anywhere (Sneak Attack's Nd6 is a
// computed rule function, never a persisted pool — see sneakAttackSpec), so
// falling out of both maps entirely — the same `toRows(undefined?.features ??
// [])` -> `[]` fallthrough — loses nothing a `.resources`-observing test could
// see. rogue-thief.test.ts (which used to call `testFeatureRowsFor("rogue",
// "thief")`) is rewritten onto `loadDbFeatureRows` instead, same shape as
// fighter-unregistered.test.ts.
import { bard } from "@/lib/classes/bard.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";
import { cleric } from "@/lib/classes/cleric.js";
import { druid } from "@/lib/classes/druid.js";
import { monk } from "@/lib/classes/monk.js";
import { paladin } from "@/lib/classes/paladin.js";
import { ranger } from "@/lib/classes/ranger.js";
import { sorcerer } from "@/lib/classes/sorcerer.js";
import type { AuthoredFeature, ClassDefinition, SubclassDefinition } from "@/lib/classes/types.js";
import { wizard } from "@/lib/classes/wizard.js";

const TEST_CLASSES: Record<string, ClassDefinition> = {
  bard, cleric, druid, monk, paladin, ranger, sorcerer, wizard,
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

// Applies Arcane Recovery's / Illusory Self's resource-pool descriptor
// columns (#1234 commit 3) onto the matching row(s) of an already-built
// ClassFeatureRow[] — `toRows` only carries name/level/description/edition
// through (it takes AuthoredFeature[], which has no resource columns), so
// this is a targeted post-map rather than a second row-builder, mirroring
// wizard-features.ts's own resourceKey/resourceLabel/resourceRecharge/
// resourceTotals values exactly (both editions: flat total 1; Arcane
// Recovery longRest, Illusory Self short-or-long from level 10).
function withPool(rows: ClassFeatureRow[], name: string, recharge: string, minLevel: number): ClassFeatureRow[] {
  return rows.map((row) =>
    row.name === name
      ? { ...row, resourceKey: name === "Arcane Recovery" ? "arcaneRecovery" : "illusorySelf", resourceLabel: name, resourceRecharge: recharge, resourceTotals: [{ minLevel, total: 1 }] }
      : row,
  );
}

// WIZARD's base-class rows (#1234): `lib/classes/wizard.ts`'s feature TEXT
// (base + all three schools) moved to literal seed data
// (prisma/seed/wizard-features.ts) — the same rootDir boundary FIGHTER_BASE_
// ROWS' comment explains (unlike Fighter/Barbarian, wizard.ts itself still
// exists — see that file's own header for why it isn't deletable — but its
// `.features` are gone). Hardcoded here, once, mirroring wizard-features.ts's
// own EDITION_2014/EDITION_2024 text exactly (commit 2's real SRD 5.2 /
// PHB'24 content — every row below now sets its own `edition`, per that
// file's tagging rule) — Arcane Recovery's resource columns (commit 3) are
// applied by withPool below, once, rather than repeated per edition.
export const WIZARD_BASE_ROWS: ClassFeatureRow[] = withPool(
  toRows([
  {
    name: "Spellcasting",
    level: 1,
    source: "class",
    edition: "EDITION_2014",
    description:
      "You cast spells using Intelligence. Full-caster progression. You copy spells into your spellbook and prepare a number equal to your Intelligence modifier + your wizard level (minimum 1) after each long rest.",
  },
  {
    name: "Spellcasting",
    level: 1,
    source: "class",
    edition: "EDITION_2024",
    description:
      "You cast spells using Intelligence. Full-caster progression. You know three Wizard cantrips (one more at levels 4 and 10), replacing one on a Long Rest. Your spellbook holds your level 1+ spells: it starts with six 1st-level spells, and you add two spells of your choice whenever you gain a Wizard level after 1st. You regain all expended spell slots on a Long Rest, and you change your list of prepared spells whenever you finish a Long Rest.",
  },
  {
    name: "Arcane Recovery",
    level: 1,
    source: "class",
    edition: "EDITION_2014",
    description:
      "Once per day when finishing a short rest, choose expended spell slots to recover. Total levels of slots recovered can be up to half your wizard level (rounded up, max 5th-level slots).",
  },
  {
    name: "Arcane Recovery",
    level: 1,
    source: "class",
    edition: "EDITION_2024",
    description:
      "When you finish a Short Rest, you can choose expended spell slots to recover, their combined level no higher than half your Wizard level (rounded up) and none 6th level or higher. You can use this feature only once per Long Rest.",
  },
  {
    name: "Ritual Adept",
    level: 1,
    source: "class",
    edition: "EDITION_2024",
    description:
      "You can cast any spell in your spellbook as a Ritual if the spell has the Ritual tag, without needing it prepared — you must read from the book to cast it this way.",
  },
  {
    name: "Scholar",
    level: 2,
    source: "class",
    edition: "EDITION_2024",
    description:
      "Choose one skill in which you're proficient from Arcana, History, Investigation, Medicine, Nature, or Religion. You have Expertise in the chosen skill.",
  },
  {
    name: "Memorize Spell",
    level: 5,
    source: "class",
    edition: "EDITION_2024",
    description:
      "When you finish a Short Rest, you can study your spellbook and replace one of the level 1+ Wizard spells you have prepared with another level 1+ spell from the book.",
  },
  {
    name: "Spell Mastery",
    level: 18,
    source: "class",
    edition: "EDITION_2014",
    description:
      "Choose one 1st-level and one 2nd-level wizard spell in your spellbook. You can cast each of those spells at their lowest level without expending a spell slot. Changing choices requires 8 hours of study.",
  },
  {
    name: "Spell Mastery",
    level: 18,
    source: "class",
    edition: "EDITION_2024",
    description:
      "Choose a 1st-level and a 2nd-level spell in your spellbook, each with a casting time of an action. You always have both prepared, and you can cast each at its lowest level without expending a spell slot — casting at a higher level still costs a slot. Whenever you finish a Long Rest, you can study your spellbook and replace either choice with an eligible spell of the same level.",
  },
  {
    name: "Epic Boon",
    level: 19,
    source: "class",
    edition: "EDITION_2024",
    description: "You gain an Epic Boon feat of your choice (Boon of Spell Recall recommended). You can take this feat only once.",
  },
  {
    name: "Signature Spells",
    level: 20,
    source: "class",
    edition: "EDITION_2014",
    description:
      "Choose two 3rd-level wizard spells in your spellbook as signature spells. They are always prepared and don't count against your prepared spells count. You can cast each once without expending a slot; regain both uses after a short or long rest.",
  },
  {
    name: "Signature Spells",
    level: 20,
    source: "class",
    edition: "EDITION_2024",
    description:
      "Choose two 3rd-level spells in your spellbook as your signature spells. You always have them prepared, and you can cast each once at 3rd level without expending a spell slot. To cast either at a higher level, you must expend a spell slot; regain both uses after a Short Rest or Long Rest.",
  },
  ]),
  "Arcane Recovery",
  "longRest",
  1,
);

/** WIZARD's per-subclass rows (#1234) — same hardcoding reason as WIZARD_BASE_ROWS above. */
export const WIZARD_EVOCATION_ROWS: ClassFeatureRow[] = toRows([
  { name: "Evocation Savant", level: 2, source: "subclass", edition: "EDITION_2014", description: "The gold and time you must spend to copy an evocation spell into your spellbook is halved." },
  {
    name: "Evocation Savant",
    level: 3,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "Add two Evocation spells (each level 2 or lower) to your spellbook for free. Thereafter, whenever you gain access to a new level of spell slots, add one more Evocation spell of an eligible level to your spellbook for free.",
  },
  {
    name: "Sculpt Spells",
    level: 2,
    source: "subclass",
    edition: "EDITION_2014",
    description:
      "When you cast an evocation spell, choose a number of creatures equal to 1 + the spell's level. Those creatures automatically succeed on their saving throw and take no damage (even if they'd normally take half on a success).",
  },
  {
    name: "Sculpt Spells",
    level: 6,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "When you cast an Evocation spell that affects other creatures you can see, choose a number of them equal to 1 plus the spell's level. Those creatures automatically succeed on their saving throws against the spell, and they take no damage if they would normally take half damage on a success.",
  },
  { name: "Potent Cantrip", level: 6, source: "subclass", edition: "EDITION_2014", description: "When a creature succeeds on a saving throw against your cantrip, it takes half the cantrip's damage rather than none." },
  {
    name: "Potent Cantrip",
    level: 3,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "When you cast a damaging cantrip at a creature and you miss with the attack roll, or the target succeeds on its saving throw against the cantrip, the target still takes half the cantrip's damage (if any), but suffers no other effect from it.",
  },
  { name: "Empowered Evocation", level: 10, source: "subclass", edition: "EDITION_2014", description: "Add your Intelligence modifier to one damage roll of any evocation spell you cast." },
  {
    name: "Empowered Evocation",
    level: 10,
    source: "subclass",
    edition: "EDITION_2024",
    description: "Whenever you cast a Wizard spell from the Evocation school, you can add your Intelligence modifier to one damage roll of that spell.",
  },
  {
    name: "Overchannel",
    level: 14,
    source: "subclass",
    edition: "EDITION_2014",
    description:
      "When you cast a wizard spell of 1st–5th level that deals damage, you can deal maximum damage with it. The first time per long rest you do so, you suffer no ill effect. Each use thereafter costs 2d12 necrotic per spell level (before the rest).",
  },
  {
    name: "Overchannel",
    level: 14,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "When you cast a Wizard spell with a spell slot of levels 1-5 that deals damage, you can deal maximum damage with it. The first time you do this before finishing a Long Rest, you suffer no adverse effect. Each further time before that Long Rest, you take 2d12 Necrotic damage for each level of the spell slot, and that damage per spell level increases by 1d12 for each additional use — this damage ignores Resistance and Immunity.",
  },
]);

export const WIZARD_ABJURATION_ROWS: ClassFeatureRow[] = toRows([
  { name: "Abjuration Savant", level: 2, source: "subclass", edition: "EDITION_2014", description: "The gold and time you must spend to copy an abjuration spell into your spellbook is halved." },
  {
    name: "Abjuration Savant",
    level: 3,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "Add two Abjuration spells (each level 2 or lower) to your spellbook for free. Thereafter, whenever you gain access to a new level of spell slots, add one more Abjuration spell of an eligible level to your spellbook for free.",
  },
  {
    name: "Arcane Ward",
    level: 2,
    source: "subclass",
    edition: "EDITION_2014",
    description:
      "When you cast an abjuration spell of 1st level or higher, a magical ward forms with HP equal to twice your wizard level + your Intelligence modifier. The ward absorbs damage before you do, and is recharged (2× the spell's level) each time you cast an abjuration spell.",
  },
  {
    name: "Arcane Ward",
    level: 3,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "When you cast an Abjuration spell with a spell slot, form (or recharge) a magical ward on yourself lasting until you finish a Long Rest, with HP equal to twice your Wizard level plus your Intelligence modifier. The ward absorbs damage before you do — apply any Resistances or Vulnerabilities you have before its HP is reduced — and it regains HP equal to twice the spell slot's level each time you cast an Abjuration spell with a slot, or, as a Bonus Action, by expending a spell slot for the same regain.",
  },
  { name: "Projected Ward", level: 6, source: "subclass", edition: "EDITION_2014", description: "When a creature within 30 ft takes damage, use your reaction to have your Arcane Ward absorb that damage instead." },
  {
    name: "Projected Ward",
    level: 6,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "When a creature you can see within 30 feet of yourself takes damage, you can take a Reaction to have your Arcane Ward absorb that damage instead — apply that creature's Resistances or Vulnerabilities before the ward's HP is reduced.",
  },
  { name: "Improved Abjuration", level: 10, source: "subclass", edition: "EDITION_2014", description: "When you cast an abjuration spell that requires an ability check, you add your proficiency bonus to that check." },
  {
    name: "Spell Breaker",
    level: 10,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "You always have Counterspell and Dispel Magic prepared. You can cast Dispel Magic as a Bonus Action, and you add your Proficiency Bonus to its ability check. A spell slot spent on either spell isn't expended if the spell fails to stop what it targeted.",
  },
  { name: "Spell Resistance", level: 14, source: "subclass", edition: "EDITION_2014", description: "You have advantage on saving throws against spells, and resistance to spell damage." },
  { name: "Spell Resistance", level: 14, source: "subclass", edition: "EDITION_2024", description: "You have Advantage on saving throws against spells, and Resistance to the damage they deal." },
]);

export const WIZARD_ILLUSION_ROWS: ClassFeatureRow[] = withPool(
  toRows([
  { name: "Illusion Savant", level: 2, source: "subclass", edition: "EDITION_2014", description: "The gold and time you must spend to copy an illusion spell into your spellbook is halved." },
  {
    name: "Illusion Savant",
    level: 3,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "Add two Illusion spells (each level 2 or lower) to your spellbook for free. Thereafter, whenever you gain access to a new level of spell slots, add one more Illusion spell of an eligible level to your spellbook for free.",
  },
  {
    name: "Improved Minor Illusion",
    level: 2,
    source: "subclass",
    edition: "EDITION_2014",
    description:
      "You know the Minor Illusion cantrip (or a different wizard cantrip if you already know it). When you cast it, you can create both a sound and an image with a single casting.",
  },
  {
    name: "Improved Illusions",
    level: 3,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "You can cast Illusion spells without a Verbal component, and any Illusion spell you cast with a range of 10 feet or more has its range extended by 60 feet. You also know the Minor Illusion cantrip (or learn a different Wizard cantrip if you already know it, not counting against your cantrips known); you can create both a sound and an image with a single casting of it, and you can cast it as a Bonus Action.",
  },
  {
    name: "Malleable Illusions",
    level: 6,
    source: "subclass",
    edition: "EDITION_2014",
    description:
      "When you cast an illusion spell with a duration of 1 minute or longer, you can use your action to change the nature of that illusion (within its original parameters) while you can see it.",
  },
  {
    name: "Phantasmal Creatures",
    level: 6,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "You always have the Summon Beast and Summon Fey spells prepared. Casting either as its Illusion-school version (the summoned creature appears spectral) costs no spell slot, but halves the creature's Hit Points. Once you cast either spell this way, you must finish a Long Rest before doing so again.",
  },
  {
    name: "Illusory Self",
    level: 10,
    source: "subclass",
    edition: "EDITION_2014",
    description:
      "When a creature makes an attack roll against you, use your reaction to interpose an illusory duplicate — the attack automatically misses. Once used, you regain this ability on a short or long rest.",
  },
  {
    name: "Illusory Self",
    level: 10,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "When a creature hits you with an attack roll, you can take a Reaction to interpose an illusory duplicate of yourself between the attacker and yourself. The attack automatically misses you, then the illusion dissipates. You regain your use of this feature on a Short Rest or Long Rest, or you can restore it early by expending a level 2+ spell slot (no action required).",
  },
  {
    name: "Illusory Reality",
    level: 14,
    source: "subclass",
    edition: "EDITION_2014",
    description:
      "When you cast an illusion spell of 1st level or higher, you can make one inanimate, nonmagical object part of the illusion real for 1 minute. The object can't deal damage or cause harm.",
  },
  {
    name: "Illusory Reality",
    level: 14,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "When you cast an Illusion spell with a spell slot, you can make one inanimate, nonmagical object that's part of the illusion real for 1 minute — usable as a Bonus Action while the spell is ongoing. The object can't deal damage or otherwise cause harm.",
  },
  ]),
  "Illusory Self",
  "short-or-long",
  10,
);

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
// WARLOCK's base class (#1233 commit 2 of 3): moved off warlock.ts's
// WARLOCK_FEATURES AuthoredFeature[] array onto literal seed data
// (prisma/seed/warlock-features.ts) — the same rootDir boundary FIGHTER_
// BASE_ROWS'/BARBARIAN_BASE_ROWS' comments explain. Mirrors that file's real
// SRD 5.2 (2024) content exactly; commit 3 will add Magical Cunning's
// resourceKey here alongside the matching seed-file change.
export const WARLOCK_BASE_ROWS: ClassFeatureRow[] = [
  {
    name: "Pact Magic",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You cast spells using Charisma. Unique short-rest progression: all spell slots are the same (high) level and you regain all slots on a short or long rest. Slots scale: 1st at L1; 2nd at L3; 3rd at L5; 4th at L7; 5th at L9.",
  },
  {
    name: "Pact Magic",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You form a pact with a mysterious patron to cast spells, using Charisma. You know two Warlock cantrips (more at levels 4 and 10) and prepare a growing list of Warlock spells, each no higher a level than the Slot Level shown for your level. All your Pact Magic spell slots are the same (high) level, and you regain every expended slot when you finish a Short or Long Rest. An Arcane Focus serves as your Spellcasting Focus.",
  },
  {
    name: "Eldritch Invocations",
    level: 2,
    edition: "EDITION_2014",
    description:
      "Learn 2 eldritch invocations — magical studies that grant you permanent abilities or modify your spells (e.g., Agonizing Blast, Armor of Shadows, Devil's Sight). More invocations at levels 5, 7, 9, 12, 15, 18 (max 8 known).",
  },
  {
    name: "Eldritch Invocations",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You gain one Eldritch Invocation of your choice — a permanent magical ability or lesson unlocked by forbidden knowledge, such as Pact of the Tome — meeting any stated prerequisite. You gain additional invocations as you gain levels: 1 at level 1, 3 at level 2, 5 at level 5, 6 at level 7, 7 at level 9, 8 at level 12, 9 at level 15, and 10 at level 18. Whenever you gain a Warlock level, you can replace one invocation you know with a different one you qualify for, unless it's a prerequisite for another invocation you have.",
  },
  {
    name: "Magical Cunning",
    level: 2,
    edition: "EDITION_2024",
    description:
      "You can perform a 1-minute esoteric rite to regain expended Pact Magic spell slots, up to half your maximum (round up). Once you use this feature, you can't do so again until you finish a Long Rest.",
  },
  {
    name: "Pact Boon",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Your patron grants a boon: Pact of the Chain (familiar with special forms), Pact of the Blade (summon a pact weapon), or Pact of the Tome (Book of Shadows with extra cantrips and rituals).",
  },
  {
    name: "Contact Patron",
    level: 9,
    edition: "EDITION_2024",
    description:
      "You always have the Contact Other Plane spell prepared, and you can cast it without expending a spell slot to contact your patron directly — you automatically succeed on the spell's saving throw. Once you cast it this way, you can't do so again until you finish a Long Rest.",
  },
  {
    name: "Mystic Arcanum",
    level: 11,
    edition: "EDITION_2014",
    description:
      "Choose one 6th-level spell from the warlock list as a Mystic Arcanum. You can cast it once without expending a spell slot per long rest. Gain a 7th-level arcanum at L13, 8th at L15, 9th at L17.",
  },
  {
    name: "Mystic Arcanum",
    level: 11,
    edition: "EDITION_2024",
    description:
      "Your patron grants you a magical secret called an arcanum. Choose one level 6 Warlock spell as this arcanum; you can cast it once without expending a spell slot, and must finish a Long Rest before doing so again. You gain another arcanum spell the same way at level 13 (a 7th-level spell), level 15 (8th-level), and level 17 (9th-level). You regain all uses of your Mystic Arcanum when you finish a Long Rest.",
  },
  {
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    description: "You gain an Epic Boon feat of your choice (Boon of Fate recommended). You can take this feat only once.",
  },
  {
    name: "Eldritch Master",
    level: 20,
    edition: "EDITION_2014",
    description:
      "Spend 1 minute entreating your patron to regain all expended Pact Magic spell slots. Once used, you must finish a long rest before you can do so again.",
  },
  {
    name: "Eldritch Master",
    level: 20,
    edition: "EDITION_2024",
    description: "When you use your Magical Cunning feature, you regain all your expended Pact Magic spell slots.",
  },
];

// THE FIEND (#1233 commit 2 of 3): mirrors warlock-features.ts's real SRD 5.2
// content exactly. Commit 3 will add Dark One's Own Luck's/Hurl Through
// Hell's resourceKey columns here alongside the matching seed-file change —
// Dark One's Own Luck's 2024 row will deliberately OMIT resourceTotals (a
// Charisma-modifier formula, still resourceFn-derived; see warlock.ts's own
// header).
export const THE_FIEND_ROWS: ClassFeatureRow[] = [
  {
    name: "Expanded Spell List",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Add fiend spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Burning Hands, Command (1st); Blindness/Deafness, Scorching Ray (2nd); Fireball, Stinking Cloud (3rd); Fire Shield, Wall of Fire (4th); Flame Strike, Hallow (5th).",
  },
  {
    name: "Fiend Spells",
    level: 3,
    edition: "EDITION_2024",
    description:
      "The magic of your patron ensures you always have certain spells prepared, which don't count against the number of spells you can prepare with Pact Magic: Burning Hands, Command, Scorching Ray, Suggestion (level 3); Fireball, Stinking Cloud (level 5); Fire Shield, Wall of Fire (level 7); Geas, Insect Plague (level 9).",
  },
  {
    name: "Dark One's Blessing",
    level: 1,
    edition: "EDITION_2014",
    description:
      "When you reduce a hostile creature to 0 HP, gain temporary HP equal to your Charisma modifier + your warlock level (minimum 1).",
  },
  {
    name: "Dark One's Blessing",
    level: 3,
    edition: "EDITION_2024",
    description:
      "When you reduce an enemy to 0 Hit Points, you gain temporary hit points equal to your Charisma modifier + your warlock level (minimum 1). You also gain this benefit when someone else reduces an enemy within 10 feet of you to 0 Hit Points.",
  },
  {
    name: "Dark One's Own Luck",
    level: 6,
    edition: "EDITION_2014",
    description: "Add a d10 to one ability check or saving throw you make. Once used, regain on a short or long rest.",
  },
  {
    name: "Dark One's Own Luck",
    level: 6,
    edition: "EDITION_2024",
    description:
      "You can call on your fiendish patron to alter fate in your favor. When you make an ability check or a saving throw, add 1d10 to the roll after seeing it but before its effects occur. You can do this a number of times equal to your Charisma modifier (minimum of once), but no more than once per roll. Regain all expended uses when you finish a Long Rest.",
  },
  {
    name: "Fiendish Resilience",
    level: 10,
    edition: "EDITION_2014",
    description:
      "After a short or long rest, choose one damage type. You gain resistance to that type until you choose a different one.",
  },
  {
    name: "Fiendish Resilience",
    level: 10,
    edition: "EDITION_2024",
    description:
      "Choose one damage type, other than Force, whenever you finish a Short or Long Rest. You have resistance to that damage type until you choose a different one.",
  },
  {
    name: "Hurl Through Hell",
    level: 14,
    edition: "EDITION_2014",
    description:
      "When you hit a creature with an attack, banish it through the Lower Planes until the start of your next turn. It takes 10d10 psychic damage from the horrors of its brief journey and then returns. Once used, regain on a long rest.",
  },
  {
    name: "Hurl Through Hell",
    level: 14,
    edition: "EDITION_2024",
    description:
      "Once per turn when you hit a creature with an attack, you can try to instantly transport it through the Lower Planes. The target must succeed on a Charisma saving throw against your spell save DC or disappear and hurtle through a nightmare landscape, taking 8d10 psychic damage if it isn't a Fiend and gaining the Incapacitated condition until the end of your next turn, when it returns to its space or the nearest unoccupied one. Once used, you can't use it again until you finish a Long Rest unless you expend a Pact Magic spell slot (no action required) to restore it.",
  },
];

// THE ARCHFEY / THE GREAT OLD ONE test rows are DELIBERATELY frozen at their
// pre-#1233 shape (an untagged-both-editions body plus a 2024-tagged
// Expanded Spell List) rather than updated to mirror warlock-features.ts's
// real post-#1233 content, which tags every one of their rows EDITION_2014
// and authors zero EDITION_2024 rows. subclass-grant-level.test.ts's MOVED
// array asserts "warlock/the archfey" and "warlock/the great old one"
// contribute subclass features at level 3 under EDITION_2024 by DEFAULT
// (testing the GRANT-LEVEL gate, not subclass content) — retagging these two
// fixtures to match the real seed would starve that gate check of any
// EDITION_2024 row to find, failing a test the #1233 plan requires stay green
// UNEDITED. class-feature-parity.test.ts's own LITERAL_ROW_CLASSES exclusion
// is what already permits this fixture to diverge from the real seed without
// anything else catching it.
export const THE_ARCHFEY_ROWS: ClassFeatureRow[] = (["EDITION_2014", "EDITION_2024"] as const).flatMap((edition) => [
  {
    name: "Expanded Spell List",
    level: 1,
    edition,
    description:
      edition === "EDITION_2014"
        ? "Add archfey spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Faerie Fire, Sleep (1st); Calm Emotions, Phantasmal Force (2nd); Blink, Plant Growth (3rd); Dominate Beast, Greater Invisibility (4th); Dominate Person, Seeming (5th)."
        : "Add archfey spells to your warlock list: Faerie Fire, Sleep (L3); Calm Emotions, Phantasmal Force (L3); Blink, Plant Growth (L5); Dominate Beast, Greater Invisibility (L7); Dominate Person, Seeming (L9).",
  },
  {
    name: "Fey Presence",
    level: 1,
    edition,
    description:
      "As an action, project a beguiling or dreadful aura in a 10-ft cube. Each creature there must succeed on a Wisdom save (spell save DC) or be charmed or frightened (your choice) until the end of your next turn. Once used, regain on a short or long rest.",
  },
  {
    name: "Misty Escape",
    level: 6,
    edition,
    description:
      "When you take damage, use your reaction to turn invisible and teleport up to 60 ft to an unoccupied space you can see. Invisibility lasts until the start of your next turn or until you attack or cast a spell. Once used, regain on a short or long rest.",
  },
  {
    name: "Beguiling Defenses",
    level: 10,
    edition,
    description:
      "You are immune to being charmed. When another creature attempts to charm you, you can use your reaction to have it make a Wisdom saving throw (spell save DC) or be charmed by you for 1 minute or until it takes damage.",
  },
  {
    name: "Dark Delirium",
    level: 14,
    edition,
    description:
      "As an action, plunge a creature within 60 ft into an illusory dreamscape (Wisdom save DC = spell save DC). While charmed or frightened (your choice) it is incapacitated and ignores its surroundings. It repeats the save at the end of each turn, or when it takes damage. Once used, regain on a short or long rest.",
  },
]);

export const THE_GREAT_OLD_ONE_ROWS: ClassFeatureRow[] = (["EDITION_2014", "EDITION_2024"] as const).flatMap((edition) => [
  {
    name: "Expanded Spell List",
    level: 1,
    edition,
    description:
      edition === "EDITION_2014"
        ? "Add Great Old One spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Dissonant Whispers, Hideous Laughter (1st); Detect Thoughts, Phantasmal Force (2nd); Clairvoyance, Sending (3rd); Dominate Beast, Black Tentacles (4th); Dominate Person, Telekinesis (5th)."
        : "Add Great Old One spells to your warlock list: Dissonant Whispers, Hideous Laughter (L3); Detect Thoughts, Phantasmal Force (L3); Clairvoyance, Sending (L5); Dominate Beast, Black Tentacles (L7); Dominate Person, Telekinesis (L9).",
  },
  {
    name: "Awakened Mind",
    level: 1,
    edition,
    description:
      "Communicate telepathically with any creature you can see within 30 ft. The creature understands you even if it shares no language with you, though it cannot telepathically respond.",
  },
  {
    name: "Entropic Ward",
    level: 6,
    edition,
    description:
      "When a creature makes an attack roll against you, use your reaction to impose disadvantage. If it misses, you gain advantage on your next attack against it before the end of your next turn. Once used, regain on a short or long rest.",
  },
  {
    name: "Thought Shield",
    level: 10,
    edition,
    description:
      "Your thoughts can't be read by telepathy or other means unless you allow it. Resistance to psychic damage. When a creature deals psychic damage to you, it takes the same amount.",
  },
  {
    name: "Create Thrall",
    level: 14,
    edition,
    description:
      "Touch an incapacitated humanoid to charm it indefinitely (no save). While charmed, it obeys your commands and you share telepathic communication with it. Each time the thrall takes damage, it makes a Charisma save to break free (DC = your spell save DC).",
  },
]);

// Per-class/per-subclass literal-row overrides (#1233): replaces the former
// isFighter/isBarbarian/isBattleMaster boolean chain with two lookup maps, one
// keyed by class name and one by subclass name — a fourth `isWarlock` boolean
// (plus a fifth/sixth/seventh for each patron) would have made
// testFeatureRowsFor's own branching harder to read with every future
// LITERAL_ROW_CLASSES addition than a table lookup is. Both maps are keyed
// lowercase, matching this file's own registry convention.
const LITERAL_CLASS_ROWS: Record<string, ClassFeatureRow[]> = {
  fighter: FIGHTER_BASE_ROWS,
  barbarian: BARBARIAN_BASE_ROWS,
  warlock: WARLOCK_BASE_ROWS,
  wizard: WIZARD_BASE_ROWS,
};

const LITERAL_SUBCLASS_ROWS: Record<string, ClassFeatureRow[]> = {
  "battle master": BATTLE_MASTER_ROWS,
  "school of evocation": WIZARD_EVOCATION_ROWS,
  "school of abjuration": WIZARD_ABJURATION_ROWS,
  "school of illusion": WIZARD_ILLUSION_ROWS,
  "the fiend": THE_FIEND_ROWS,
  "the archfey": THE_ARCHFEY_ROWS,
  "the great old one": THE_GREAT_OLD_ONE_ROWS,
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
