// Test-only helper (#1524): builds the `ClassFeatureRowsCarrier` deriveResources'
// `featureRows` parameter expects, directly from the TS class/subclass
// definitions — the remaining lib/classes/<class>.ts modules stay the
// seed's AUTHORING input even though production now reads seeded rows instead
// (#1524's Fact 1). Lets every unit test that asserts on `.features` keep
// calling deriveResources with a bare class/subclass name (no DB round-trip)
// while still exercising the real read path (featuresFromRows).
//
// literal-fixture-parity.test.ts (#1593, prisma-side because only that
// direction can import both halves) is what proves LITERAL_CLASS_ROWS/
// LITERAL_SUBCLASS_ROWS below agree with the real seed — for all twelve
// classes now that #1675 retired class-feature-parity.test.ts (the DB-backed
// TS-vs-rows proof this file used to also lean on for whichever classes were
// still TS-authored; it went vacuous the moment Monk, its last un-skipped
// class, joined LITERAL_ROW_CLASSES, so keeping it around would have meant a
// permanently-empty describe block). Without literal-fixture-parity.test.ts,
// nothing would have caught #1232's corrected Draconic descriptions shipping
// stale here through an otherwise fully green suite — this header previously
// claimed class-feature-parity was the proof for everything, which was the
// false statement that drift hid behind.
//
// FIGHTER (#1227, #1528, #1532), BARBARIAN (#1223), CLERIC (#1225), RANGER
// (#1230), ROGUE (#1231), SORCERER (#1232), WARLOCK (#1233), WIZARD (#1234),
// BARD (#1224), DRUID (#1226), PALADIN (#1229) and MONK (#1675) all author
// their ClassFeature rows as literal seed data
// (prisma/seed/<class>-features.ts), which this src-side fixture can't
// import — backend/tsconfig.json's `rootDir: "src"` makes a src file importing
// anything under prisma/ a compile error (TS6059). Every one but Bard's rows
// therefore come from the hardcoded LITERAL_CLASS_ROWS/LITERAL_SUBCLASS_ROWS
// maps below, mirroring each seed file's RESOURCE columns — Bard needs no
// mirror at all (Rogue's own exemption, see below).
//
// class-features-snapshot.test.ts records
// `withoutFeatures(deriveResources(...))`, stripping `.features` before
// snapshotting, so the row TEXT matters only for readability for THAT suite —
// but `.features` being non-empty still decides whether `deriveResources`
// returns `null` or an object at all (registry.ts's `resources.length === 0 &&
// features.length === 0` check), which several OTHER suites (srd.test.ts's
// Channel Divinity tests, subclass-grant-level.test.ts) assert on directly. So
// a class whose rows a real test exercises that way cannot skip the mirror
// even where `.features` content itself is never asserted (#1225).
//
// Four different end states sit behind that one list. `lib/classes/
// fighter.ts`, `barbarian.ts` and `rogue.ts` are deleted outright.
// `warlock.ts`, `wizard.ts`, `sorcerer.ts`, `cleric.ts` and `druid.ts` survive
// because each carries a subclass `grantLevel` (1 for Warlock's patrons,
// Sorcerer's origins and Cleric's Divine Domain; 2 for Wizard's schools and
// Druid's Circles) that no seeded row can express while subclassGateLevel's
// undefined fallback is 3, so deleting any would silently move that class's
// 2014 subclass gate (#1576). `ranger.ts` and `bard.ts` survive for a DIFFERENT
// reason still — each own header names it: Ranger's Hunter `choices` catalog
// (#899/#1353 — its EDITION_2024 Wisdom-modifier resourceFn was retired to a
// row by #1685); Bard's Cha-modifier/level-tiered-recharge resourceFn (#1224) — both subclasses'
// `grantLevel: 3` already equal the fallback, so unlike the first five that
// isn't why either module stays. `monk.ts` survives for yet another reason
// (#1675): its own resourceFn (the base Focus/Ki pool) plus three subclasses'
// resourceFn's (Wholeness of Body, Flurry of Healing and Harm, Hand of
// Ultimate Mercy) — all four subclasses' `grantLevel: 3` already equal the
// fallback too, same as Ranger/Bard. None of them still exports a base-class
// `features` array, which is what matters here.
//
// Barbarian's two subclasses (Totem Warrior, Berserker) need no subclassRows
// stand-in: neither declares a resourceKey/derivedStat in barbarian-features.ts,
// so falling through to `toRows(subDef?.features ?? [])` -> `[]`
// (TEST_SUBCLASSES has no entry for either, same as Champion/Eldritch Knight)
// loses nothing a `.resources`-observing test could see. Ranger's two
// subclasses (Hunter, Beast Master) are the same shape — see RANGER_BASE_ROWS'
// own comment below.
//
// CLERIC'S TWO DOMAINS ARE THE COUNTEREXAMPLE (#1225): neither Life Domain nor
// Trickery Domain declares a resourceKey/derivedStat either, but srd.test.ts's
// Channel Divinity suite and subclass-grant-level.test.ts's domain-gate checks
// both call testFeatureRowsFor with a cleric domain and assert directly on
// null-ness/`.length`, which the null-vs-object distinction above DOES change —
// so both domains need a mirror despite carrying no resource descriptor,
// unlike Barbarian's two.
//
// ROGUE NEEDS NO MIRROR AT ALL: its rows declare no
// resourceKey/derivedStat/saveDcAbilities anywhere (Sneak Attack's Nd6 is a
// computed rule function, never a persisted pool — see sneakAttackSpec), and no
// surviving test asserts a null-vs-object distinction against it either
// (rogue-thief.test.ts, which used to call `testFeatureRowsFor("rogue",
// "thief")`, is rewritten onto `loadDbFeatureRows` instead, same shape as
// fighter-unregistered.test.ts) — so falling out of both maps entirely loses
// nothing any surviving test can see. Ranger does NOT get this exemption — see
// RANGER_BASE_ROWS' own comment for why its base class needs a mirror where
// Rogue's doesn't.
//
// BARD (#1224) IS THE SECOND CLASS TAKING ROGUE'S EXEMPTION: neither the base
// class nor either college (bard-features.ts) declares a resourceKey — Bardic
// Inspiration's pool stays wholly in bard.ts's resourceFn, called directly by
// registry.ts independent of this fixture — and College of Valor's Extra
// Attack is the only derivedStat row, which srd.test.ts/subclass-grant-level
// tests never probe through a null-vs-object check the way Cleric's domains
// are. So `bard` is dropped from TEST_CLASSES below entirely (not merely left
// featureless): `testFeatureRowsFor("bard", …)` falls through to
// `toRows(undefined?.features ?? [])` -> `[]` for both classRows and
// subclassRows, identical to Rogue's own shape.
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";
import { paladin } from "@/lib/classes/paladin.js";
import { ranger } from "@/lib/classes/ranger.js";
import { sorcerer } from "@/lib/classes/sorcerer.js";
import type { AuthoredFeature, ClassDefinition, SubclassDefinition } from "@/lib/classes/types.js";
import { wizard } from "@/lib/classes/wizard.js";
const TEST_CLASSES: Record<string, ClassDefinition> = {
  paladin, ranger, sorcerer, wizard,
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
// fighter-features.ts's own descriptor values AND description text exactly —
// literal-fixture-parity.test.ts's DB-backed proof covers the description/
// level half (its own SeedRow type); the descriptor columns stay a by-hand
// mirror, same as every other LITERAL_CLASS_ROWS/LITERAL_SUBCLASS_ROWS entry.
// Exported so entry-scoped-actions.test.ts/
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
// Rage's activation + buff block (#1686) — mirrors barbarian-features.ts's
// own rageBuff()/RAGE_DAMAGE_TIERS; this fixture has no direct import path to
// that prisma/seed/ module (backend/tsconfig.json's `rootDir: "src"` TS6059
// boundary, this file's own header), so the shape is duplicated here exactly
// like every other descriptor column below already is.
function rageBuffFixture(): ClassFeatureRow["effectBuffs"] {
  return [
    {
      key: "rage",
      target: "meleeDamage",
      modifier: [
        { minLevel: 1, value: 2 },
        { minLevel: 9, value: 3 },
        { minLevel: 16, value: 4 },
      ],
      duration: "while-active",
      resistDamageTypes: ["bludgeoning", "piercing", "slashing"],
      rollEffects: [
        { mode: "advantage", kind: "check", ability: "strength" },
        { mode: "advantage", kind: "save", ability: "strength" },
      ],
    },
  ];
}

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
    activationCost: "bonusAction",
    resolverKind: "toggle",
    costKind: "pool",
    costPoolKey: "rage",
    costBase: 1,
    effectBuffs: rageBuffFixture(),
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
    activationCost: "bonusAction",
    resolverKind: "toggle",
    costKind: "pool",
    costPoolKey: "rage",
    costBase: 1,
    effectBuffs: rageBuffFixture(),
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
// WARLOCK's base class (#1233): moved off warlock.ts's WARLOCK_FEATURES
// AuthoredFeature[] array onto literal seed data (prisma/seed/
// warlock-features.ts) — the same rootDir boundary FIGHTER_BASE_ROWS'/
// BARBARIAN_BASE_ROWS' comments explain. Mirrors that file's real SRD 5.2
// (2024) content and Magical Cunning's resourceKey/resourceTotals exactly.
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
    resourceKey: "magicalCunning",
    resourceLabel: "Magical Cunning",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 2, total: 1 }],
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

