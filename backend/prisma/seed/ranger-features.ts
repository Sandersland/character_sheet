// Ranger ClassFeature rows, authored as literal data (#1230).
//
// DATA MODULE ONLY (#1277 AC 4): no direct database calls or async writes.
//
// `edition` omitted seeds one row per edition with identical text (Extra
// Attack only); set seeds exactly that edition — a "removed in 2024" feature
// keeps its 2014 row rather than being deleted, and a rename (Ranger's
// Companion -> Primal Companion) is a new row, never an edit in place.
import type { ResourceTotalFormula } from "../../src/lib/classes/class-feature-rows.js";
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`ranger-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawRangerFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  edition?: SeedEdition;
  derivedStat?: string;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula; shortRestRegain?: number }[];
  choiceKey?: string;
  choiceCatalogSource?: string;
  choiceCountTiers?: { minLevel: number; count: number }[];
}

function expand(raw: RawRangerFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Ranger",
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    derivedStat: raw.derivedStat,
    derivedStatTiers: raw.derivedStatTiers,
    resourceKey: raw.resourceKey,
    resourceLabel: raw.resourceLabel,
    resourceRecharge: raw.resourceRecharge,
    resourceTotals: raw.resourceTotals,
    choiceKey: raw.choiceKey,
    choiceCatalogSource: raw.choiceCatalogSource,
    choiceCountTiers: raw.choiceCountTiers,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// Base class — SRD 5.1 Ranger (2014) / SRD 5.2 Ranger (2024). 11 EDITION_2014
// rows (byte-identical to ranger-2014-snapshot.test.ts) + 15 EDITION_2024
// rows. Extra Attack is the only untagged row (edition-invariant in
// mechanics and wording).
const RANGER_BASE_RAW: RawRangerFeature[] = [
  {
    subclassSlug: null,
    name: "Favored Enemy",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Choose a type of favored enemy (beasts, fey, humanoids of a specific type, etc.). You have advantage on Survival checks to track them and on Intelligence checks to recall information about them. You learn one language spoken by your favored enemy. Additional enemy at L6 and L14.",
  },
  {
    subclassSlug: null,
    name: "Favored Enemy",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You always have the Hunter's Mark spell prepared; it doesn't count against the number of spells you can prepare. You can cast it without expending a spell slot a number of times (2 at level 1, rising to 3/4/5/6 at levels 5/9/13/17), and you regain all expended uses when you finish a Long Rest.",
    resourceKey: "favoredEnemy",
    resourceLabel: "Favored Enemy (Hunter's Mark)",
    resourceRecharge: "longRest",
    // Each tier's value happens to equal proficiencyBonusForLevel(level) at
    // every level (SRD 5.2 coincidence, not a rule) — pinned explicitly by
    // ranger-favored-enemy-pool.test.ts so a future PB change doesn't
    // silently retabulate this table instead of being caught.
    resourceTotals: [
      { minLevel: 1, total: 2 },
      { minLevel: 5, total: 3 },
      { minLevel: 9, total: 4 },
      { minLevel: 13, total: 5 },
      { minLevel: 17, total: 6 },
    ],
  },
  {
    subclassSlug: null,
    name: "Natural Explorer",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Choose a favored terrain type. When traveling in it: ignore difficult terrain, can't be surprised if alert, advantage on Initiative rolls, initiative even if surprised once per turn, move at normal pace while stealthing. Additional terrain at L6 and L10.",
  },
  // No EDITION_2024 row — removed in 2024; Deft Explorer below fills its L2 slot.
  {
    subclassSlug: null,
    name: "Weapon Mastery",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You use the mastery properties of two kinds of weapons of your choice with which you have proficiency. Whenever you finish a Long Rest, you can change one or both of those weapon choices.",
    // Exactly two weapon kinds, no scaling at L4/L10 — do not copy
    // Barbarian's/Fighter's Weapon Mastery scaling.
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You cast spells using Wisdom. Half-caster progression (first slots at level 2, one level behind full casters). You prepare a number of ranger spells equal to half your ranger level + Wisdom modifier (minimum 1).",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You cast spells using Wisdom. Half-caster progression, with your first spell slots at level 1. You prepare a number of ranger spells from the Ranger spell list, shown on your class table's Spells Prepared column — 2 at level 1, growing to 15 by level 20 (#1127: the per-level table itself isn't modelled).",
    // SRD 5.2 Ranger gains Spellcasting at level 1, not 2 (CLAUDE.md: "PHB'14
    // half-casters gain Spellcasting at 2nd level, SRD 5.2 at 1st").
  },
  {
    subclassSlug: null,
    name: "Fighting Style",
    level: 2,
    edition: "EDITION_2014",
    description:
      "Choose: Archery (+2 ranged attack rolls), Defense (+1 AC in armor), Dueling (+2 melee damage with one weapon), or Two-Weapon Fighting (add ability modifier to off-hand damage).",
  },
  {
    subclassSlug: null,
    name: "Fighting Style",
    level: 2,
    edition: "EDITION_2024",
    description:
      "Choose a Fighting Style feat. Alongside the shared options (Archery, Defense, Dueling, Two-Weapon Fighting, etc.), Rangers can choose Druidic Warrior: learn two Druid cantrips, cast using Wisdom, swapping one for a different Druid cantrip whenever you gain a Ranger level.",
  },
  {
    subclassSlug: null,
    name: "Primeval Awareness",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Expend one spell slot to focus your awareness for 1 minute per slot level. You sense whether certain types of creatures are within 1 mile (or 6 miles in your favored terrain).",
  },
  // No EDITION_2024 row — removed in 2024, no direct successor.
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    description: "You can attack twice whenever you take the Attack action on your turn.",
    // SRD 5.1 / SRD 5.2 Ranger: flat tier, no scaling beyond L5.
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    subclassSlug: null,
    name: "Deft Explorer",
    level: 2,
    edition: "EDITION_2024",
    description:
      "Choose one skill you're proficient in; you gain Expertise in it (double proficiency bonus on its checks). You also learn two languages of your choice.",
    // The Expertise ladder (1 at L2, 3 at L9, #1588) lives entirely on this
    // row — derivedStatFromRows takes the max across rows, so the L9
    // "Expertise" row below leaves derivedStat unset.
    derivedStat: "expertiseChoiceCount",
    derivedStatTiers: [
      { minLevel: 2, value: 1 },
      { minLevel: 9, value: 3 },
    ],
  },
  {
    subclassSlug: null,
    name: "Land's Stride",
    level: 8,
    edition: "EDITION_2014",
    description:
      "Moving through nonmagical difficult terrain costs no extra movement. You can pass through nonmagical plants without being slowed or taking damage. Advantage on saves against magically created or manipulated plants.",
  },
  // No EDITION_2024 row — removed in 2024, no direct successor.
  {
    subclassSlug: null,
    name: "Roving",
    level: 6,
    edition: "EDITION_2024",
    description:
      "Your Speed increases by 10 feet while you aren't wearing Heavy armor. You also gain a Climb Speed and a Swim Speed, both equal to your Speed.",
    // No Climb/Swim-speed model exists — text only.
  },
  {
    subclassSlug: null,
    name: "Hide in Plain Sight",
    level: 10,
    edition: "EDITION_2014",
    description:
      "Spend 1 minute camouflaging yourself: gain +10 to Dexterity (Stealth) checks while you remain motionless. The bonus is lost when you move, take an action, or take a reaction.",
  },
  // No EDITION_2024 row — removed in 2024, no direct successor.
  {
    subclassSlug: null,
    name: "Expertise",
    level: 9,
    edition: "EDITION_2024",
    description: "Choose two more skills you're proficient in; you gain Expertise in them.",
    // The ladder for this grant lives on the Deft Explorer L2 row above —
    // this row leaves derivedStat unset to avoid double-authoring it.
  },
  {
    subclassSlug: null,
    name: "Tireless",
    level: 10,
    edition: "EDITION_2024",
    description:
      "As a Magic action, you gain Temporary Hit Points equal to 1d8 plus your Wisdom modifier, and your Exhaustion level (if any) decreases by 1. You can use this feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest.",
    resourceKey: "tireless",
    resourceLabel: "Tireless",
    resourceRecharge: "longRest",
    // Uses = Wisdom modifier (minimum one), not proficiency bonus.
    resourceTotals: [{ minLevel: 10, total: { abilityMod: "wisdom", min: 1 } }],
  },
  {
    subclassSlug: null,
    name: "Vanish",
    level: 14,
    edition: "EDITION_2014",
    description:
      "You can use the Hide action as a bonus action on your turn. Also, you can't be tracked by nonmagical means unless you choose to leave a trail.",
  },
  // No EDITION_2024 row — removed in 2024, no direct successor.
  {
    subclassSlug: null,
    name: "Relentless Hunter",
    level: 13,
    edition: "EDITION_2024",
    description: "Taking damage can't break your Concentration on the Hunter's Mark spell.",
    // Keys off the Hunter's-Mark-marked creature (self-or-announce) — text only by design.
  },
  {
    subclassSlug: null,
    name: "Nature's Veil",
    level: 14,
    edition: "EDITION_2024",
    description:
      "As a Bonus Action, you magically become Invisible until the end of your next turn. You can use this feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest.",
    resourceKey: "naturesVeil",
    resourceLabel: "Nature's Veil",
    resourceRecharge: "longRest",
    // Uses = Wisdom modifier (minimum one) — same formula shape as Tireless above.
    resourceTotals: [{ minLevel: 14, total: { abilityMod: "wisdom", min: 1 } }],
  },
  {
    subclassSlug: null,
    name: "Precise Hunter",
    level: 17,
    edition: "EDITION_2024",
    description: "You have advantage on attack rolls against the creature currently marked by your Hunter's Mark spell.",
    // Keys off the Hunter's-Mark-marked creature — text only by design.
  },
  {
    subclassSlug: null,
    name: "Feral Senses",
    level: 18,
    edition: "EDITION_2014",
    description:
      "When not blinded or deafened, you are aware of invisible creatures within 30 ft even if they are hidden. In combat, no disadvantage on attacks against invisible creatures within 30 ft.",
  },
  {
    subclassSlug: null,
    name: "Feral Senses",
    level: 18,
    edition: "EDITION_2024",
    description: "You have Blindsight with a range of 30 feet.",
    // Flat Blindsight 30 ft — drops the 2014 row's blinded/deafened carve-outs.
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    description: "You gain an Epic Boon feat of your choice (Boon of Dimensional Travel recommended). You can take this feat only once.",
    // 2014 keeps a plain ASI at 19 (edition-invariant ASI table, not a row here).
  },
  {
    subclassSlug: null,
    name: "Foe Slayer",
    level: 20,
    edition: "EDITION_2014",
    description:
      "Once per turn when you hit a favored enemy with a weapon, you may add your Wisdom modifier to the attack roll or the damage roll.",
  },
  {
    subclassSlug: null,
    name: "Foe Slayer",
    level: 20,
    edition: "EDITION_2024",
    description: "The damage die of your Hunter's Mark spell is a d10 rather than a d6.",
    // A different mechanic from 2014's Wisdom-modifier bonus, not a number change.
  },
];

// Hunter — 2014: 4 rows. 2024: 5 rows; Giant Killer and Steel Will have no
// 2024 successor, Multiattack is replaced by Superior Hunter's Prey, and
// Hunter's Lore joins new at L3.
const HUNTER_SLUG = slug("ranger-hunter");
const HUNTER_RAW: RawRangerFeature[] = [
  {
    subclassSlug: HUNTER_SLUG,
    name: "Hunter's Prey",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Choose one: Colossus Slayer (once per turn, +1d8 damage to a wounded creature); Giant Killer (reaction attack when a Large+ creature misses you); or Horde Breaker (once per turn, attack a second creature adjacent to the first).",
    choiceKey: "huntersPrey",
    choiceCatalogSource: "huntersPrey",
    choiceCountTiers: [{ minLevel: 3, count: 1 }],
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Hunter's Prey",
    level: 3,
    edition: "EDITION_2024",
    description:
      "Choose one: Colossus Slayer (once per turn, +1d8 damage to a creature missing any of its Hit Points) or Horde Breaker (once per turn, make another attack with the same weapon against a different creature within 5 ft of the original target). Swappable for the other option whenever you finish a Short or Long Rest.",
    choiceKey: "huntersPrey",
    choiceCatalogSource: "huntersPrey",
    choiceCountTiers: [{ minLevel: 3, count: 1 }],
    // Swappable on a Short/Long Rest in 2024 — this app's choicesKnown picks
    // are permanent, no swap mechanism yet (#1353).
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Defensive Tactics",
    level: 7,
    edition: "EDITION_2014",
    description:
      "Choose one: Escape the Horde (opportunity attacks against you have disadvantage); Multiattack Defense (+4 AC against other attacks after being hit by one); or Steel Will (advantage on saves against being frightened).",
    choiceKey: "defensiveTactics",
    choiceCatalogSource: "defensiveTactics",
    choiceCountTiers: [{ minLevel: 7, count: 1 }],
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Defensive Tactics",
    level: 7,
    edition: "EDITION_2024",
    description:
      "Choose one: Escape the Horde (Opportunity Attacks have disadvantage against you) or Multiattack Defense (when a creature hits you with an attack roll, that creature has disadvantage on all other attack rolls against you this turn). Swappable for the other option whenever you finish a Short or Long Rest.",
    choiceKey: "defensiveTactics",
    choiceCatalogSource: "defensiveTactics",
    choiceCountTiers: [{ minLevel: 7, count: 1 }],
    // Multiattack Defense reworks from flat +4 AC to imposing disadvantage on
    // the triggering creature's other attacks — a different mechanic, not a
    // number change.
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Multiattack",
    level: 11,
    edition: "EDITION_2014",
    description:
      "Choose one: Volley (action: ranged attack against every creature in a 10-ft radius within range); or Whirlwind Attack (action: melee attack against every creature within reach).",
    choiceKey: "hunterMultiattack",
    choiceCatalogSource: "hunterMultiattack",
    choiceCountTiers: [{ minLevel: 11, count: 1 }],
  },
  // Multiattack has no EDITION_2024 row — replaced by Superior Hunter's Prey below.
  {
    subclassSlug: HUNTER_SLUG,
    name: "Superior Hunter's Prey",
    level: 11,
    edition: "EDITION_2024",
    description:
      "Once per turn when you deal damage to the creature marked by your Hunter's Mark, you can deal that spell's extra damage to a different creature you can see within 30 feet of the marked creature.",
    // Keys off the Hunter's-Mark-marked creature — text only by design.
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Hunter's Lore",
    level: 3,
    edition: "EDITION_2024",
    description:
      "While a creature is marked by your Hunter's Mark, you know whether that creature has any damage Immunities, Resistances, or Vulnerabilities, and if it does, you know what they are.",
    // Keys off the Hunter's-Mark-marked creature — text only by design.
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Superior Hunter's Defense",
    level: 15,
    edition: "EDITION_2014",
    description:
      "Choose one: Evasion (no damage on successful Dex save, half on failure); Stand Against the Tide (redirect a missed melee attack to another creature within range); or Uncanny Dodge (halve damage from one attack per reaction).",
    choiceKey: "superiorHuntersDefense",
    choiceCatalogSource: "superiorHuntersDefense",
    choiceCountTiers: [{ minLevel: 15, count: 1 }],
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Superior Hunter's Defense",
    level: 15,
    edition: "EDITION_2024",
    description:
      "When you take damage, you can take a Reaction to give yourself Resistance to that damage type and any other damage of the same type, until the end of the current turn.",
    // A single fixed Reaction (not a three-option choice): Resistance to the
    // triggering damage type and any other damage of that type, until the
    // end of the current turn.
  },
];

// Beast Master — 2014: 4 rows. 2024: 4 rows, mirror-sourced (not in the free
// SRD, owner decision) — Ranger's Companion renames to Primal Companion (a
// new row, not an edit in place); the three companion stat blocks are
// deliberately deferred, never transcribed here.
const BEAST_MASTER_SLUG = slug("ranger-beast-master");
const BEAST_MASTER_RAW: RawRangerFeature[] = [
  {
    subclassSlug: BEAST_MASTER_SLUG,
    name: "Ranger's Companion",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Bond with a beast companion of CR 1/4 or lower. It acts on your turn (using your action to command it after the first round). It uses your proficiency bonus and gains bonus HP equal to four times your ranger level.",
  },
  // Ranger's Companion has no EDITION_2024 row — renamed to Primal Companion below, not edited in place.
  {
    subclassSlug: BEAST_MASTER_SLUG,
    name: "Primal Companion",
    level: 3,
    edition: "EDITION_2024",
    description:
      "You magically summon a spirit that assumes an animal form: Beast of the Land, Beast of the Sea, or Beast of the Sky (choose freely each time you summon). It acts on your turn — you can command it (no action required) or let it Dodge on its own — and a different beast can be summoned on each Long Rest, the old one vanishing. If it has died within the last hour, you can take a Magic action and expend a spell slot to touch it; it returns to life after 1 minute with all its Hit Points restored.",
    // Mirror-sourced (not in SRD 5.2). Do not transcribe the three companion
    // stat blocks — that subsystem is deliberately deferred.
  },
  {
    subclassSlug: BEAST_MASTER_SLUG,
    name: "Exceptional Training",
    level: 7,
    edition: "EDITION_2014",
    description:
      "Use a bonus action to command your companion to Dash, Disengage, Dodge, or Help. Its attacks count as magical.",
  },
  {
    subclassSlug: BEAST_MASTER_SLUG,
    name: "Exceptional Training",
    level: 7,
    edition: "EDITION_2024",
    description: "As a Bonus Action, you can command your companion to Dash, Disengage, Dodge, or Help.",
  },
  {
    subclassSlug: BEAST_MASTER_SLUG,
    name: "Bestial Fury",
    level: 11,
    edition: "EDITION_2014",
    description: "Your companion can make two attacks when you command it to attack.",
  },
  {
    subclassSlug: BEAST_MASTER_SLUG,
    name: "Bestial Fury",
    level: 11,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2).
    description: "When you command your companion to take the Attack action, it can make two attacks instead of one.",
  },
  {
    subclassSlug: BEAST_MASTER_SLUG,
    name: "Share Spells",
    level: 15,
    edition: "EDITION_2014",
    description: "When you cast a spell targeting yourself, you can also affect your companion if it is within 30 ft.",
  },
  {
    subclassSlug: BEAST_MASTER_SLUG,
    name: "Share Spells",
    level: 15,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2).
    description: "When you cast a spell targeting only yourself, you can also affect your companion with it if the companion is within 30 feet of you.",
  },
];

export const RANGER_FEATURES: ClassFeatureSeedRow[] = [...RANGER_BASE_RAW, ...HUNTER_RAW, ...BEAST_MASTER_RAW].flatMap(expand);
