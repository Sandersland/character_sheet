// --- Rogue ClassFeature rows, authored as LITERAL data (#1231) -------------
// Commit 1 of 4 (mirrors Fighter's #1227/#1528/#1532 and Barbarian's #1223
// three-commit pilots, widened to four here — see commit 3's own header for
// why): a behaviour-neutral mechanical move only. Rogue's rows no longer
// derive from lib/classes/rogue.ts's AuthoredFeature[] arrays at seed time —
// transcribed directly here, once, in their final DB-row shape. NO rules
// content is authored or changed by this commit: every row below is a
// byte-identical copy of what rogue.ts's ROGUE_FEATURES/
// ARCANE_TRICKSTER_FEATURES/ASSASSIN_FEATURES/THIEF_FEATURES said before this
// migration (pinned by rogue-2014-snapshot.test.ts and proven equal by
// rogue-features-migration.test.ts's byte-identity test). Authoring real 2024
// SRD 5.2 / PHB'24 content is commit 2's job; commit 3 relocates
// lib/classes/rogue.ts's five Sneak Attack rule exports (SNEAK_ATTACK_DIE_SOURCE,
// sneakAttackDiceCount, resolveSneakAttackDie, sneakAttackSpec,
// canApplySneakAttack — consumed by lib/classes/sneak-attack.ts and
// lib/character/character-serialize.ts) into sneak-attack.ts, behaviour-
// neutral; commit 4 deletes lib/classes/rogue.ts once nothing depends on it.
// class-features.ts concatenates ROGUE_FEATURES onto the still-derived
// classes' rows to build CLASS_FEATURES; see its LITERAL_ROW_CLASSES export
// for the set of classes whose rows tests must not compare against a
// TS-array "old" side.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE: `edition` omitted -> expand() seeds ONE row per edition with
// IDENTICAL text — every row below is untagged, since rogue.ts's
// AuthoredFeature entries never set `edition` (SRD 5.1 and SRD 5.2 agree on
// every Rogue feature's text at this stage; a genuine 2024 fork is commit 2's
// content to author, not this commit's).
//
// Rogue authors NO descriptor columns (resourceKey/derivedStat/
// saveDcAbilities/...) here or in commit 2 — RawRogueFeature deliberately
// carries only the identity fields. Rogue has no resource pool in either
// edition (Sneak Attack's Nd6 is a computed rule function off the class
// entry's own level, never a persisted pool — see sneak-attack.ts), and
// Cunning Strike's announced save DC (commit 2, base L5) is stated as SRD
// prose instead of `saveDcAbilities`: `deriveRowExtras` (registry.ts) reads
// only `subclassRows`, so a base-class row declaring the column would be
// silently inert, and the column's only sink (`ClassExtras.maneuverSaveDC` ->
// `ManeuversSection`, gated on `maneuverChoiceCount`) is never set by a Rogue.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list (mirrors fighter-features.ts's/
// barbarian-features.ts's slug()).
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`rogue-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawRogueFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions (see file header). */
  edition?: SeedEdition;
}

function expand(raw: RawRogueFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Rogue",
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// ---- Base class — SRD 5.1 / SRD 5.2 Rogue ----------------------------------
// 11 rows, all untagged (both editions byte-identical) — see file header.
const ROGUE_BASE_RAW: RawRogueFeature[] = [
  {
    subclassSlug: null,
    name: "Expertise",
    level: 1,
    description:
      "Choose two of your skill proficiencies (or one skill + Thieves' Tools). Your proficiency bonus is doubled for those skills. Two more at level 6.",
  },
  {
    subclassSlug: null,
    name: "Sneak Attack",
    level: 1,
    description:
      "Once per turn, deal extra damage to a target you hit with a finesse or ranged weapon when you have advantage on the attack or an ally is adjacent to the target. 1d6 at L1, +1d6 every odd level (10d6 at L19).",
  },
  {
    subclassSlug: null,
    name: "Thieves' Cant",
    level: 1,
    description:
      "Secret mix of dialect and codewords used by thieves' guilds. Takes 4× as long to convey a message compared to open speech. Also understand signs and symbols used by criminals.",
  },
  {
    subclassSlug: null,
    name: "Cunning Action",
    level: 2,
    description: "As a bonus action, take the Dash, Disengage, or Hide action.",
  },
  {
    subclassSlug: null,
    name: "Uncanny Dodge",
    level: 5,
    description: "When an attacker you can see hits you, use your reaction to halve the attack's damage.",
  },
  {
    subclassSlug: null,
    name: "Evasion",
    level: 7,
    description:
      "When subjected to an effect that allows a Dexterity save for half damage, you take no damage on a success and half damage on a failure.",
  },
  {
    subclassSlug: null,
    name: "Reliable Talent",
    level: 11,
    description: "When making an ability check with a skill or tool you're proficient in, treat a d20 roll of 9 or lower as a 10.",
  },
  {
    subclassSlug: null,
    name: "Blindsense",
    level: 14,
    description: "If able to hear, you are aware of the location of any hidden or invisible creature within 10 feet.",
  },
  {
    subclassSlug: null,
    name: "Slippery Mind",
    level: 15,
    description: "You gain proficiency in Wisdom saving throws.",
  },
  {
    subclassSlug: null,
    name: "Elusive",
    level: 18,
    description: "No attack roll has advantage against you while you aren't incapacitated.",
  },
  {
    subclassSlug: null,
    name: "Stroke of Luck",
    level: 20,
    description:
      "If your attack misses a target in range, you can turn the miss into a hit. Or if you fail an ability check, you can treat the d20 roll as a 20. Once used, regain on a short or long rest.",
  },
];

// ---- Arcane Trickster -------------------------------------------------------
// 5 rows, all untagged (both editions byte-identical) — see file header.
const ARCANE_TRICKSTER_SLUG = slug("rogue-arcane-trickster");
const ARCANE_TRICKSTER_RAW: RawRogueFeature[] = [
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Arcane Trickster Spellcasting",
    level: 3,
    description:
      "You learn spells from the wizard list (primarily enchantment and illusion), casting with Intelligence. Third-caster progression starting at level 3.",
  },
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Mage Hand Legerdemain",
    level: 3,
    description:
      "You know the Mage Hand cantrip. The hand is invisible and can pick locks, disarm traps, or steal items using your Sleight of Hand skill — even from creatures as long as you distract them.",
  },
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Magical Ambush",
    level: 9,
    description:
      "If you are hidden when you cast a spell, the target has disadvantage on any saving throw it makes against the spell on the same turn.",
  },
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Versatile Trickster",
    level: 13,
    description:
      "As a bonus action, direct your Mage Hand to distract a creature within 5 ft of it. Gain advantage on the next attack roll against that creature before the end of your turn.",
  },
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Spell Thief",
    level: 17,
    description:
      "Immediately after a creature casts a spell that targets you, use your reaction to force it to make a saving throw with its spellcasting ability modifier (DC = your spell save DC). On failure, you negate the spell and steal it — you can cast it (same level) once without a slot within 8 hours. Once used, regain on a long rest.",
  },
];

// ---- Assassin ---------------------------------------------------------------
// 5 rows, all untagged (both editions byte-identical) — see file header.
const ASSASSIN_SLUG = slug("rogue-assassin");
const ASSASSIN_RAW: RawRogueFeature[] = [
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Bonus Proficiencies",
    level: 3,
    description: "You gain proficiency with the disguise kit and the poisoner's kit.",
  },
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Assassinate",
    level: 3,
    description:
      "You have advantage on attack rolls against any creature that hasn't taken a turn yet this combat. Any hit against a surprised creature is a critical hit.",
  },
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Infiltration Expertise",
    level: 9,
    description:
      "Spend 7 days and 25 gp creating a false identity, including documentation, established acquaintances, and disguises. You can't adopt an identity that belongs to someone else.",
  },
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Impostor",
    level: 13,
    description:
      "After studying a creature for 3 hours, you can mimic its speech, writing, and behavior. A Wisdom (Insight) check contested by your Charisma (Deception) reveals the imposture.",
  },
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Death Strike",
    level: 17,
    description:
      "When you hit a surprised creature, it must make a Constitution save (DC 8 + your Dexterity modifier + proficiency bonus) or take double damage from the attack.",
  },
];

// ---- Thief ------------------------------------------------------------------
// 5 rows, all untagged (both editions byte-identical) — see file header.
const THIEF_SLUG = slug("rogue-thief");
const THIEF_RAW: RawRogueFeature[] = [
  {
    subclassSlug: THIEF_SLUG,
    name: "Fast Hands",
    level: 3,
    description:
      "Use the Cunning Action bonus action to make a Sleight of Hand check, use Thieves' Tools to disarm a trap or open a lock, or take the Use an Object action.",
  },
  {
    subclassSlug: THIEF_SLUG,
    name: "Second-Story Work",
    level: 3,
    description:
      "Climbing no longer costs extra movement. When you make a running jump, the distance you cover increases by a number of feet equal to your Dexterity modifier.",
  },
  {
    subclassSlug: THIEF_SLUG,
    name: "Supreme Sneak",
    level: 9,
    description: "You have advantage on a Dexterity (Stealth) check if you move no more than half your speed on the same turn.",
  },
  {
    subclassSlug: THIEF_SLUG,
    name: "Use Magic Device",
    level: 13,
    description: "You ignore all class, race, and level requirements on the use of magic items.",
  },
  {
    subclassSlug: THIEF_SLUG,
    name: "Thief's Reflexes",
    level: 17,
    description:
      "You take two turns during the first round of any combat: your first turn at your normal initiative and your second at your initiative minus 10. You can't use this feature when surprised.",
  },
];

export const ROGUE_FEATURES: ClassFeatureSeedRow[] = [
  ...ROGUE_BASE_RAW,
  ...ARCANE_TRICKSTER_RAW,
  ...ASSASSIN_RAW,
  ...THIEF_RAW,
].flatMap(expand);