// RANGER's base-class rows (#1230): `lib/classes/ranger.ts`'s base-class
// `.features` moved to literal seed data (prisma/seed/ranger-features.ts) —
// the same rootDir boundary FIGHTER_BASE_ROWS'/BARBARIAN_BASE_ROWS' comments
// explain (ranger.ts itself still exists — see its own header for why it
// isn't deletable — but its base `.features` are gone). REQUIRED, unlike
// Rogue (which needs no mirror at all): Ranger's base class always grants at
// least one feature from level 1 (Favored Enemy), so an empty carrier would
// flip "ranger / (no subclass)"'s snapshot from a real (if empty-resources)
// object to `null` at every level — exactly the regression this mirror
// exists to prevent. Extra Attack's derivedStat/derivedStatTiers ride this
// array (unlike `toRows`, which drops those two fields) for the same reason
// FIGHTER_BASE_ROWS hand-builds rather than calling `toRows`. Hand-built per
// edition (not a shared flatMap over identical text, unlike this fixture's
// original commit-1 shape) because the two editions now genuinely diverge —
// mirrors ranger-features.ts's real content AND resource-pool columns
// exactly: Favored Enemy's (2024) flat level-tiered resourceTotals, and
// Tireless's/Nature's Veil's (2024) `{ abilityMod: "wisdom", min: 1 }`
// formula tiers (#1685) — ranger.ts no longer has a resourceFn for either.
// class-features-snapshot.test.ts calls deriveResources with EDITION_2024
// only, so the 2014 partition below matters for readability/parity with the
// other LITERAL_CLASS_ROWS fixtures more than for any assertion — but it is
// kept byte-accurate anyway, same discipline as FIGHTER_BASE_ROWS. Hunter's/
// Beast Master's own subclass rows need NO mirror (same reasoning as Rogue's
// module-wide exemption): neither declares a resourceKey/derivedStat
// anywhere in ranger-features.ts, so the `toRows(subDef?.features ?? [])` ->
// `[]` fallthrough (TEST_SUBCLASSES has no entry for either) loses nothing a
// `.resources`-observing test could see — their `choices` catalog (Hunter)
// keeps contributing `subclassChoices` independent of any row carrier.
export const RANGER_BASE_ROWS: ClassFeatureRow[] = [
  {
    name: "Favored Enemy",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Choose a type of favored enemy (beasts, fey, humanoids of a specific type, etc.). You have advantage on Survival checks to track them and on Intelligence checks to recall information about them. You learn one language spoken by your favored enemy. Additional enemy at L6 and L14.",
  },
  {
    name: "Favored Enemy",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You always have the Hunter's Mark spell prepared; it doesn't count against the number of spells you can prepare. You can cast it without expending a spell slot a number of times (2 at level 1, rising to 3/4/5/6 at levels 5/9/13/17), and you regain all expended uses when you finish a Long Rest.",
    resourceKey: "favoredEnemy",
    resourceLabel: "Favored Enemy (Hunter's Mark)",
    resourceRecharge: "longRest",
    resourceTotals: [
      { minLevel: 1, total: 2 },
      { minLevel: 5, total: 3 },
      { minLevel: 9, total: 4 },
      { minLevel: 13, total: 5 },
      { minLevel: 17, total: 6 },
    ],
  },
  {
    name: "Natural Explorer",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Choose a favored terrain type. When traveling in it: ignore difficult terrain, can't be surprised if alert, advantage on Initiative rolls, initiative even if surprised once per turn, move at normal pace while stealthing. Additional terrain at L6 and L10.",
  },
  {
    name: "Weapon Mastery",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You use the mastery properties of two kinds of weapons of your choice with which you have proficiency. Whenever you finish a Long Rest, you can change one or both of those weapon choices.",
  },
  {
    name: "Spellcasting",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You cast spells using Wisdom. Half-caster progression (first slots at level 2, one level behind full casters). You prepare a number of ranger spells equal to half your ranger level + Wisdom modifier (minimum 1).",
  },
  {
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You cast spells using Wisdom. Half-caster progression, with your first spell slots at level 1. You prepare a number of ranger spells from the Ranger spell list, shown on your class table's Spells Prepared column — 2 at level 1, growing to 15 by level 20 (#1127: the per-level table itself isn't modelled).",
  },
  {
    name: "Fighting Style",
    level: 2,
    edition: "EDITION_2014",
    description:
      "Choose: Archery (+2 ranged attack rolls), Defense (+1 AC in armor), Dueling (+2 melee damage with one weapon), or Two-Weapon Fighting (add ability modifier to off-hand damage).",
  },
  {
    name: "Fighting Style",
    level: 2,
    edition: "EDITION_2024",
    description:
      "Choose a Fighting Style feat. Alongside the shared options (Archery, Defense, Dueling, Two-Weapon Fighting, etc.), Rangers can choose Druidic Warrior: learn two Druid cantrips, cast using Wisdom, swapping one for a different Druid cantrip whenever you gain a Ranger level.",
  },
  {
    name: "Primeval Awareness",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Expend one spell slot to focus your awareness for 1 minute per slot level. You sense whether certain types of creatures are within 1 mile (or 6 miles in your favored terrain).",
  },
  {
    name: "Extra Attack",
    level: 5,
    edition: "EDITION_2014",
    description: "You can attack twice whenever you take the Attack action on your turn.",
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    name: "Extra Attack",
    level: 5,
    edition: "EDITION_2024",
    description: "You can attack twice whenever you take the Attack action on your turn.",
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    name: "Deft Explorer",
    level: 2,
    edition: "EDITION_2024",
    description:
      "Choose one skill you're proficient in; you gain Expertise in it (double proficiency bonus on its checks). You also learn two languages of your choice.",
  },
  {
    name: "Land's Stride",
    level: 8,
    edition: "EDITION_2014",
    description:
      "Moving through nonmagical difficult terrain costs no extra movement. You can pass through nonmagical plants without being slowed or taking damage. Advantage on saves against magically created or manipulated plants.",
  },
  {
    name: "Roving",
    level: 6,
    edition: "EDITION_2024",
    description:
      "Your Speed increases by 10 feet while you aren't wearing Heavy armor. You also gain a Climb Speed and a Swim Speed, both equal to your Speed.",
  },
  {
    name: "Hide in Plain Sight",
    level: 10,
    edition: "EDITION_2014",
    description:
      "Spend 1 minute camouflaging yourself: gain +10 to Dexterity (Stealth) checks while you remain motionless. The bonus is lost when you move, take an action, or take a reaction.",
  },
  {
    name: "Expertise",
    level: 9,
    edition: "EDITION_2024",
    description: "Choose two more skills you're proficient in; you gain Expertise in them.",
  },
  {
    name: "Tireless",
    level: 10,
    edition: "EDITION_2024",
    description:
      "As a Magic action, you gain Temporary Hit Points equal to 1d8 plus your Wisdom modifier, and your Exhaustion level (if any) decreases by 1. You can use this feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest.",
    resourceKey: "tireless",
    resourceLabel: "Tireless",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 10, total: { abilityMod: "wisdom", min: 1 } }],
  },
  {
    name: "Vanish",
    level: 14,
    edition: "EDITION_2014",
    description:
      "You can use the Hide action as a bonus action on your turn. Also, you can't be tracked by nonmagical means unless you choose to leave a trail.",
  },
  {
    name: "Relentless Hunter",
    level: 13,
    edition: "EDITION_2024",
    description: "Taking damage can't break your Concentration on the Hunter's Mark spell.",
  },
  {
    name: "Nature's Veil",
    level: 14,
    edition: "EDITION_2024",
    description:
      "As a Bonus Action, you magically become Invisible until the end of your next turn. You can use this feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest.",
    resourceKey: "naturesVeil",
    resourceLabel: "Nature's Veil",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 14, total: { abilityMod: "wisdom", min: 1 } }],
  },
  {
    name: "Precise Hunter",
    level: 17,
    edition: "EDITION_2024",
    description: "You have advantage on attack rolls against the creature currently marked by your Hunter's Mark spell.",
  },
  {
    name: "Feral Senses",
    level: 18,
    edition: "EDITION_2014",
    description:
      "When not blinded or deafened, you are aware of invisible creatures within 30 ft even if they are hidden. In combat, no disadvantage on attacks against invisible creatures within 30 ft.",
  },
  {
    name: "Feral Senses",
    level: 18,
    edition: "EDITION_2024",
    description: "You have Blindsight with a range of 30 feet.",
  },
  {
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    description: "You gain an Epic Boon feat of your choice (Boon of Dimensional Travel recommended). You can take this feat only once.",
  },
  {
    name: "Foe Slayer",
    level: 20,
    edition: "EDITION_2014",
    description:
      "Once per turn when you hit a favored enemy with a weapon, you may add your Wisdom modifier to the attack roll or the damage roll.",
  },
  {
    name: "Foe Slayer",
    level: 20,
    edition: "EDITION_2024",
    description: "The damage die of your Hunter's Mark spell is a d10 rather than a d6.",
  },
];

// THE FIEND (#1233): mirrors warlock-features.ts's real SRD 5.2 content and
// resource-pool columns exactly — Dark One's Own Luck's 2024 row carries a
// { abilityMod: "charisma", min: 1 } formula tier (#1685; warlock.ts no
// longer has a resourceFn for it), and Hurl Through Hell's resourceTotals/
// recharge are identical across both editions (only the description and gate
// level differ).
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
    resourceKey: "darkOnesOwnLuck",
    resourceLabel: "Dark One's Own Luck",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 6, total: 1 }],
  },
  {
    name: "Dark One's Own Luck",
    level: 6,
    edition: "EDITION_2024",
    description:
      "You can call on your fiendish patron to alter fate in your favor. When you make an ability check or a saving throw, add 1d10 to the roll after seeing it but before its effects occur. You can do this a number of times equal to your Charisma modifier (minimum of once), but no more than once per roll. Regain all expended uses when you finish a Long Rest.",
    resourceKey: "darkOnesOwnLuck",
    resourceLabel: "Dark One's Own Luck",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 6, total: { abilityMod: "charisma", min: 1 } }],
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
    resourceKey: "hurlThroughHell",
    resourceLabel: "Hurl Through Hell",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 14, total: 1 }],
  },
  {
    name: "Hurl Through Hell",
    level: 14,
    edition: "EDITION_2024",
    description:
      "Once per turn when you hit a creature with an attack, you can try to instantly transport it through the Lower Planes. The target must succeed on a Charisma saving throw against your spell save DC or disappear and hurtle through a nightmare landscape, taking 8d10 psychic damage if it isn't a Fiend and gaining the Incapacitated condition until the end of your next turn, when it returns to its space or the nearest unoccupied one. Once used, you can't use it again until you finish a Long Rest unless you expend a Pact Magic spell slot (no action required) to restore it.",
    resourceKey: "hurlThroughHell",
    resourceLabel: "Hurl Through Hell",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 14, total: 1 }],
  },
];

// THE ARCHFEY / THE GREAT OLD ONE are EDITION_2014 only, mirroring
// WARLOCK_FEATURES: #1233 tagged every one of their rows 2014 and authored zero
// 2024 rows, because no licensed source could verify their PHB'24 reworks
// (owner decision), and assertEverySubclassEditionPopulated (#1559) turns that
// into a hard product fact — a 2024 character cannot pick either patron.
//
// They were frozen at a fabricated both-editions shape until #1595, purely so
// subclass-grant-level.test.ts's grant-level cases could derive them at
// EDITION_2024 and find rows to gate. Those cases are gone (both patrons now
// prove the 2014 gate through GATE_1, and Sorcerer/Wild Magic carries the pool
// case), so nothing needs the fabricated rows and they would only teach the
// suite a state production forbids. Do not re-add a 2024 partition here to make
// a new test pass — narrow the test's edition instead.
//
// Still true and load-bearing for the pool columns below: the real seed's
// EDITION_2024 partition of WARLOCK_FEATURES has none of these keys at all, so
// Fey Presence/Misty Escape/Dark Delirium/Entropic Ward are 2014-only pools and
// poolsFromRows is the only thing that produces them (these patrons' 2014
// resourceFns in lib/classes/warlock.ts were deleted by #1233).
export const THE_ARCHFEY_ROWS: ClassFeatureRow[] = [
  {
    name: "Expanded Spell List",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Add archfey spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Faerie Fire, Sleep (1st); Calm Emotions, Phantasmal Force (2nd); Blink, Plant Growth (3rd); Dominate Beast, Greater Invisibility (4th); Dominate Person, Seeming (5th).",
  },
  {
    name: "Fey Presence",
    level: 1,
    edition: "EDITION_2014",
    description:
      "As an action, project a beguiling or dreadful aura in a 10-ft cube. Each creature there must succeed on a Wisdom save (spell save DC) or be charmed or frightened (your choice) until the end of your next turn. Once used, regain on a short or long rest.",
    resourceKey: "feyPresence",
    resourceLabel: "Fey Presence",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 1, total: 1 }],
  },
  {
    name: "Misty Escape",
    level: 6,
    edition: "EDITION_2014",
    description:
      "When you take damage, use your reaction to turn invisible and teleport up to 60 ft to an unoccupied space you can see. Invisibility lasts until the start of your next turn or until you attack or cast a spell. Once used, regain on a short or long rest.",
    resourceKey: "mistyEscape",
    resourceLabel: "Misty Escape",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 6, total: 1 }],
  },
  {
    name: "Beguiling Defenses",
    level: 10,
    edition: "EDITION_2014",
    description:
      "You are immune to being charmed. When another creature attempts to charm you, you can use your reaction to have it make a Wisdom saving throw (spell save DC) or be charmed by you for 1 minute or until it takes damage.",
  },
  {
    name: "Dark Delirium",
    level: 14,
    edition: "EDITION_2014",
    description:
      "As an action, plunge a creature within 60 ft into an illusory dreamscape (Wisdom save DC = spell save DC). While charmed or frightened (your choice) it is incapacitated and ignores its surroundings. It repeats the save at the end of each turn, or when it takes damage. Once used, regain on a short or long rest.",
    resourceKey: "darkDelirium",
    resourceLabel: "Dark Delirium",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 14, total: 1 }],
  },
];

