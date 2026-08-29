// DATA MODULE ONLY (#1277 AC 4): no direct database calls in this file.
//
// EDITION RULE: `edition` omitted on a row -> expand() seeds identical text
// for both editions. `edition` set -> exactly the one row named. A "removed
// in 2024" feature means not authoring a 2024 row, never deleting the 2014
// row. A level-shift is two rows with two `level` values, never one row
// edited in place.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { ResourceTotalAbility } from "../../src/lib/classes/class-feature-rows.js";
import type { SeedEdition } from "./edition.js";
import type {
  ActionCostSeed,
  ClassFeatureSeedRow,
  CostKindSeed,
  DerivedStatSeed,
  EffectKindSeed,
  EffectModifierSourceSeed,
  ResolverKindSeed,
  ResourceRechargeSeed,
} from "./class-features.js";

function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`fighter-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawFighterFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions. */
  edition?: SeedEdition;
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: ResourceRechargeSeed;
  resourceTotals?: { minLevel: number; total: number; shortRestRegain?: number }[];
  resourceDieTiers?: { minLevel: number; die: string }[];
  activationCost?: ActionCostSeed;
  resolverKind?: ResolverKindSeed;
  costKind?: CostKindSeed;
  costPoolKey?: string;
  costBase?: number;
  effectKind?: EffectKindSeed;
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifierSource?: EffectModifierSourceSeed;
  derivedStat?: DerivedStatSeed;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  // announcedSaveDC = 8 + PB + max of these abilities — a separate axis from
  // `derivedStat` on the same row (saveDcAbilitiesFromRows, class-feature-rows.ts).
  saveDcAbilities?: ResourceTotalAbility[];
}

function expand(raw: RawFighterFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Fighter",
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    resourceKey: raw.resourceKey,
    resourceLabel: raw.resourceLabel,
    resourceRecharge: raw.resourceRecharge,
    resourceTotals: raw.resourceTotals,
    resourceDieTiers: raw.resourceDieTiers,
    activationCost: raw.activationCost,
    resolverKind: raw.resolverKind,
    costKind: raw.costKind,
    costPoolKey: raw.costPoolKey,
    costBase: raw.costBase,
    effectKind: raw.effectKind,
    effectDiceCount: raw.effectDiceCount,
    effectDiceFaces: raw.effectDiceFaces,
    effectModifierSource: raw.effectModifierSource,
    derivedStat: raw.derivedStat,
    derivedStatTiers: raw.derivedStatTiers,
    saveDcAbilities: raw.saveDcAbilities,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// Base class — SRD 5.1 p. 23-24 (2014) / SRD 5.2 p. 47-48 (2024)
const FIGHTER_BASE_RAW: RawFighterFeature[] = [
  {
    subclassSlug: null,
    name: "Fighting Style",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Choose a fighting style specialty: Archery (+2 ranged attack rolls), Defense (+1 AC in armor), Dueling (+2 melee damage when only wielding one weapon), Great Weapon Fighting (reroll 1s and 2s on damage with two-handed weapons), Protection (impose disadvantage on attacks against adjacent allies), or Two-Weapon Fighting (add ability modifier to off-hand damage).",
  },
  {
    subclassSlug: null,
    name: "Fighting Style",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2 p. 47: a Fighting Style feat, retrainable each Fighter level.
    // Only the four feats SRD 5.2 itself has — do not widen this text with
    // unverified PHB'24 options.
    description:
      "You gain a Fighting Style feat of your choice: Archery, Defense, Great Weapon Fighting, or Two-Weapon Fighting. Whenever you gain a Fighter level, you can replace the feat you chose with a different Fighting Style feat.",
  },
  {
    subclassSlug: null,
    name: "Second Wind",
    level: 1,
    edition: "EDITION_2014",
    description: "As a bonus action, regain 1d10 + your fighter level HP. Regain use on a short or long rest.",
    // SRD 5.1 p. 23: fully resets on either rest (no partial shape).
    resourceKey: "secondWind",
    resourceLabel: "Second Wind",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 1, total: 1 }],
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
    subclassSlug: null,
    name: "Second Wind",
    level: 1,
    edition: "EDITION_2024",
    description:
      "As a Bonus Action, regain Hit Points equal to 1d10 plus your Fighter level. You have 2 uses of this feature (3 at level 4, 4 at level 10). You regain one expended use when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest.",
    // SRD 5.2 p. 48: short-rest regain is flat 1 per tier, not level-scaled.
    resourceKey: "secondWind",
    resourceLabel: "Second Wind",
    resourceRecharge: "longRest",
    resourceTotals: [
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
    subclassSlug: null,
    name: "Weapon Mastery",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2 p. 48. Mechanics (which mastery properties, swap timing) are
    // #1138's; this is the level-1 feature TEXT a 2024 Fighter's sheet must
    // not omit.
    description:
      "You use the mastery properties of three kinds of Simple or Martial weapons of your choice (4 at level 4, 5 at level 10, 6 at level 16). Whenever you finish a Long Rest, you can change one of those weapon choices.",
  },
  {
    subclassSlug: null,
    name: "Action Surge",
    level: 2,
    edition: "EDITION_2014",
    description:
      "Take one additional action on your turn. Regain use(s) on a short or long rest. You have 2 uses starting at level 17.",
    // SRD 5.1 p. 24 / SRD 5.2 p. 48: both recharge on Short or Long Rest.
    resourceKey: "actionSurge",
    resourceLabel: "Action Surge",
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
    // No effectKind: Action Surge is a pure counter, no roll/heal to compute.
  },
  {
    subclassSlug: null,
    name: "Action Surge",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2 p. 48: recharges on Short or Long Rest (not the partial
    // short-rest-regain shape).
    description:
      "Take one additional action on your turn, except the Magic action. Regain your use of this feature on a Short or Long Rest. You have 2 uses starting at level 17, but only once on a turn.",
    resourceKey: "actionSurge",
    resourceLabel: "Action Surge",
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
    subclassSlug: null,
    name: "Tactical Mind",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2 p. 48. Text only — the not-expended-on-failure wrinkle has no
    // AbilityCost shape yet.
    description:
      "When you fail an ability check, you can expend a use of your Second Wind to roll 1d10 and add the number rolled to the check, potentially turning failure into success. If the check still fails, this use of Second Wind isn't expended.",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    edition: "EDITION_2014",
    description: "You can attack twice when taking the Attack action. Three times at level 11; four times at level 20.",
    // Tiers resolve ascending, last-match-wins (tierAt, class-feature-rows.ts).
    // Edition-invariant; only the row SHAPE forks in 2024.
    derivedStat: "attacksPerAction",
    derivedStatTiers: [
      { minLevel: 5, value: 2 },
      { minLevel: 11, value: 3 },
      { minLevel: 20, value: 4 },
    ],
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2 p. 48: decomposes L11/L20 into their own named rows below (Two/
    // Three Extra Attacks); derivedStatTiers stays on this row only.
    description: "You can attack twice instead of once whenever you take the Attack action on your turn.",
    derivedStat: "attacksPerAction",
    derivedStatTiers: [
      { minLevel: 5, value: 2 },
      { minLevel: 11, value: 3 },
      { minLevel: 20, value: 4 },
    ],
  },
  {
    subclassSlug: null,
    name: "Tactical Shift",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2 p. 48: triggers on Second Wind's Bonus Action heal, not a
    // Tactical Mind use.
    description:
      "Whenever you activate your Second Wind with a Bonus Action, you can move up to half your Speed without provoking Opportunity Attacks.",
  },
  {
    subclassSlug: null,
    name: "Indomitable",
    level: 9,
    edition: "EDITION_2014",
    description:
      "Reroll a failed saving throw (you must use the new roll). Regain use(s) on a long rest. Two uses at level 13, three at level 17.",
    // No activation columns: Indomitable is a reactive reroll the player
    // narrates, not a dispatched action.
    resourceKey: "indomitable",
    resourceLabel: "Indomitable",
    resourceRecharge: "longRest",
    resourceTotals: [
      { minLevel: 9, total: 1 },
      { minLevel: 13, total: 2 },
      { minLevel: 17, total: 3 },
    ],
  },
  {
    subclassSlug: null,
    name: "Indomitable",
    level: 9,
    edition: "EDITION_2024",
    // SRD 5.2 p. 48: adds a reroll bonus equal to Fighter level. Uses/levels
    // (9/13/17 -> 1/2/3) are unchanged from 2014.
    description:
      "Reroll a failed saving throw, adding a bonus equal to your Fighter level, and use the new roll. Two uses at level 13, three at level 17. Regain expended uses on a Long Rest.",
    resourceKey: "indomitable",
    resourceLabel: "Indomitable",
    resourceRecharge: "longRest",
    resourceTotals: [
      { minLevel: 9, total: 1 },
      { minLevel: 13, total: 2 },
      { minLevel: 17, total: 3 },
    ],
  },
  {
    subclassSlug: null,
    name: "Tactical Master",
    level: 9,
    edition: "EDITION_2024",
    description:
      "When you hit a creature with an attack that can use a weapon mastery property, you can replace that property with Push, Sap, or Slow for that attack.",
  },
  {
    subclassSlug: null,
    name: "Two Extra Attacks",
    level: 11,
    edition: "EDITION_2024",
    description: "You can attack three times whenever you take the Attack action on your turn.",
    // No derivedStat here — already carried by the L5 Extra Attack row's
    // derivedStatTiers (this row's level, 11, is one of its tiers).
  },
  {
    subclassSlug: null,
    name: "Studied Attacks",
    level: 13,
    edition: "EDITION_2024",
    description:
      "Whenever you miss with an attack roll against a creature, you have Advantage on your next attack roll against that creature before the end of your next turn.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2 p. 48. Text only — feat system deferred. 2014 keeps a plain ASI
    // at 19 instead.
    description: "You gain an Epic Boon feat of your choice (Boon of Combat Prowess recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Three Extra Attacks",
    level: 20,
    edition: "EDITION_2024",
    description: "You can attack four times whenever you take the Attack action on your turn.",
    // No derivedStat here — the L5 Extra Attack row's derivedStatTiers
    // already carries level 20's value.
  },
];

// Champion — SRD 5.1 p. 25 (2014) / SRD 5.2 p. 49 (2024)
const CHAMPION_SLUG = slug("fighter-champion");
const CRIT_RANGE_TIERS = [
  { minLevel: 3, value: 19 },
  { minLevel: 15, value: 18 },
];
const CHAMPION_RAW: RawFighterFeature[] = [
  {
    subclassSlug: CHAMPION_SLUG,
    name: "Improved Critical",
    level: 3,
    edition: "EDITION_2014",
    description: "Your weapon attacks score a critical hit on a roll of 19 or 20.",
    derivedStat: "critRange",
    derivedStatTiers: CRIT_RANGE_TIERS,
  },
  {
    subclassSlug: CHAMPION_SLUG,
    name: "Improved Critical",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2 p. 49: extends crit range to Unarmed Strikes too; the
    // derivedStat itself is edition-invariant.
    description: "Your weapon attacks and Unarmed Strikes score a critical hit on a roll of 19 or 20.",
    derivedStat: "critRange",
    derivedStatTiers: CRIT_RANGE_TIERS,
  },
  {
    subclassSlug: CHAMPION_SLUG,
    name: "Remarkable Athlete",
    level: 7,
    edition: "EDITION_2014",
    description:
      "Add half your proficiency bonus (rounded up) to Strength, Dexterity, or Constitution checks that don't already use your proficiency bonus. Running long jump distance increases by your Strength modifier in feet.",
  },
  {
    subclassSlug: CHAMPION_SLUG,
    name: "Remarkable Athlete",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2 p. 49: level-shifts 7 -> 3 and is a full rewrite (Initiative +
    // Athletics advantage, post-crit move), not an edit of the 2014 row.
    description:
      "You have Advantage on Initiative rolls and Strength (Athletics) checks. Immediately after you score a Critical Hit, you can move up to half your Speed without provoking Opportunity Attacks.",
  },
  {
    subclassSlug: CHAMPION_SLUG,
    name: "Additional Fighting Style",
    level: 10,
    edition: "EDITION_2014",
    description: "Choose a second option from the Fighting Style class feature.",
  },
  {
    subclassSlug: CHAMPION_SLUG,
    name: "Additional Fighting Style",
    level: 7,
    edition: "EDITION_2024",
    // SRD 5.2 p. 49: level-shifts 10 -> 7; grants another Fighting Style feat
    // (not a class-feature menu option).
    description: "You gain another Fighting Style feat of your choice.",
  },
  {
    subclassSlug: CHAMPION_SLUG,
    name: "Heroic Warrior",
    level: 10,
    edition: "EDITION_2024",
    // SRD 5.2 p. 49: fills the L10 slot Additional Fighting Style vacated.
    description: "During combat, you can give yourself Heroic Inspiration whenever you start your turn without it.",
  },
  {
    subclassSlug: CHAMPION_SLUG,
    name: "Superior Critical",
    level: 15,
    edition: "EDITION_2014",
    description: "Your weapon attacks score a critical hit on a roll of 18, 19, or 20.",
  },
  {
    subclassSlug: CHAMPION_SLUG,
    name: "Superior Critical",
    level: 15,
    edition: "EDITION_2024",
    description: "Your weapon attacks and Unarmed Strikes score a critical hit on a roll of 18, 19, or 20.",
  },
  {
    subclassSlug: CHAMPION_SLUG,
    name: "Survivor",
    level: 18,
    edition: "EDITION_2014",
    description:
      "At the start of each of your turns, regain HP equal to 5 + your Constitution modifier if you are at or below half your hit point maximum (and not at 0 HP).",
  },
  {
    subclassSlug: CHAMPION_SLUG,
    name: "Survivor",
    level: 18,
    edition: "EDITION_2024",
    // SRD 5.2 p. 49: Defy Death's 18-20 counts as a 20 outright (not merely
    // advantage).
    description:
      "Defy Death: you have Advantage on Death Saving Throws, and rolling 18-20 on one counts as a 20 outright. Heroic Rally: at the start of each of your turns, regain Hit Points equal to 5 plus your Constitution modifier while you are Bloodied and have at least 1 Hit Point.",
  },
];

// Battle Master — PHB'24 (mirror-sourced; not in SRD 5.2). 2014: SRD 5.1 p. 25.
// Mirrors: dnd2024.wikidot.com/fighter:battle-master and Roll20's licensed
// compendium agree verbatim.
const BATTLE_MASTER_SLUG = slug("fighter-battle-master");

// PHB'14 p.73: edition-invariant mechanics — extracted to one object spread
// into both rows below rather than authored twice.
const COMBAT_SUPERIORITY_MECHANICS: Pick<
  RawFighterFeature,
  "resourceKey" | "resourceLabel" | "resourceRecharge" | "resourceTotals" | "resourceDieTiers" | "derivedStat" | "derivedStatTiers" | "saveDcAbilities"
> = {
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
};

const BATTLE_MASTER_RAW: RawFighterFeature[] = [
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Combat Superiority",
    level: 3,
    edition: "EDITION_2014",
    description:
      "You learn maneuvers fueled by superiority dice (d8s). You have 4 dice and regain all expended dice on a short or long rest. Maneuvers can only be used once per attack unless otherwise stated.",
    ...COMBAT_SUPERIORITY_MECHANICS,
  },
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Combat Superiority",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). No numeric change from 2014 —
    // only the maneuver catalog changed (out of scope).
    description:
      "You learn maneuvers fueled by Superiority Dice. You have 4 d8s (5 at level 7, 6 at level 15), and you know 3 maneuvers (5 at level 7, 7 at level 10, 9 at level 15). The save DC for a maneuver that requires one equals 8 + your Proficiency Bonus + your Strength or Dexterity modifier. You regain all expended dice on a short or long rest.",
    ...COMBAT_SUPERIORITY_MECHANICS,
  },
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Student of War",
    level: 3,
    edition: "EDITION_2014",
    description: "You gain proficiency with one type of artisan's tools of your choice.",
    // Flat 1 from L3 (the subclass grant level), edition-invariant.
    derivedStat: "toolProfChoiceCount",
    derivedStatTiers: [{ minLevel: 3, value: 1 }],
  },
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Student of War",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). Adds a skill choice; that
    // grant's mechanics are out of scope here.
    description:
      "You gain proficiency with one type of artisan's tools of your choice, and you gain proficiency in one skill of your choice from the Fighter's level 1 skill list.",
    derivedStat: "toolProfChoiceCount",
    derivedStatTiers: [{ minLevel: 3, value: 1 }],
  },
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Know Your Enemy",
    level: 7,
    edition: "EDITION_2014",
    description:
      "If you spend at least 1 minute observing or interacting with another creature outside combat, you can compare two of its ability scores, armor class, hit points, hit dice, or levels to your own.",
  },
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Know Your Enemy",
    level: 7,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). Total rewrite at the same
    // level.
    description:
      "As a Bonus Action, choose a creature you can see within 30 feet of yourself and learn whether it has any damage Immunities, Resistances, or Vulnerabilities, and what they are if any. You can use this feature once, and you regain your use of it when you finish a Long Rest or when you expend a Superiority Die to restore it (no action required).",
  },
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Improved Combat Superiority (d10)",
    level: 10,
    edition: "EDITION_2014",
    description: "Your superiority dice turn into d10s.",
  },
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Improved Combat Superiority (d10)",
    level: 10,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). Unchanged from 2014; the d12
    // step splits into its own L18 feature below.
    description: "Your Superiority Dice turn into d10s.",
  },
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Relentless",
    level: 15,
    edition: "EDITION_2014",
    description: "When you roll initiative and have no superiority dice remaining, you regain 1 superiority die.",
  },
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Relentless",
    level: 15,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). Total rewrite: once-per-turn
    // maneuver-cost substitute, not 2014's initiative-triggered refund. Text
    // only.
    description:
      "Once per turn when you use a maneuver, you can roll 1d8 and use the number rolled instead of expending a Superiority Die.",
  },
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Improved Combat Superiority (d12)",
    level: 18,
    edition: "EDITION_2014",
    description: "Your superiority dice turn into d12s.",
  },
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Ultimate Combat Superiority",
    level: 18,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). Renamed from 2014's "Improved
    // Combat Superiority (d12)" — a different name at the same level, so it
    // does not pair as a same-name fork in KNOWN_FORKED_NAMES.
    description: "Your Superiority Dice turn into d12s.",
  },
];

// Eldritch Knight — text unverified against any first-party 2024 source;
// every row below is UNTAGGED (`edition` omitted per the EDITION RULE) rather
// than authoring unverified 2024 content.
const ELDRITCH_KNIGHT_SLUG = slug("fighter-eldritch-knight");
const ELDRITCH_KNIGHT_RAW: RawFighterFeature[] = [
  {
    subclassSlug: ELDRITCH_KNIGHT_SLUG,
    name: "Eldritch Knight Spellcasting",
    level: 3,
    description:
      "You learn spells from the wizard list (primarily abjuration and evocation), casting with Intelligence. Third-caster progression: spell slots start at level 3. You know cantrips and a limited number of spells.",
    // No descriptor columns here — third-caster fraction + spellcasting
    // ability are carried by Subclass.casterFraction/spellcastingAbility
    // (subclasses.ts), not this row.
  },
  {
    subclassSlug: ELDRITCH_KNIGHT_SLUG,
    name: "Weapon Bond",
    level: 3,
    description:
      "Perform a 1-hour ritual to bond with up to two weapons. Bonded weapons can't be disarmed and you can summon one to your hand as a bonus action.",
  },
  {
    subclassSlug: ELDRITCH_KNIGHT_SLUG,
    name: "War Magic",
    level: 7,
    description: "When you use your action to cast a cantrip, you can make one weapon attack as a bonus action.",
  },
  {
    subclassSlug: ELDRITCH_KNIGHT_SLUG,
    name: "Eldritch Strike",
    level: 10,
    description:
      "When you hit a creature with a weapon attack, that creature has disadvantage on the next saving throw it makes against a spell you cast before the end of your next turn.",
  },
  {
    subclassSlug: ELDRITCH_KNIGHT_SLUG,
    name: "Arcane Charge",
    level: 15,
    description:
      "When you use your Action Surge, you can teleport up to 30 feet to an unoccupied space you can see, before or after the additional action.",
  },
  {
    subclassSlug: ELDRITCH_KNIGHT_SLUG,
    name: "Improved War Magic",
    level: 18,
    description: "When you use your action to cast a spell, you can make one weapon attack as a bonus action.",
  },
];

export const FIGHTER_FEATURES: ClassFeatureSeedRow[] = [
  ...FIGHTER_BASE_RAW,
  ...CHAMPION_RAW,
  ...BATTLE_MASTER_RAW,
  ...ELDRITCH_KNIGHT_RAW,
].flatMap(expand);