export const THE_GREAT_OLD_ONE_ROWS: ClassFeatureRow[] = [
  {
    name: "Expanded Spell List",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Add Great Old One spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Dissonant Whispers, Hideous Laughter (1st); Detect Thoughts, Phantasmal Force (2nd); Clairvoyance, Sending (3rd); Dominate Beast, Black Tentacles (4th); Dominate Person, Telekinesis (5th).",
  },
  {
    name: "Awakened Mind",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Communicate telepathically with any creature you can see within 30 ft. The creature understands you even if it shares no language with you, though it cannot telepathically respond.",
  },
  {
    name: "Entropic Ward",
    level: 6,
    edition: "EDITION_2014",
    description:
      "When a creature makes an attack roll against you, use your reaction to impose disadvantage. If it misses, you gain advantage on your next attack against it before the end of your next turn. Once used, regain on a short or long rest.",
    resourceKey: "entropicWard",
    resourceLabel: "Entropic Ward",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 6, total: 1 }],
  },
  {
    name: "Thought Shield",
    level: 10,
    edition: "EDITION_2014",
    description:
      "Your thoughts can't be read by telepathy or other means unless you allow it. Resistance to psychic damage. When a creature deals psychic damage to you, it takes the same amount.",
  },
  {
    name: "Create Thrall",
    level: 14,
    edition: "EDITION_2014",
    description:
      "Touch an incapacitated humanoid to charm it indefinitely (no save). While charmed, it obeys your commands and you share telepathic communication with it. Each time the thrall takes damage, it makes a Charisma save to break free (DC = your spell save DC).",
  },
];

// SORCERER's base class + subclass rows (#1232): moved off sorcerer.ts's
// SORCERER_FEATURES/DRACONIC_BLOODLINE_FEATURES/WILD_MAGIC_FEATURES
// AuthoredFeature[] arrays onto literal seed data
// (prisma/seed/sorcerer-features.ts) — the same rootDir boundary
// FIGHTER_BASE_ROWS'/WARLOCK_BASE_ROWS' comments explain. Mirrors that file's
// real SRD 5.2/PHB'24 (2024) content exactly, including its RESOURCE POOL
// columns (commit 3 of 3) — every row below now sets its own `edition`, per
// that file's tagging rule.
export const SORCERER_BASE_ROWS: ClassFeatureRow[] = [
  {
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You cast spells using Charisma. Full-caster progression. You know a limited number of sorcerer spells (not prepared — always available).",
  },
  {
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You cast spells using Charisma. Full-caster progression. You know 4 Sorcerer cantrips (5 at level 4, 6 at level 10) and prepare a growing list of Sorcerer spells — you choose which spells are prepared whenever you finish a Long Rest. An Arcane Focus serves as your Spellcasting Focus.",
  },
  {
    name: "Innate Sorcery",
    level: 1,
    edition: "EDITION_2024",
    description:
      "As a Bonus Action, unleash the wellspring of magic within you: for 1 minute, you gain a +1 bonus to your spell save DC and spell attack bonus, and you have Advantage on the attack rolls of Sorcerer spells you cast. You can use this feature twice, and you regain all expended uses when you finish a Long Rest.",
    resourceKey: "innateSorcery",
    resourceLabel: "Innate Sorcery",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 1, total: 2 }],
  },
  {
    name: "Font of Magic",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You have a pool of Sorcery Points equal to your sorcerer level. Spend them to create spell slots or fuel Metamagic options. Creating slots costs 2 SP (1st), 3 SP (2nd), 5 SP (3rd), 6 SP (4th), or 7 SP (5th). You can also expend a spell slot to gain SP equal to its level. Regain all SP on a long rest.",
  },
  {
    name: "Font of Magic",
    level: 2,
    edition: "EDITION_2024",
    description:
      "You have a pool of Sorcery Points equal to your Sorcerer level. As a Bonus Action, expend a spell slot to gain Sorcery Points equal to the slot's level, or spend Sorcery Points to create a spell slot (no action required): 2 SP for a level 1 slot (minimum Sorcerer level 2), 3 SP for level 2 (minimum level 3), 5 SP for level 3 (minimum level 5), 6 SP for level 4 (minimum level 7), 7 SP for level 5 (minimum level 9) — never above level 5. A slot created this way vanishes when you finish a Long Rest. You regain all expended Sorcery Points when you finish a Long Rest.",
  },
  {
    name: "Metamagic",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Choose 2 Metamagic options (3 at L10, 4 at L17) to twist your spells: Careful (protect allies in AoE), Distant (double range), Empowered (reroll damage dice), Extended (double duration), Heightened (impose disadvantage on target's first save), Quickened (cast as bonus action), Subtle (no verbal/somatic), or Twinned (target two creatures).",
  },
  {
    name: "Metamagic",
    level: 2,
    edition: "EDITION_2024",
    description:
      "You gain 2 Metamagic options of your choice (2 more at level 10, 2 more at level 17), letting you twist your spells by spending Sorcery Points: Careful Spell (1 SP, protect chosen creatures from your own area spell), Distant Spell (1 SP, double range or make a touch spell reach 30 feet), Empowered Spell (1 SP, reroll damage dice up to your Charisma modifier), Extended Spell (1 SP, double a non-instantaneous duration), Heightened Spell (2 SP, Disadvantage on one target's first save against the spell), Quickened Spell (2 SP, cast an action spell as a Bonus Action), Seeking Spell (1 SP, reroll a missed spell attack roll), Subtle Spell (1 SP, cast without Verbal or Somatic components), Transmuted Spell (1 SP, change a spell's damage type to another type it can deal), or Twinned Spell (SP cost equal to the spell's level, minimum 1, target a second creature).",
  },
  {
    name: "Sorcerous Origin",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Your innate magic comes from a specific origin (subclass). Your origin grants you features at levels 1, 6, 14, and 18.",
  },
  {
    name: "Sorcerer Subclass",
    level: 3,
    edition: "EDITION_2024",
    description:
      "Your innate magic comes from a Sorcerer Subclass of your choice, which grants you features at levels 3, 6, 14, and 18.",
  },
  {
    name: "Sorcerous Restoration",
    level: 20,
    edition: "EDITION_2014",
    description: "You regain 4 expended Sorcery Points whenever you finish a short rest.",
  },
  {
    name: "Sorcerous Restoration",
    level: 5,
    edition: "EDITION_2024",
    description:
      "When you finish a Short Rest, you can regain expended Sorcery Points, up to a number equal to half your Sorcerer level (rounded down). Once you use this feature, you must finish a Long Rest before you can use it again.",
    resourceKey: "sorcerousRestoration",
    resourceLabel: "Sorcerous Restoration",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 5, total: 1 }],
  },
  {
    name: "Sorcery Incarnate",
    level: 7,
    edition: "EDITION_2024",
    description:
      "You can spend 2 Sorcery Points to use your Innate Sorcery even if you have no uses of it left. While your Innate Sorcery is active, you can apply two Metamagic options to a spell you cast instead of one, paying their combined Sorcery Point cost.",
  },
  {
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    description: "You gain an Epic Boon feat of your choice (Boon of Dimensional Travel recommended). You can take this feat only once.",
  },
  {
    name: "Arcane Apotheosis",
    level: 20,
    edition: "EDITION_2024",
    description:
      "While your Innate Sorcery is active, you can apply one Metamagic option to a spell you cast without spending any Sorcery Points, once per turn.",
  },
];

export const DRACONIC_BLOODLINE_ROWS: ClassFeatureRow[] = [
  {
    name: "Dragon Ancestor",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Choose a dragon type (black, blue, brass, bronze, copper, gold, green, red, silver, or white). You gain the ability to speak, read, and write Draconic, and have advantage on Charisma checks when interacting with dragons of that type.",
  },
  {
    name: "Draconic Resilience",
    level: 1,
    edition: "EDITION_2014",
    description: "Your HP maximum increases by 1 per sorcerer level. While not wearing armor, your AC equals 13 + your Dexterity modifier.",
  },
  {
    name: "Draconic Resilience",
    level: 3,
    edition: "EDITION_2024",
    description:
      "Your Hit Point maximum increases by 3, and it increases by 1 again whenever you gain a Sorcerer level. While you aren't wearing armor, your base Armor Class equals 10 plus your Dexterity and Charisma modifiers.",
  },
  {
    name: "Draconic Spells",
    level: 3,
    edition: "EDITION_2024",
    description:
      "You always have certain spells prepared; they don't count against the number of spells you can prepare with Spellcasting: Alter Self, Chromatic Orb, Command, Dragon's Breath (level 3); Fear, Fly (level 5); Arcane Eye, Charm Monster (level 7); Legend Lore, Summon Dragon (level 9).",
  },
  {
    name: "Elemental Affinity",
    level: 6,
    edition: "EDITION_2014",
    description:
      "When you cast a spell that deals the damage type associated with your dragon ancestor, add your Charisma modifier to one damage roll. Also spend 1 Sorcery Point to gain resistance to that damage type for 1 hour.",
  },
  {
    name: "Elemental Affinity",
    level: 6,
    edition: "EDITION_2024",
    description:
      "Your draconic magic has an affinity with a damage type associated with dragons. Choose one of those types: Acid, Cold, Fire, Lightning, or Poison. You have Resistance to that damage type, and when you cast a spell that deals damage of that type, you can add your Charisma modifier to one damage roll of that spell.",
  },
  {
    name: "Dragon Wings",
    level: 14,
    edition: "EDITION_2014",
    description:
      "Sprout draconic wings as a bonus action, gaining a flying speed equal to your current speed. The wings last until you dismiss them (no action required).",
  },
  {
    name: "Dragon Wings",
    level: 14,
    edition: "EDITION_2024",
    description:
      "As a Bonus Action, you sprout draconic wings, which last for 1 hour or until you dismiss them (no action required); while they persist, you have a Fly Speed of 60 feet. Once you use this feature, you can't use it again until you finish a Long Rest unless you spend 3 Sorcery Points (no action required) to restore your use of it.",
    resourceKey: "dragonWings",
    resourceLabel: "Dragon Wings",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 14, total: 1 }],
  },
  {
    name: "Draconic Presence",
    level: 18,
    edition: "EDITION_2014",
    description:
      "As an action, spend 5 Sorcery Points to channel draconic majesty for 1 minute (concentration). Each hostile creature within 60 ft that can see you must succeed on a Wisdom save (spell save DC) or be charmed (awed) or frightened (your choice) for the duration.",
  },
  {
    name: "Dragon Companion",
    level: 18,
    edition: "EDITION_2024",
    description:
      "You can cast Summon Dragon without expending a spell slot, a number of times equal to your Proficiency Bonus, regaining all expended uses when you finish a Long Rest. When you cast it this way, roll the die to randomly determine the dragon's type rather than choosing.",
  },
];

export const WILD_MAGIC_ROWS: ClassFeatureRow[] = [
  {
    name: "Wild Magic Surge",
    level: 1,
    edition: "EDITION_2014",
    description:
      "After casting a sorcerer spell of 1st level or higher, the DM may ask you to roll a d20. On a 1, roll a d100 and consult the Wild Magic Surge table for a random magical effect.",
  },
  {
    name: "Wild Magic Surge",
    level: 3,
    edition: "EDITION_2024",
    description:
      "Once per turn, you can roll 1d20 immediately after you cast a Sorcerer spell with a spell slot. If you roll a 20, roll on the Wild Magic Surge table for a random magical effect. A spell that triggers a surge this way is immune to your Metamagic.",
  },
  {
    name: "Tides of Chaos",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Gain advantage on one attack roll, ability check, or saving throw. Once used, the DM can force a Wild Magic Surge before you can use this feature again. Alternatively, regain use after a long rest.",
    resourceKey: "tidesOfChaos",
    resourceLabel: "Tides of Chaos",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 1, total: 1 }],
  },
  {
    name: "Tides of Chaos",
    level: 3,
    edition: "EDITION_2024",
    description:
      "Before you make a D20 Test, you can gain Advantage on it. Once you do so, you must finish a Long Rest or cast a Sorcerer spell using a spell slot before you can use this feature again — doing the latter automatically triggers a roll on the Wild Magic Surge table.",
    resourceKey: "tidesOfChaos",
    resourceLabel: "Tides of Chaos",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 3, total: 1 }],
  },
  {
    name: "Bend Luck",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Spend 2 Sorcery Points as a reaction to add or subtract 1d4 from an attack roll, ability check, or saving throw made by a creature you can see.",
  },
  {
    name: "Bend Luck",
    level: 6,
    edition: "EDITION_2024",
    description:
      "When another creature you can see makes an attack roll, an ability check, or a saving throw, you can take a Reaction and spend 1 Sorcery Point to roll 1d4 and apply it as a bonus or penalty (your choice) to that creature's roll.",
  },
  {
    name: "Controlled Chaos",
    level: 14,
    edition: "EDITION_2014",
    description: "When rolling on the Wild Magic Surge table, roll twice and use either result.",
  },
  {
    name: "Controlled Chaos",
    level: 14,
    edition: "EDITION_2024",
    description: "Whenever you roll on the Wild Magic Surge table, you can roll twice and use either result.",
  },
  {
    name: "Spell Bombardment",
    level: 18,
    edition: "EDITION_2014",
    description:
      "Once per turn when you roll damage for a spell and any die shows the highest possible result, choose one die, roll it again, and add the result to the damage.",
  },
  {
    name: "Tamed Surge",
    level: 18,
    edition: "EDITION_2024",
    description:
      "Once per Long Rest, whenever you roll on the Wild Magic Surge table, you can replace the triggered effect with a Wild Magic Surge effect of your choice from the table, other than its final effect.",
    resourceKey: "tamedSurge",
    resourceLabel: "Tamed Surge",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 18, total: 1 }],
  },
];
// CLERIC's base class + both domains (#1225): mirrors cleric-features.ts's
// real SRD 5.2/mirror-sourced content exactly — the SAME rootDir boundary
// FIGHTER_BASE_ROWS'/WARLOCK_BASE_ROWS' comments explain. Added in commit 1
// (not held back for the pool move in commit 3, unlike Warlock's own
// WARLOCK_BASE_ROWS split): the plan for #1225 originally assumed
// `withoutFeatures` stripping `.features` before snapshotting meant no
// fixture change was needed here until the pool landed, but removing
// cleric.ts's AuthoredFeature arrays with NO literal-row override made
// deriveResources return `null` instead of `{resources: [], features: []}`
// at levels where both layers are empty (e.g. cleric level 1) — a real
// behavioural difference several unit tests observe directly (srd.test.ts's
// Channel Divinity suite, subclass-grant-level.test.ts's domain-gate
// checks), not something `withoutFeatures` erases. Commit 2 (real 2024
// content) and commit 3 (the Channel Divinity pool's resourceKey/
// resourceLabel/resourceRecharge/resourceTotals on the two carrier rows —
// see cleric-features.ts's own RESOURCE POOL header block) each updated these
// three exports in step with cleric-features.ts, exactly mirroring what
// class-features.ts's production seed does — a flat per-row array (not
// `toRows`, unlike this file's fully-both-editions-identical exports) since
// 2014 and 2024 genuinely diverge in row count from commit 2 on.
export const CLERIC_BASE_ROWS: ClassFeatureRow[] = [
  {
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You cast spells using Wisdom. Full-caster progression. You prepare a number of cleric spells equal to your Wisdom modifier + your cleric level (minimum 1).",
  },
  {
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You cast spells using Wisdom. You know three cantrips of your choice from the Cleric spell list, replacing one whenever you gain a Cleric level; you learn an additional cantrip at levels 4 and 10. You prepare a growing list of Cleric spells (4 at level 1, rising to 22 by level 20, per the Cleric Features table), regain all expended spell slots on a Long Rest, and can change your prepared list whenever you finish one. A Holy Symbol serves as your Spellcasting Focus.",
  },
  {
    name: "Divine Order",
    level: 1,
    edition: "EDITION_2024",
    description:
      "Choose a sacred role: Protector — proficiency with Martial weapons and training with Heavy armor — or Thaumaturge — learn one extra Cleric cantrip, and add your Wisdom modifier (minimum +1) to Arcana or Religion checks.",
  },
  {
    name: "Channel Divinity",
    level: 2,
    edition: "EDITION_2024",
    description:
      "You channel divine energy from the Outer Planes to fuel magical effects — Divine Spark and Turn Undead at 2nd level, more at higher levels. Each time you use it, choose which effect to create. You have 2 uses (3 at level 6, 4 at level 18). You regain one of its expended uses when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest.",
    resourceKey: "channelDivinity",
    resourceLabel: "Channel Divinity",
    resourceRecharge: "longRest",
    resourceTotals: [
      { minLevel: 2, total: 2, shortRestRegain: 1 },
      { minLevel: 6, total: 3, shortRestRegain: 1 },
      { minLevel: 18, total: 4, shortRestRegain: 1 },
    ],
  },
  {
    name: "Channel Divinity: Divine Spark",
    level: 2,
    edition: "EDITION_2024",
    description:
      "As a Magic action, point your Holy Symbol at a creature you can see within 30 ft and roll 1d8 plus your Wisdom modifier: either restore that many Hit Points to the creature, or force it to make a Constitution saving throw — on a failure it takes Necrotic or Radiant damage (your choice) equal to that total, half as much (round down) on a success. Roll an additional d8 at Cleric levels 7 (2d8), 13 (3d8), and 18 (4d8).",
  },
  {
    name: "Channel Divinity: Turn Undead",
    level: 2,
    edition: "EDITION_2014",
    description:
      "As an action, each undead within 30 ft that can see or hear you must make a Wisdom save (DC 8 + proficiency + Wisdom modifier) or be turned for 1 minute. Turned undead flee you.",
    resourceKey: "channelDivinity",
    resourceLabel: "Channel Divinity",
    resourceRecharge: "short-or-long",
    resourceTotals: [
      { minLevel: 2, total: 1 },
      { minLevel: 6, total: 2 },
      { minLevel: 18, total: 3 },
    ],
  },
  {
    name: "Channel Divinity: Turn Undead",
    level: 2,
    edition: "EDITION_2024",
    description:
      "As a Magic action, present your Holy Symbol; each Undead of your choice within 30 ft must succeed on a Wisdom saving throw or gain the Frightened and Incapacitated conditions for 1 minute, trying to move as far from you as it can on its turns. This effect ends early on the creature if it takes any damage, if you have the Incapacitated condition, or if you die.",
  },
  {
    name: "Destroy Undead",
    level: 5,
    edition: "EDITION_2014",
    description:
      "When you turn an undead, any with CR 1/2 or lower are instantly destroyed (CR 1 at L8; CR 2 at L11; CR 3 at L14; CR 4 at L17).",
  },
  {
    name: "Sear Undead",
    level: 5,
    edition: "EDITION_2024",
    description:
      "Whenever you use Turn Undead, roll a number of d8s equal to your Wisdom modifier (minimum 1d8) and add them together. Each Undead that fails its save against that use of Turn Undead takes Radiant damage equal to the total. This damage doesn't end the turn effect.",
  },
  {
    name: "Blessed Strikes",
    level: 7,
    edition: "EDITION_2024",
    description:
      "Choose Divine Strike — once on each of your turns when you hit with a weapon, deal an extra 1d8 Necrotic or Radiant damage (your choice) — or Potent Spellcasting — add your Wisdom modifier to the damage of any Cleric cantrip. (If you already have an option of this name from an older-book subclass, use only the option you choose here.)",
  },
  {
    name: "Divine Intervention",
    level: 10,
    edition: "EDITION_2014",
    description:
      "Call on your deity for aid. Roll percentile dice — on a result ≤ your cleric level, your deity intervenes. On a success, you can't use this feature again for 7 days. At level 20 it automatically succeeds.",
  },
  {
    name: "Divine Intervention",
    level: 10,
    edition: "EDITION_2024",
    description:
      "As a Magic action, choose any Cleric spell of level 5 or lower that doesn't require a Reaction to cast, and cast it as part of the same action without expending a spell slot or needing Material components. Usable once per Long Rest.",
  },
  {
    name: "Improved Blessed Strikes",
    level: 14,
    edition: "EDITION_2024",
    description:
      "Your Blessed Strikes option grows stronger: Divine Strike's extra damage increases to 2d8; Potent Spellcasting lets you grant temporary Hit Points equal to twice your Wisdom modifier to yourself or another creature within 60 ft whenever a Cleric cantrip of yours deals damage.",
  },
  {
    name: "Divine Intervention Improvement",
    level: 20,
    edition: "EDITION_2014",
    description: "Your Divine Intervention call automatically succeeds (no roll required).",
  },
  {
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    description: "You gain an Epic Boon feat of your choice (Boon of Fate recommended). You can take this feat only once.",
  },
  {
    name: "Greater Divine Intervention",
    level: 20,
    edition: "EDITION_2024",
    description:
      "When you use Divine Intervention, you can choose Wish as the spell. If you do, you can't use Divine Intervention again until you finish 2d4 Long Rests.",
  },
];

export const CLERIC_LIFE_DOMAIN_ROWS: ClassFeatureRow[] = [
  {
    name: "Domain Spells",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Bless, Cure Wounds (L1); Lesser Restoration, Spiritual Weapon (L3); Beacon of Hope, Revivify (L5); Death Ward, Guardian of Faith (L7); Mass Cure Wounds, Raise Dead (L9).",
  },
  {
    name: "Life Domain Spells",
    level: 3,
    edition: "EDITION_2024",
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Aid, Bless, Cure Wounds, Lesser Restoration (L3); Mass Healing Word, Revivify (L5); Aura of Life, Death Ward (L7); Greater Restoration, Mass Cure Wounds (L9).",
  },
  { name: "Bonus Proficiency", level: 1, edition: "EDITION_2014", description: "You gain proficiency with heavy armor." },
  {
    name: "Disciple of Life",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Whenever you use a spell of 1st level or higher to restore hit points to a creature, the creature regains additional HP equal to 2 + the spell's level.",
  },
  {
    name: "Disciple of Life",
    level: 3,
    edition: "EDITION_2024",
    description:
      "When a spell you cast with a spell slot restores Hit Points to a creature, that creature regains additional Hit Points on the turn you cast it, equal to 2 plus the spell slot's level.",
  },
  {
    name: "Channel Divinity: Preserve Life",
    level: 2,
    edition: "EDITION_2014",
    description:
      "As an action, evoke healing energy that restores a total of 5× your cleric level HP, divided among creatures within 30 ft (up to half their maximum HP each). Uses the Channel Divinity pool.",
  },
  {
    name: "Channel Divinity: Preserve Life",
    level: 3,
    edition: "EDITION_2024",
    description:
      "As a Magic action, expend a use of Channel Divinity to evoke healing energy: restore a total of 5× your cleric level HP, divided among Bloodied creatures within 30 ft (which can include you), up to half each creature's HP maximum.",
  },
  {
    name: "Blessed Healer",
    level: 6,
    edition: "EDITION_2014",
    description:
      "When you cast a healing spell of 1st level or higher that restores HP to another creature, you regain HP equal to 2 + the spell's level.",
  },
  {
    name: "Blessed Healer",
    level: 6,
    edition: "EDITION_2024",
    description:
      "Immediately after you cast a spell with a spell slot that restores Hit Points to one or more creatures other than yourself, you regain Hit Points equal to 2 plus the spell slot's level.",
  },
  {
    name: "Divine Strike",
    level: 8,
    edition: "EDITION_2014",
    description: "Once per turn when you hit with a weapon, deal an extra 1d8 radiant damage (+2d8 at level 14).",
  },
  {
    name: "Supreme Healing",
    level: 17,
    edition: "EDITION_2014",
    description: "When you would normally roll dice to restore HP with a spell, use the highest number possible instead of rolling.",
  },
  {
    name: "Supreme Healing",
    level: 17,
    edition: "EDITION_2024",
    description:
      "When you would normally roll dice to restore Hit Points with a spell or Channel Divinity, use the highest number possible for each die instead of rolling.",
  },
];

export const CLERIC_TRICKERY_DOMAIN_ROWS: ClassFeatureRow[] = [
  {
    name: "Domain Spells",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Charm Person, Disguise Self (L1); Mirror Image, Pass without Trace (L3); Blink, Dispel Magic (L5); Dimension Door, Polymorph (L7); Dominate Person, Modify Memory (L9).",
  },
  {
    name: "Trickery Domain Spells",
    level: 3,
    edition: "EDITION_2024",
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Charm Person, Disguise Self, Invisibility, Pass without Trace (L3); Hypnotic Pattern, Nondetection (L5); Confusion, Dimension Door (L7); Dominate Person, Modify Memory (L9).",
  },
  {
    name: "Blessing of the Trickster",
    level: 1,
    edition: "EDITION_2014",
    description:
      "As an action, touch a willing creature to give it advantage on Dexterity (Stealth) checks. Lasts 1 hour or until you use this feature again.",
  },
  {
    name: "Blessing of the Trickster",
    level: 3,
    edition: "EDITION_2024",
    description:
      "As a Magic action, give yourself or a willing creature within 30 ft advantage on Dexterity (Stealth) checks. Lasts until you finish a Long Rest or you use this feature again.",
  },
  {
    name: "Channel Divinity: Invoke Duplicity",
    level: 2,
    edition: "EDITION_2014",
    description:
      "As an action, create an illusory duplicate of yourself within 30 ft that lasts for 1 minute (concentration). You can attack with advantage against a creature within 5 ft of the duplicate, and can cast spells as if from the duplicate's space. Uses the Channel Divinity pool.",
  },
  {
    name: "Channel Divinity: Invoke Duplicity",
    level: 3,
    edition: "EDITION_2024",
    description:
      "As a Bonus Action, expend a use of Channel Divinity to create an illusory duplicate of yourself in an unoccupied space within 30 ft, lasting 1 minute (no Concentration required). You can cast spells as if from the duplicate's space, gain advantage on attack rolls against a creature within 5 ft of it, and use a Bonus Action to move it up to 30 ft.",
  },
  {
    name: "Channel Divinity: Cloak of Shadows",
    level: 6,
    edition: "EDITION_2014",
    description: "As an action, become invisible until the end of your next turn. Uses the Channel Divinity pool.",
  },
  {
    name: "Trickster's Transposition",
    level: 6,
    edition: "EDITION_2024",
    description: "Whenever you use a Bonus Action to create or move your Invoke Duplicity illusion, you can teleport, swapping places with it.",
  },
  {
    name: "Divine Strike",
    level: 8,
    edition: "EDITION_2014",
    description: "Once per turn when you hit with a weapon, deal an extra 1d8 poison damage (+2d8 at level 14).",
  },
  {
    name: "Improved Duplicity",
    level: 17,
    edition: "EDITION_2014",
    description:
      "When you use Invoke Duplicity, you can create up to four duplicates instead of one. As a bonus action on your turn, move any number of them up to 30 ft (no more than 120 ft away from you).",
  },
  {
    name: "Improved Duplicity",
    level: 17,
    edition: "EDITION_2024",
    description:
      "Your Invoke Duplicity illusion gains two benefits: Shared Distraction — you and your allies have advantage on attack rolls against a creature within 5 ft of the illusion; Healing Illusion — when the illusion ends, you or a creature of your choice within 5 ft of it regains Hit Points equal to your Cleric level.",
  },
];

// DRUID's base-class + both circles' rows (#1226): lib/classes/druid.ts's
// `.features`/subclass `.features` arrays moved to literal seed data
// (prisma/seed/druid-features.ts) — the same rootDir boundary
// FIGHTER_BASE_ROWS' comment explains (druid.ts itself still exists — see
// its own header for why it isn't deletable — but none of its three
// `.features` arrays survive). REQUIRED for all three (base + both circles),
// unlike Barbarian's/Ranger's subclasses which need no mirror at all:
// srd.test.ts's Circle of the Moon feature-presence checks and
// subclass-grant-level.test.ts's domain-gate-shaped checks call
// testFeatureRowsFor with a Druid circle and assert directly on
// null-ness/`.length` — the same CLERIC'S TWO DOMAINS counterexample this
// file's own header names. Hand-built per edition (not a shared flatMap over
// identical text, same reason RANGER_BASE_ROWS gives) because every Druid
// feature genuinely diverges by #1226's own tagging rule (druid-features.ts's
// header) — mirrors that file's real content AND resource-pool columns
// exactly: the EDITION_2024 Wild Shape row's resourceTotals (#1226 commit 3),
// and Moonlight Step's { abilityMod: "wisdom", min: 1 } formula tier (#1685)
// — druid.ts no longer has a resourceFn for either, and Druid is no longer in
// TEST_CLASSES (dropped at #1226 commit 1, same as Fighter/Barbarian/Rogue),
// so this fixture's own poolsFromRows call is now the whole story for both
// pools — DB-backed suites (druid-wildshape-pool.test.ts) additionally prove
// the end-to-end pool through the real seed.
export const DRUID_BASE_ROWS: ClassFeatureRow[] = [
  {
    name: "Druidic",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You know Druidic, the secret language of druids. You can speak it and leave hidden messages in natural surroundings.",
  },
  {
    name: "Druidic",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You know Druidic, the secret language of druids, and you can leave hidden messages that others can discover only with a successful DC 15 Intelligence (Investigation) check. You always have the Speak with Animals spell prepared, and you can cast it without expending a spell slot.",
  },
  {
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You cast spells using Wisdom. Full-caster progression. You prepare a number of druid spells equal to your Wisdom modifier + your druid level (minimum 1).",
  },
  {
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You cast spells using Wisdom (spell save DC = 8 + your Proficiency Bonus + your Wisdom modifier). You know 2 Druid cantrips of your choice from the Druid spell list (3 at level 4, 4 at level 10), and you can replace one of them with another Druid cantrip whenever you finish a Long Rest. You prepare a number of Druid spells equal to the number shown on the Druid Features table for your level (4 at level 1, growing to 22 by level 20) after finishing a Long Rest, and you regain all expended spell slots when you finish a Long Rest. You can use a Druidic Focus as a spellcasting focus for your Druid spells.",
  },
  {
    name: "Wild Shape",
    level: 2,
    edition: "EDITION_2014",
    description:
      "As an action, transform into a beast you have seen. Max CR: 1/4 at L2 (no flying or swimming speed); 1/2 at L4 (no flying speed); 1 at L8. You retain your mental stats and class features but use the beast's physical stats. Lasts up to half your druid level in hours (minimum 1). Reverts when reduced to 0 HP.",
  },
  {
    name: "Wild Shape",
    level: 2,
    edition: "EDITION_2024",
    description:
      "As a Bonus Action, you transform into a Beast you have seen before, with a challenge rating of 1/4 or lower at level 2, 1/2 or lower at level 4, and 1 or lower starting at level 8 (a Fly Speed is allowed only from level 8 on; a Swim Speed is never restricted). You retain your own mental ability scores, personality, and Druid features while using the Beast's physical statistics, and you gain Temporary Hit Points equal to your Druid level when you transform. Your Wild Shape lasts for a number of hours equal to half your Druid level (round down), until you have 0 Hit Points, or until you use a Bonus Action to leave it early; using Wild Shape again also ends it. You can use this feature 2 times (3 at level 6, 4 at level 17), and you regain one expended use when you finish a Short Rest and all expended uses when you finish a Long Rest.",
    resourceKey: "wildShape",
    resourceLabel: "Wild Shape",
    resourceRecharge: "longRest",
    resourceTotals: [
      { minLevel: 2, total: 2, shortRestRegain: 1 },
      { minLevel: 6, total: 3, shortRestRegain: 1 },
      { minLevel: 17, total: 4, shortRestRegain: 1 },
    ],
  },
  {
    name: "Primal Order",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You have dedicated yourself to one of the following two ways of being a Druid, granting you a benefit; choose Magician or Warden. Magician: you learn one extra cantrip from the Druid spell list, and you gain a bonus to your Intelligence (Arcana or Nature) checks equal to your Wisdom modifier (minimum bonus of +1). Warden: you gain proficiency with Martial weapons and training with Medium armor.",
  },
  {
    name: "Wild Companion",
    level: 2,
    edition: "EDITION_2024",
    description:
      "You can expend a spell slot or a use of your Wild Shape to cast the Find Familiar spell, without Material components; if you spend a spell slot, you cast it as a Magic action instead of its normal casting time. When you cast the spell in either way, the familiar is Fey instead of its usual type, and it disappears when you finish your next Long Rest.",
  },
  {
    name: "Wild Resurgence",
    level: 5,
    edition: "EDITION_2024",
    description:
      "Once on each of your turns when you have no expended uses of Wild Shape, you can expend a spell slot (no action required) to regain one expended use of it. In addition, once per Long Rest, you can expend one use of your Wild Shape (no action required) to regain a level 1 spell slot.",
  },
  {
    name: "Elemental Fury",
    level: 7,
    edition: "EDITION_2024",
    description:
      "You've learned to channel primal magic through your spells and your Wild Shape attacks; choose Potent Spellcasting or Primal Strike. Potent Spellcasting: you add your Wisdom modifier to the damage you deal with any Druid cantrip. Primal Strike: once on each of your turns when you hit a target with an attack using a weapon or a Wild Shape Beast form's attack, you can deal an extra 1d8 damage of the following type of your choice: Cold, Fire, Lightning, or Thunder.",
  },
  {
    name: "Improved Elemental Fury",
    level: 15,
    edition: "EDITION_2024",
    description:
      "Your Elemental Fury improves. Your Potent Spellcasting's cantrips with a range of 10 feet or greater have their range increased by 300 feet, and your Primal Strike's extra damage increases to 2d8.",
  },
  {
    name: "Timeless Body",
    level: 18,
    edition: "EDITION_2014",
    description:
      "The primal magic you wield causes you to age more slowly. For every 10 years that pass, your body ages only 1 year.",
  },
  {
    name: "Beast Spells",
    level: 18,
    edition: "EDITION_2014",
    description:
      "You can cast many druid spells in any shape you assume using Wild Shape. You can perform the somatic and verbal components of a druid spell while in beast form.",
  },
  {
    name: "Beast Spells",
    level: 18,
    edition: "EDITION_2024",
    description:
      "You can cast many Druid spells in Wild Shape form. You can perform a spell's somatic and verbal components while transformed, but you can't provide a Material component unless that component has no listed cost and isn't consumed by the spell.",
  },
  {
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    description: "You gain an Epic Boon feat of your choice (Boon of Fortitude recommended). You can take this feat only once.",
  },
  {
    name: "Archdruid",
    level: 20,
    edition: "EDITION_2014",
    description:
      "You can use your Wild Shape an unlimited number of times. Additionally, you can ignore the verbal and somatic components of your druid spells, as well as any material components lacking a cost.",
  },
  {
    name: "Archdruid",
    level: 20,
    edition: "EDITION_2024",
    description:
      "You gain the following three benefits. Evergreen Wild Shape: when you roll Initiative and have no uses of Wild Shape remaining, you regain one expended use. Nature Magician: as a Bonus Action, you can convert any number of your unexpended Wild Shape uses into one spell slot; the slot's level equals half the number of uses you convert, rounded down (minimum 1st level). You can do this once, and you regain the ability to do so when you finish a Long Rest. Longevity: the primal magic you wield causes you to age more slowly — for every 10 years that pass, your body ages only 1 year.",
  },
];

export const CIRCLE_OF_THE_LAND_ROWS: ClassFeatureRow[] = [
  {
    name: "Bonus Cantrip",
    level: 2,
    edition: "EDITION_2014",
    description: "You learn one additional druid cantrip of your choice.",
  },
  {
    name: "Natural Recovery",
    level: 2,
    edition: "EDITION_2014",
    description:
      "Once per long rest during a short rest, choose expended spell slots to recover. The total levels of slots recovered can be up to half your druid level (rounded up, max 5th level).",
  },
  {
    name: "Circle Spells",
    level: 3,
    edition: "EDITION_2014",
    description:
      "You gain access to additional spells based on your chosen terrain (arctic, coast, desert, forest, grassland, mountain, swamp, or Underdark). These spells are always prepared for you and don't count against your prepared spells.",
  },
  {
    name: "Circle of the Land Spells",
    level: 3,
    edition: "EDITION_2024",
    description:
      "You always have certain spells prepared, based on a land type you choose from the Circle of the Land Spells table each time you finish a Long Rest — arid, polar, temperate, or tropical. These spells don't count against the number of Druid spells you can prepare. Arid: Blur, Burning Hands, Fire Bolt, Fireball, Blight, Wall of Stone. Polar: Fog Cloud, Hold Person, Ray of Frost, Sleet Storm, Ice Storm, Cone of Cold. Temperate: Misty Step, Shocking Grasp, Sleep, Lightning Bolt, Freedom of Movement, Tree Stride. Tropical: Acid Splash, Ray of Sickness, Web, Stinking Cloud, Polymorph, Insect Plague.",
  },
  {
    name: "Land's Aid",
    level: 3,
    edition: "EDITION_2024",
    description:
      "As a Magic action, you expend a use of your Wild Shape to conjure spectral vines and vermin in a 10-foot-radius Sphere centered on a point you can see within 60 feet. Each creature of your choice in that area must make a Constitution saving throw against your spell save DC, taking 2d6 Necrotic damage on a failed save or half as much on a success. You can also choose one creature you can see in the area to regain 2d6 Hit Points. The damage and healing both increase to 3d6 when you reach level 10 and to 4d6 when you reach level 14.",
  },
  {
    name: "Land's Stride",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Moving through nonmagical difficult terrain costs no extra movement, and you can pass through nonmagical plants without being slowed. Advantage on saves against magically created or manipulated plants.",
  },
  {
    name: "Natural Recovery",
    level: 6,
    edition: "EDITION_2024",
    description:
      "When you finish a Short Rest, you can choose expended spell slots to recover; the combined level of the slots can't exceed half your Druid level (round up), and none of them can be level 6 or higher. You can use this feature only once, and you regain the ability to do so when you finish a Long Rest. In addition, when you finish a Long Rest, you can cast one of your prepared Circle of the Land spells of level 1 or higher without expending a spell slot, provided the spell doesn't require a Material component with a cost.",
  },
  {
    name: "Nature's Ward",
    level: 10,
    edition: "EDITION_2014",
    description: "Immune to poison and disease. Elementals and fey can't charm or frighten you.",
  },
  {
    name: "Nature's Ward",
    level: 10,
    edition: "EDITION_2024",
    description:
      "You are immune to the Poisoned condition, and you have Resistance to a damage type based on your Druid Circle land: Fire if your land is arid, Cold if it's polar, Lightning if it's temperate, or Poison if it's tropical.",
  },
  {
    name: "Nature's Sanctuary",
    level: 14,
    edition: "EDITION_2014",
    description:
      "When a beast or plant attacks you, it must make a Wisdom saving throw (DC 8 + proficiency + Wisdom modifier) or choose a different target. On a success, it is immune to this feature for 24 hours.",
  },
  {
    name: "Nature's Sanctuary",
    level: 14,
    edition: "EDITION_2024",
    description:
      "As a Magic action, you conjure a protective terrain in a 15-foot Cube on ground you can see within 120 feet, lasting for 1 minute or until you die or have the Incapacitated condition. While within the Cube, you and your allies have Half Cover and the Resistance granted by your Nature's Ward feature, even if you don't currently have one active. As a Bonus Action, you can move the Cube up to 60 feet to a new spot on the ground you can see.",
  },
];

export const CIRCLE_OF_THE_MOON_ROWS: ClassFeatureRow[] = [
  {
    name: "Combat Wild Shape",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You can use Wild Shape as a bonus action. While transformed, you can expend a spell slot as a bonus action to regain 1d8 HP per level of the slot expended.",
  },
  {
    name: "Circle Forms",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You can use Wild Shape to transform into beasts with a challenge rating as high as 1 (instead of the base druid table). Starting at level 6, the max CR equals your druid level divided by 3 (rounded down, minimum 1).",
  },
  {
    name: "Circle Forms",
    level: 3,
    edition: "EDITION_2024",
    description:
      "Beginning at level 3, you can transform into a Beast with a challenge rating as high as your Druid level divided by 3, rounded down (minimum challenge rating 1). While transformed, if your Armor Class would be lower than 13 plus your Wisdom modifier, you use 13 plus your Wisdom modifier instead. When you transform, you gain Temporary Hit Points equal to three times your Druid level, in place of the Temporary Hit Points your Wild Shape feature would otherwise grant.",
  },
  {
    name: "Circle of the Moon Spells",
    level: 3,
    edition: "EDITION_2024",
    description:
      "You always have certain spells prepared, and you can cast them while transformed by Wild Shape: Cure Wounds, Moonbeam, and Starry Wisp starting at level 3; Conjure Animals at level 5; Fount of Moonlight at level 7; and Mass Cure Wounds at level 9. These spells don't count against the number of Druid spells you can prepare.",
  },
  {
    name: "Primal Strike",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Your attacks while in beast form count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks.",
  },
  {
    name: "Improved Circle Forms",
    level: 6,
    edition: "EDITION_2024",
    description:
      "Your Circle Forms improve, granting you two benefits. Lunar Radiance: immediately after you hit a target with an attack while transformed by Wild Shape, you can change the attack's damage type to Radiant. Increased Toughness: you add your Wisdom modifier to any Constitution saving throws you make to maintain Concentration.",
  },
  {
    name: "Elemental Wild Shape",
    level: 10,
    edition: "EDITION_2014",
    description: "Expend two uses of Wild Shape to transform into an air, earth, fire, or water elemental.",
  },
  {
    name: "Moonlight Step",
    level: 10,
    edition: "EDITION_2024",
    description:
      "As a Bonus Action, you teleport up to 30 feet to an unoccupied space you can see, and you have Advantage on the next attack roll you make before the end of this turn. You can use this feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest. You can also regain one expended use by expending a spell slot of level 2 or higher (no action required).",
    resourceKey: "moonlightStep",
    resourceLabel: "Moonlight Step",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 10, total: { abilityMod: "wisdom", min: 1 } }],
  },
  {
    name: "Thousand Forms",
    level: 14,
    edition: "EDITION_2014",
    description: "You can cast the Alter Self spell at will without expending a spell slot.",
  },
  {
    name: "Lunar Form",
    level: 14,
    edition: "EDITION_2024",
    description:
      "Your connection to the moon grants you two benefits. Improved Lunar Radiance: once on each of your turns when you deal damage with an attack while transformed by Wild Shape, you can also deal an extra 2d10 Radiant damage. Shared Moonlight: when you use your Moonlight Step feature, you can bring along one willing creature within 10 feet of you, teleporting it to a space within 5 feet of your destination.",
  },
];

// Per-class/per-subclass literal-row overrides (#1233): replaces the former
// isFighter/isBarbarian/isBattleMaster boolean chain with two lookup maps, one
// keyed by class name and one by subclass name — a fourth `isWarlock` boolean
// (plus a fifth/sixth/seventh for each patron) would have made
// testFeatureRowsFor's own branching harder to read with every future
// LITERAL_ROW_CLASSES addition than a table lookup is. Both maps are keyed
// lowercase, matching this file's own registry convention.
//
// Exported for literal-fixture-parity.test.ts (#1593), which asserts these two
// maps agree with the seed files they mirror — until it existed, nothing did,
// and #1232's corrected Draconic descriptions shipped here stale through a
// fully green suite. That guard lives prisma-side because only that direction
// can import both halves (`rootDir: "src"`, TS6059).
// DELIBERATELY absent from LITERAL_SUBCLASS_ROWS below: none declares a
// resourceKey/derivedStat, and unlike Cleric's two domains (the
// counterexample this file's own header names), no surviving test observes a
// null-vs-object distinction against a Paladin oath's subclassRows — Paladin's
// base layer alone (divineSense/layOnHands/channelDivinity, always active from
// L1/L1/L3) already guarantees deriveResources returns a non-null object
// regardless of whether the active oath contributes any rows of its own, so
// srd.test.ts's Channel-Divinity-pool-merge suite and the entry-scoped
// resources/actions suites all pass with an empty subclassRows fallback
// (`toRows(subDef?.features ?? [])` -> `[]`, since paladin.ts's three
// SubclassDefinition entries carry no `features` array) — checked directly,
// not assumed.
export const PALADIN_BASE_ROWS: ClassFeatureRow[] = [
  {
    name: "Divine Sense",
    level: 1,
    edition: "EDITION_2014",
    description:
      "As an action, sense the presence of celestials, fiends, and undead within 60 ft until the end of your next turn (they aren't hidden from this sense). You can also detect consecrated or desecrated places/objects. Uses = 1 + Charisma modifier per long rest.",
  },
  {
    name: "Lay on Hands",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Touch to restore HP from a pool of 5 × your paladin level. Alternatively, spend 5 HP from the pool to cure one disease or neutralize one poison. The pool replenishes on a long rest.",
  },
  {
    name: "Lay on Hands",
    level: 1,
    edition: "EDITION_2024",
    description:
      "As a Bonus Action, touch a creature and restore a number of Hit Points from a pool equal to five times your Paladin level. Alternatively, expend 5 Hit Points from the pool to remove the Poisoned condition from the creature instead of healing it. The pool refills when you finish a Long Rest.",
  },
  {
    name: "Fighting Style",
    level: 2,
    edition: "EDITION_2014",
    description:
      "Choose a fighting style specialty: Defense (+1 AC in armor), Dueling (+2 melee damage with one weapon), Great Weapon Fighting (reroll 1s and 2s on damage), or Protection (impose disadvantage on attacks against adjacent allies).",
  },
  {
    name: "Fighting Style",
    level: 2,
    edition: "EDITION_2024",
    description:
      "You gain a Fighting Style feat of your choice. Blessed Warrior is available only to you: learn two Cleric cantrips of your choice, treated as Paladin spells for you, using Charisma as your spellcasting ability for them; you can replace one of them whenever you gain a Paladin level.",
  },
  {
    name: "Spellcasting",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You cast spells using Charisma starting at level 2. Half-caster progression (you gain spell slots more slowly than full casters). You prepare a number of paladin spells equal to your Charisma modifier + half your paladin level (rounded down).",
  },
  {
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You cast spells using Charisma as your spellcasting ability. You are a Half-Caster: consult the Paladin Features table for your spell slots, which you gain starting at 1st level. You prepare a growing list of Paladin spells (2 at level 1, rising to 15 by level 20, per the Paladin Features table), regain all expended spell slots on a Long Rest, and can change your prepared list whenever you finish one. A Holy Symbol serves as your Spellcasting Focus.",
  },
  {
    name: "Divine Smite",
    level: 2,
    edition: "EDITION_2014",
    description:
      "When you hit with a melee weapon attack, expend one spell slot to deal +2d8 radiant damage (+1d8 per slot level above 1st, max +5d8). Undead and fiends take an additional 1d8 radiant damage.",
  },
  {
    name: "Paladin's Smite",
    level: 2,
    edition: "EDITION_2024",
    description:
      "You always have the Divine Smite spell prepared. In addition, you can cast it without expending a spell slot, but you must finish a Long Rest before you can cast it in this way again.",
  },
  {
    name: "Divine Health",
    level: 3,
    edition: "EDITION_2014",
    description: "The divine magic flowing through you makes you immune to disease.",
  },
  {
    name: "Channel Divinity",
    level: 3,
    edition: "EDITION_2014",
    description:
      "You can channel divine energy through your sacred oath to fuel magical effects. You have 1 use, regained on a short or long rest. The specific options depend on your oath (see subclass features).",
    resourceKey: "channelDivinity",
    resourceLabel: "Channel Divinity",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 3, total: 1 }],
  },
  {
    name: "Channel Divinity",
    level: 3,
    edition: "EDITION_2024",
    description:
      "You can channel divine energy to fuel magical effects. You start with one option, Divine Sense, and your Oath grants you more. When you use your Channel Divinity, choose one of its options; unless it says otherwise, no action is required. You can use your Channel Divinity twice between rests, and you gain a third use at Paladin level 11. You regain one of its expended uses when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest. Any saving throw associated with a Channel Divinity option uses your spell save DC.",
    resourceKey: "channelDivinity",
    resourceLabel: "Channel Divinity",
    resourceRecharge: "longRest",
    resourceTotals: [
      { minLevel: 3, total: 2, shortRestRegain: 1 },
      { minLevel: 11, total: 3, shortRestRegain: 1 },
    ],
  },
  {
    name: "Channel Divinity: Divine Sense",
    level: 3,
    edition: "EDITION_2024",
    description:
      "As a Bonus Action, expend a use of your Channel Divinity to open your awareness to the presence of celestials, fiends, and undead within 60 feet of yourself that aren't behind total cover. For 10 minutes or until you have the Incapacitated condition, you know the location of any creature of those types in that radius and, for any creature you can see, whether it is one of those creature types. You also learn the creature type of any place or object in the area consecrated or desecrated as with the Hallow spell.",
  },
  {
    name: "Extra Attack",
    level: 5,
    edition: "EDITION_2014",
    description: "You can attack twice whenever you take the Attack action on your turn.",
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    name: "Extra Attack",
    level: 5,
    edition: "EDITION_2024",
    description: "You can attack twice whenever you take the Attack action on your turn.",
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    name: "Faithful Steed",
    level: 5,
    edition: "EDITION_2024",
    description:
      "You always have the Find Steed spell prepared, and you can cast it once without a spell slot, doing so again only after you finish a Long Rest.",
  },
  {
    name: "Aura of Protection",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Friendly creatures within 10 ft add your Charisma modifier (minimum +1) to saving throws while you are conscious. Aura extends to 30 ft at level 18.",
  },
  {
    name: "Aura of Protection",
    level: 6,
    edition: "EDITION_2024",
    description:
      "You and friendly creatures within your 10-foot Emanation add your Charisma modifier (minimum +1) to saving throws, an effect that is inactive while you have the Incapacitated condition. If another Paladin is within the Emanation, a creature can benefit from only one Aura of Protection at a time; that creature chooses which aura applies.",
  },
  {
    name: "Abjure Foes",
    level: 9,
    edition: "EDITION_2024",
    description:
      "As a Magic action, expend a use of your Channel Divinity to overwhelm creatures with divine awe. Choose a number of creatures you can see within 60 feet of yourself, up to your Charisma modifier (minimum of one creature). Each target must succeed on a Wisdom saving throw or have the Frightened condition for 1 minute or until it takes any damage. While Frightened, a target can do only one of the following on its turn: move, take an action, or take a bonus action.",
  },
  {
    name: "Aura of Courage",
    level: 10,
    edition: "EDITION_2014",
    description: "Friendly creatures within 10 ft can't be frightened while you are conscious. Aura extends to 30 ft at level 18.",
  },
  {
    name: "Aura of Courage",
    level: 10,
    edition: "EDITION_2024",
    description: "You and friendly creatures within your Aura of Protection have Immunity to the Frightened condition while you don't have the Incapacitated condition.",
  },
  {
    name: "Improved Divine Smite",
    level: 11,
    edition: "EDITION_2014",
    description:
      "Whenever you hit with a melee weapon, you deal an extra 1d8 radiant damage in addition to any other Divine Smite dice.",
  },
  {
    name: "Radiant Strikes",
    level: 11,
    edition: "EDITION_2024",
    description:
      "Your strikes now carry supernatural power. When you hit a creature with an attack using a Melee weapon or an Unarmed Strike, the target takes an extra 1d8 Radiant damage.",
  },
  {
    name: "Cleansing Touch",
    level: 14,
    edition: "EDITION_2014",
    description:
      "As an action, end one spell on yourself or one willing creature within reach. Uses = Charisma modifier per long rest (minimum 1).",
  },
  {
    name: "Restoring Touch",
    level: 14,
    edition: "EDITION_2024",
    description:
      "You can use your Lay on Hands to remove the Blinded, Charmed, Deafened, Frightened, Paralyzed, or Stunned condition from a creature: for each condition removed, use 5 Hit Points from your Lay on Hands pool, in addition to any Hit Points used to restore Hit Points.",
  },
  {
    name: "Aura Expansion",
    level: 18,
    edition: "EDITION_2024",
    description: "Your Aura of Protection is now a 30-foot Emanation.",
  },
  {
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    description: "You gain an Epic Boon feat of your choice (Boon of Fate recommended). You can take this feat only once.",
  },
];

// MONK's base-class rows (#1675 transport, #1500 base-class rewrite):
// `lib/classes/monk.ts`'s base-class `.features` moved to literal seed data
// (prisma/seed/monk-features.ts) — the same rootDir boundary
// FIGHTER_BASE_ROWS'/RANGER_BASE_ROWS' comments explain (monk.ts itself
// still exists — see its own header for why it isn't deletable — but its
// base `.features` are gone). #1500 forked the base class from real SRD 5.1
// text — mirrors monk-features.ts's own MONK_BASE_RAW row-for-row
// (literal-fixture-parity.test.ts enforces byte parity), so this fixture is
// no longer a uniform flatMap over both editions: five 2024-only rows
// (Uncanny Metabolism/Heightened Focus/Self-Restoration/Perfect
// Focus/Superior Defense) and six 2014-only rows (Stillness of
// Mind/Purity of Body/Tongue of the Sun and Moon/Diamond Soul/Timeless
// Body/Empty Body/Perfect Self) exist for one edition only. Extra Attack's
// derivedStat/derivedStatTiers ride this array (unlike `toRows`, which
// drops those two fields), mirroring FIGHTER_BASE_ROWS'/RANGER_BASE_ROWS'
// own reasoning.
const MONK_BASE_ROWS_SHARED: ClassFeatureRow[] = (["EDITION_2014", "EDITION_2024"] as const).flatMap((edition) => [
  {
    name: "Unarmored Defense",
    level: 1,
    edition,
    description:
      "While not wearing armor or wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.",
  },
  {
    name: "Unarmored Movement",
    level: 2,
    edition,
    description:
      "Your speed increases by 10 ft while unarmored and unshielded (+15 at L6; +20 at L10; +25 at L14; +30 at L18). At level 9, you can run up vertical surfaces and across liquids on your turn.",
  },
  {
    name: "Slow Fall",
    level: 4,
    edition,
    description: "Use your reaction to reduce falling damage by 5 × your monk level.",
  },
  {
    name: "Extra Attack",
    level: 5,
    edition,
    description: "You can attack twice whenever you take the Attack action on your turn.",
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    name: "Evasion",
    level: 7,
    edition,
    description:
      "When subjected to an effect that allows a Dexterity save for half damage, you take no damage on a success and half damage on a failure.",
  },
]);

const MONK_BASE_ROWS_2014: ClassFeatureRow[] = [
  {
    name: "Martial Arts",
    level: 1,
    edition: "EDITION_2014",
    description:
      "With unarmed strikes or monk weapons (shortsword and any simple melee weapon without the two-handed or heavy property): use Dexterity instead of Strength for attack and damage rolls; deal 1d4 (L1–4), 1d6 (L5–10), 1d8 (L11–16), or 1d10 (L17+) damage; immediately after you take the Attack action on your turn, make one unarmed strike as a bonus action.",
  },
  {
    name: "Ki",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You have a pool of Ki Points equal to your monk level. Spend them to fuel: Flurry of Blows (1 ki — immediately after taking the Attack action, make two unarmed strikes as a bonus action), Patient Defense (1 ki — take the Dodge action as a bonus action), Step of the Wind (1 ki — take the Disengage or Dash action as a bonus action, jump distance doubled for the turn). Ki save DC = 8 + proficiency + Wisdom modifier. Regain all ki on a short or long rest.",
  },
  {
    name: "Deflect Missiles",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Use your reaction to reduce damage from a ranged weapon attack that hits you by 1d10 + Dexterity modifier + monk level. If this reduces the damage to 0 and the missile is small enough to hold in one hand with a hand free, you catch it. You can then spend 1 ki to make a ranged attack with it as part of the same reaction — range 20/60 ft, always made with proficiency — dealing 1d6 + Dexterity modifier bludgeoning damage to one creature within range on a hit.",
  },
  {
    name: "Stunning Strike",
    level: 5,
    edition: "EDITION_2014",
    description:
      "When you hit another creature with a melee weapon attack, you can spend 1 ki point to attempt a stunning strike. The target must succeed on a Constitution save (ki save DC) or be stunned until the end of your next turn. Unlike Flurry of Blows, this can be attempted more than once per turn as long as you have ki points to spend.",
  },
  {
    name: "Ki-Empowered Strikes",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Your unarmed strikes count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks and damage.",
  },
  {
    name: "Stillness of Mind",
    level: 7,
    edition: "EDITION_2014",
    description: "Use your action to end one effect on yourself that is causing you to be charmed or frightened.",
  },
  {
    name: "Purity of Body",
    level: 10,
    edition: "EDITION_2014",
    description: "You are immune to disease and poison.",
  },
  {
    name: "Tongue of the Sun and Moon",
    level: 13,
    edition: "EDITION_2014",
    description:
      "You understand all spoken languages, and any creature that can understand a language understands what you say.",
  },
  {
    name: "Diamond Soul",
    level: 14,
    edition: "EDITION_2014",
    description:
      "You gain proficiency in all saving throws. Additionally, whenever you fail a saving throw, you can spend 1 ki point to reroll it and take the second result.",
  },
  {
    name: "Timeless Body",
    level: 15,
    edition: "EDITION_2014",
    description:
      "Your ki sustains you so that you suffer none of the frailty of old age, and you can't be aged magically (though you can still die of old age). You no longer need food or water.",
  },
  {
    name: "Empty Body",
    level: 18,
    edition: "EDITION_2014",
    description:
      "Use your action to spend 4 ki points to become invisible for 1 minute; during that time you also have resistance to all damage but force damage. Additionally, you can spend 8 ki points to cast astral projection without expending a material component; when you do, you can't take any other creatures with you.",
  },
  {
    name: "Perfect Self",
    level: 20,
    edition: "EDITION_2014",
    description: "When you roll initiative and have no ki points remaining, you regain 4 ki points.",
  },
];

const MONK_BASE_ROWS_2024: ClassFeatureRow[] = [
  {
    name: "Martial Arts",
    level: 1,
    edition: "EDITION_2024",
    description:
      "With unarmed strikes or monk weapons: use Dexterity instead of Strength for attack and damage rolls; deal 1d6 (L1–4), 1d8 (L5–10), 1d10 (L11–16), or 1d12 (L17+) damage; make one bonus unarmed strike after the Attack action.",
  },
  {
    name: "Focus",
    level: 2,
    edition: "EDITION_2024",
    description:
      "You have a pool of Focus Points equal to your monk level. Spend them to fuel: Flurry of Blows (1 focus — two bonus unarmed strikes), Patient Defense (free for Disengage as a bonus action, or 1 focus for Disengage + Dodge), Step of the Wind (free for Dash as a bonus action, or 1 focus for Disengage + Dash with jump distance doubled). Focus save DC = 8 + proficiency + Wisdom modifier. Regain all focus on a short or long rest.",
  },
  {
    name: "Uncanny Metabolism",
    level: 2,
    edition: "EDITION_2024",
    description:
      "When you roll initiative, you can regain all expended Focus Points; when you do, roll your Martial Arts die and regain hit points equal to your monk level plus the number rolled. Usable once per long rest.",
  },
  {
    name: "Deflect Attacks",
    level: 3,
    edition: "EDITION_2024",
    description:
      "Use your reaction to reduce bludgeoning, piercing, or slashing damage from a melee or ranged attack that hits you by 1d10 + Dexterity modifier + monk level. If this reduces the damage to 0, spend 1 focus to redirect it: the attacker (melee, within 5 ft) or another creature (ranged, within 60 ft) must succeed on a Dexterity save or take damage equal to two rolls of your Martial Arts die + your Dexterity modifier.",
  },
  {
    name: "Stunning Strike",
    level: 5,
    edition: "EDITION_2024",
    description:
      "Once per turn when you hit with a monk weapon or unarmed strike, spend 1 focus to attempt a stunning strike. The target makes a Constitution save (focus save DC): on a failure it is stunned until the end of your next turn; on a success its speed is halved until the start of your next turn.",
  },
  {
    name: "Empowered Strikes",
    level: 6,
    edition: "EDITION_2024",
    description:
      "Your unarmed strikes count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks, and can deal force damage instead of their normal damage type.",
  },
  {
    name: "Heightened Focus",
    level: 10,
    edition: "EDITION_2024",
    description:
      "Your focus features grow more potent: Flurry of Blows lets you make three unarmed strikes instead of two (still 1 focus); Patient Defense grants temporary hit points equal to two rolls of your Martial Arts die when you spend focus; Step of the Wind lets you bring one willing Large or smaller creature within 5 ft along with you when you spend focus.",
  },
  {
    name: "Self-Restoration",
    level: 10,
    edition: "EDITION_2024",
    description:
      "At the end of each of your turns, you can end one Charmed, Frightened, or Poisoned effect on yourself for free. You also no longer suffer exhaustion from lack of food or water.",
  },
  {
    name: "Deflect Energy",
    level: 13,
    edition: "EDITION_2024",
    description:
      "Your Deflect Attacks feature now works against an attack of any damage type, not just bludgeoning, piercing, or slashing.",
  },
  {
    name: "Disciplined Survivor",
    level: 14,
    edition: "EDITION_2024",
    description:
      "You gain proficiency in all saving throws. Additionally, whenever you fail a saving throw, you can spend 1 focus to reroll it and take the second result.",
  },
  {
    name: "Perfect Focus",
    level: 15,
    edition: "EDITION_2024",
    description:
      "When you roll initiative, if you have 3 or fewer focus points, you regain focus points until you have 4.",
  },
  {
    name: "Superior Defense",
    level: 18,
    edition: "EDITION_2024",
    description:
      "At the start of your turn, spend 3 focus to bolster yourself for 1 minute or until you're incapacitated: during that time you have resistance to all damage except force damage.",
  },
  {
    name: "Body and Mind",
    level: 20,
    edition: "EDITION_2024",
    description: "Your Dexterity and Wisdom scores each increase by 4, to a maximum of 25.",
  },
];

export const MONK_BASE_ROWS: ClassFeatureRow[] = [
  ...MONK_BASE_ROWS_SHARED,
  ...MONK_BASE_ROWS_2014,
  ...MONK_BASE_ROWS_2024,
];

// MONK's four 2024 subclasses (#1675) — each mirrors its own
// monk-features.ts partition, byte-identical across both editions same as
// MONK_BASE_ROWS above. Warrior of the Elements' Elemental Attunement row
// carries the toggle descriptor block (#1686) — the one Monk row any
// resourceKey-observing test could care about, mirrored here for the same
// reason FIGHTER_BASE_ROWS hand-builds its populated rows rather than
// calling `toRows`.
export const WARRIOR_OF_THE_OPEN_HAND_ROWS: ClassFeatureRow[] = (["EDITION_2014", "EDITION_2024"] as const).flatMap((edition) => [
  {
    name: "Open Hand Technique",
    level: 3,
    edition,
    description:
      "When you hit a creature with an attack granted by your Flurry of Blows, you can impose one effect: Addle — the creature can't take reactions until the start of its next turn (no save); Push — the creature makes a Strength save or is pushed up to 15 ft away; or Topple — the creature makes a Dexterity save or is knocked prone.",
  },
  {
    name: "Wholeness of Body",
    level: 6,
    edition,
    description:
      "As a bonus action, roll your Martial Arts die and regain that many hit points plus your Wisdom modifier (minimum 1). Usable a number of times equal to your Wisdom modifier (minimum once); regain all expended uses on a long rest.",
  },
  {
    name: "Fleet Step",
    level: 11,
    edition,
    description:
      "When you take a bonus action other than Step of the Wind, you can also take the Step of the Wind bonus action immediately afterward.",
  },
  {
    name: "Quivering Palm",
    level: 17,
    edition,
    description:
      "When you hit with an unarmed strike, spend 4 focus to set imperceptible vibrations in the creature that last for a number of days equal to your monk level. They are harmless unless you use your action to end them — the creature then makes a Constitution save, taking 10d12 force damage on a failure or half as much on a success. You can maintain vibrations in only one creature at a time and can end them harmlessly at any time without using an action.",
  },
]);

export const WARRIOR_OF_SHADOW_ROWS: ClassFeatureRow[] = (["EDITION_2014", "EDITION_2024"] as const).flatMap((edition) => [
  {
    name: "Shadow Arts",
    level: 3,
    edition,
    description:
      "You know the Minor Illusion cantrip (Wisdom). Spend 1 focus to cast Darkness without material components; you can see through the darkness you create, and while it persists you can move it up to 30 ft as a bonus action. You also have Darkvision out to 60 ft, or your Darkvision's range increases by 60 ft if you already have it.",
  },
  {
    name: "Shadow Step",
    level: 6,
    edition,
    description:
      "While in dim light or darkness, teleport as a bonus action to an unoccupied space you can see that is also in dim light or darkness (up to 60 ft), then make one unarmed strike as part of the same bonus action. You have advantage on the first melee attack you make before the end of the turn.",
  },
  {
    name: "Improved Shadow Step",
    level: 11,
    edition,
    description:
      "When you Shadow Step, you can spend 1 focus to ignore the requirement that your destination be in dim light or darkness.",
  },
  {
    name: "Cloak of Shadows",
    level: 17,
    edition,
    description:
      "Spend 3 focus and use your action to become invisible and able to move through other creatures and objects as if they were difficult terrain, for 1 minute or until you're incapacitated. The invisibility ends early if you attack or cast a spell. While it lasts, Flurry of Blows costs no focus.",
  },
]);

export const WARRIOR_OF_MERCY_ROWS: ClassFeatureRow[] = (["EDITION_2014", "EDITION_2024"] as const).flatMap((edition) => [
  {
    name: "Implements of Mercy",
    level: 3,
    edition,
    description: "You gain proficiency in the Insight and Medicine skills and with the Herbalism Kit.",
  },
  {
    name: "Hand of Harm",
    level: 3,
    edition,
    description:
      "Once per turn when you hit a creature with an unarmed strike and deal damage, you can expend 1 focus to deal extra necrotic damage equal to one Martial Arts die plus your Wisdom modifier.",
  },
  {
    name: "Hand of Healing",
    level: 3,
    edition,
    description:
      "As a Magic action, expend 1 focus to touch a creature and restore hit points equal to one Martial Arts die plus your Wisdom modifier. When you use Flurry of Blows, you can replace one of its unarmed strikes with this effect without spending the extra focus for the heal — Flurry's own focus cost still applies.",
  },
  {
    name: "Physician's Touch",
    level: 6,
    edition,
    description:
      "Hand of Harm also inflicts the Poisoned condition on the target until the end of your next turn. Hand of Healing also ends one of the following conditions on the target: Blinded, Deafened, Paralyzed, Poisoned, or Stunned.",
  },
  {
    name: "Flurry of Healing and Harm",
    level: 11,
    edition,
    description:
      "When you use Flurry of Blows, you can replace each of its unarmed strikes with Hand of Healing, and you can apply Hand of Harm to one of its strikes without spending focus (Hand of Harm's once-per-turn limit still applies). Usable a number of times equal to your Wisdom modifier (minimum once) per long rest.",
  },
  {
    name: "Hand of Ultimate Mercy",
    level: 17,
    edition,
    description:
      "As a Magic action, expend 5 focus to touch a creature that died no more than 24 hours ago and return it to life with 4d10 plus your Wisdom modifier hit points, ending the Blinded, Deafened, Paralyzed, Poisoned, and Stunned conditions on it. Usable once per long rest.",
  },
]);

export const WARRIOR_OF_THE_ELEMENTS_ROWS: ClassFeatureRow[] = (["EDITION_2014", "EDITION_2024"] as const).flatMap((edition) => [
  {
    name: "Manipulate Elements",
    level: 3,
    edition,
    description: "You know the Elementalism cantrip. Wisdom is your spellcasting ability for it.",
  },
  {
    name: "Elemental Attunement",
    level: 3,
    edition,
    description:
      "At the start of your turn, you can expend 1 Focus Point (no action) to imbue yourself with elemental energy for 10 minutes (or until you're Incapacitated). While attuned: your Unarmed Strike reach increases by 10 ft; and once per Unarmed Strike hit you can deal Acid, Cold, Fire, Lightning, or Thunder damage instead of the normal type — when you do, you can force the target to make a Strength saving throw (your focus save DC), moving it up to 10 ft in a direction of your choice on a failure.",
    resourceKey: "elementalAttunement",
    activationCost: "free",
    resolverKind: "toggle",
    costKind: "pool",
    costPoolKey: "focus",
    costBase: 1,
    effectBuffs: [
      {
        key: "elementalAttunement",
        target: "elementalAttunement",
        modifier: 0,
        duration: "while-active",
      },
    ],
  },
  {
    name: "Elemental Burst",
    level: 6,
    edition,
    description:
      "As a Magic action, you can expend 2 Focus Points to create a 20-foot-radius sphere of elemental energy centered on a point within 120 ft. Choose Acid, Cold, Fire, Lightning, or Thunder. Each creature in the sphere makes a Dexterity saving throw (your focus save DC), taking damage equal to three rolls of your Martial Arts die of the chosen type on a failure, or half as much on a success.",
  },
  {
    name: "Stride of the Elements",
    level: 11,
    edition,
    description: "While your Elemental Attunement is active, you have a Fly Speed and a Swim Speed each equal to your Speed.",
  },
  {
    name: "Elemental Epitome",
    level: 17,
    edition,
    description:
      "While your Elemental Attunement is active you gain: Resistance to Acid, Cold, Fire, Lightning, or Thunder damage (choose one at the start of each of your turns); Destructive Stride (when you use Step of the Wind, your Speed increases by 20 ft that turn, and the first creature you move within 5 ft of takes one roll of your Martial Arts die of your chosen resistance type); and Empowered Strikes (once per turn, one Unarmed Strike deals an extra Martial Arts die of your chosen resistance type on a hit).",
  },
]);

export const LITERAL_CLASS_ROWS: Record<string, ClassFeatureRow[]> = {
  fighter: FIGHTER_BASE_ROWS,
  barbarian: BARBARIAN_BASE_ROWS,
  ranger: RANGER_BASE_ROWS,
  warlock: WARLOCK_BASE_ROWS,
  wizard: WIZARD_BASE_ROWS,
  sorcerer: SORCERER_BASE_ROWS,
  cleric: CLERIC_BASE_ROWS,
  druid: DRUID_BASE_ROWS,
  paladin: PALADIN_BASE_ROWS,
  monk: MONK_BASE_ROWS,
};

export const LITERAL_SUBCLASS_ROWS: Record<string, ClassFeatureRow[]> = {
  "battle master": BATTLE_MASTER_ROWS,
  "circle of the land": CIRCLE_OF_THE_LAND_ROWS,
  "circle of the moon": CIRCLE_OF_THE_MOON_ROWS,
  "warrior of the open hand": WARRIOR_OF_THE_OPEN_HAND_ROWS,
  "warrior of shadow": WARRIOR_OF_SHADOW_ROWS,
  "warrior of mercy": WARRIOR_OF_MERCY_ROWS,
  "warrior of the elements": WARRIOR_OF_THE_ELEMENTS_ROWS,
  "school of evocation": WIZARD_EVOCATION_ROWS,
  "school of abjuration": WIZARD_ABJURATION_ROWS,
  "school of illusion": WIZARD_ILLUSION_ROWS,
  "the fiend": THE_FIEND_ROWS,
  "the archfey": THE_ARCHFEY_ROWS,
  "the great old one": THE_GREAT_OLD_ONE_ROWS,
  "draconic bloodline": DRACONIC_BLOODLINE_ROWS,
  "wild magic": WILD_MAGIC_ROWS,
  "life domain": CLERIC_LIFE_DOMAIN_ROWS,
  "trickery domain": CLERIC_TRICKERY_DOMAIN_ROWS,
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
