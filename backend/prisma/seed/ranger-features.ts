// --- Ranger ClassFeature rows, authored as LITERAL data (#1230) ------------
// Commit 1 of 3 (mirrors Barbarian's #1223 / Warlock's #1233 pilot) moves
// these rows off lib/classes/ranger.ts's AuthoredFeature[] arrays into
// literal seed data, byte-identical to the old TS-derived text (pinned by
// ranger-2014-snapshot.test.ts) — every row below is still UNTAGGED
// (`edition` omitted), so expand() reproduces today's 38 DB rows exactly (19
// source features x 2 identical-text editions): zero behaviour change.
// Commit 2 authors Ranger's REAL SRD 5.2 (2024) content, transcribed from
// three independent SRD 5.2 sources (see that commit's own PR) — never "the
// 2014 text with a coat of paint" — by tagging the rows below EDITION_2014
// and adding new EDITION_2024 rows alongside them. Commit 3 moves Favored
// Enemy's resourceTotals pool onto its EDITION_2024 row (a level-tiered
// total) and declares — without populating — Tireless's and Nature's Veil's
// resourceKey (both a Wisdom-modifier FORMULA, not a tier table; their total
// stays in ranger.ts's small EDITION_2024-gated resourceFn residue,
// mirroring warlock.ts's Dark One's Own Luck pattern). class-features.ts
// concatenates RANGER_FEATURES onto the still-derived classes' rows to build
// CLASS_FEATURES; see its LITERAL_ROW_CLASSES export for the set of classes
// whose rows tests must not compare against a TS-array "old" side.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE (mirrors barbarian-features.ts/warlock-features.ts): `edition`
// omitted -> expand() seeds ONE row per edition with IDENTICAL text. Every
// row below is untagged today (commit 1's zero-behaviour-change scope); by
// commit 3 only Extra Attack stays that way (edition-invariant in mechanics
// AND wording, matching Barbarian's/Fighter's own precedent) — every other
// row gains an explicit `edition` tag, one row per edition, never one row
// edited in place for a level-shift.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list (mirrors barbarian-features.ts's
// slug()).
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`ranger-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawRangerFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions (see file header). */
  edition?: SeedEdition;
  // #1530 carryover: the base class's L5 "Extra Attack" row is the only row
  // this commit populates a descriptor column on — it was already set on
  // ranger.ts's AuthoredFeature entry (class-features.ts's expandFeatureRow
  // read it from there before this migration), so dropping it here would be a
  // silent regression in deriveAttacksPerAction, not a neutral move. Every
  // other row leaves this undefined — no other Ranger feature has this axis.
  derivedStat?: string;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  // Resource-pool descriptor columns (#1230 commit 3) — see this file's own
  // header for why only Favored Enemy's (2024) row sets resourceTotals, and
  // Tireless's/Nature's Veil's (2024) rows set the other three but
  // deliberately omit it.
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: number; shortRestRegain?: number }[];
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
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// ---- Base class — 11 rows, byte-identical to the pre-#1230 tree -----------
// (ranger-2014-snapshot.test.ts pins this text; it must stay unedited through
// commit 3, when every row but Extra Attack below gains an `edition` tag.)
const RANGER_BASE_RAW: RawRangerFeature[] = [
  {
    subclassSlug: null,
    name: "Favored Enemy",
    level: 1,
    description:
      "Choose a type of favored enemy (beasts, fey, humanoids of a specific type, etc.). You have advantage on Survival checks to track them and on Intelligence checks to recall information about them. You learn one language spoken by your favored enemy. Additional enemy at L6 and L14.",
  },
  {
    subclassSlug: null,
    name: "Natural Explorer",
    level: 1,
    description:
      "Choose a favored terrain type. When traveling in it: ignore difficult terrain, can't be surprised if alert, advantage on Initiative rolls, initiative even if surprised once per turn, move at normal pace while stealthing. Additional terrain at L6 and L10.",
  },
  {
    subclassSlug: null,
    name: "Fighting Style",
    level: 2,
    description:
      "Choose: Archery (+2 ranged attack rolls), Defense (+1 AC in armor), Dueling (+2 melee damage with one weapon), or Two-Weapon Fighting (add ability modifier to off-hand damage).",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 2,
    description:
      "You cast spells using Wisdom. Half-caster progression (first slots at level 2, one level behind full casters). You prepare a number of ranger spells equal to half your ranger level + Wisdom modifier (minimum 1).",
  },
  {
    subclassSlug: null,
    name: "Primeval Awareness",
    level: 3,
    description:
      "Expend one spell slot to focus your awareness for 1 minute per slot level. You sense whether certain types of creatures are within 1 mile (or 6 miles in your favored terrain).",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    description: "You can attack twice whenever you take the Attack action on your turn.",
    // #1530: edition-invariant (SRD 5.1 / SRD 5.2 Ranger, Extra Attack) — one
    // flat tier, no further scaling at higher levels (unlike Fighter).
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    subclassSlug: null,
    name: "Land's Stride",
    level: 8,
    description:
      "Moving through nonmagical difficult terrain costs no extra movement. You can pass through nonmagical plants without being slowed or taking damage. Advantage on saves against magically created or manipulated plants.",
  },
  {
    subclassSlug: null,
    name: "Hide in Plain Sight",
    level: 10,
    description:
      "Spend 1 minute camouflaging yourself: gain +10 to Dexterity (Stealth) checks while you remain motionless. The bonus is lost when you move, take an action, or take a reaction.",
  },
  {
    subclassSlug: null,
    name: "Vanish",
    level: 14,
    description:
      "You can use the Hide action as a bonus action on your turn. Also, you can't be tracked by nonmagical means unless you choose to leave a trail.",
  },
  {
    subclassSlug: null,
    name: "Feral Senses",
    level: 18,
    description:
      "When not blinded or deafened, you are aware of invisible creatures within 30 ft even if they are hidden. In combat, no disadvantage on attacks against invisible creatures within 30 ft.",
  },
  {
    subclassSlug: null,
    name: "Foe Slayer",
    level: 20,
    description:
      "Once per turn when you hit a favored enemy with a weapon, you may add your Wisdom modifier to the attack roll or the damage roll.",
  },
];

// ---- Hunter — 4 rows, byte-identical to the pre-#1230 tree ----------------
const HUNTER_SLUG = slug("ranger-hunter");
const HUNTER_RAW: RawRangerFeature[] = [
  {
    subclassSlug: HUNTER_SLUG,
    name: "Hunter's Prey",
    level: 3,
    description:
      "Choose one: Colossus Slayer (once per turn, +1d8 damage to a wounded creature); Giant Killer (reaction attack when a Large+ creature misses you); or Horde Breaker (once per turn, attack a second creature adjacent to the first).",
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Defensive Tactics",
    level: 7,
    description:
      "Choose one: Escape the Horde (opportunity attacks against you have disadvantage); Multiattack Defense (+4 AC against other attacks after being hit by one); or Steel Will (advantage on saves against being frightened).",
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Multiattack",
    level: 11,
    description:
      "Choose one: Volley (action: ranged attack against every creature in a 10-ft radius within range); or Whirlwind Attack (action: melee attack against every creature within reach).",
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Superior Hunter's Defense",
    level: 15,
    description:
      "Choose one: Evasion (no damage on successful Dex save, half on failure); Stand Against the Tide (redirect a missed melee attack to another creature within range); or Uncanny Dodge (halve damage from one attack per reaction).",
  },
];

// ---- Beast Master — 4 rows, byte-identical to the pre-#1230 tree ----------
const BEAST_MASTER_SLUG = slug("ranger-beast-master");
const BEAST_MASTER_RAW: RawRangerFeature[] = [
  {
    subclassSlug: BEAST_MASTER_SLUG,
    name: "Ranger's Companion",
    level: 3,
    description:
      "Bond with a beast companion of CR 1/4 or lower. It acts on your turn (using your action to command it after the first round). It uses your proficiency bonus and gains bonus HP equal to four times your ranger level.",
  },
  {
    subclassSlug: BEAST_MASTER_SLUG,
    name: "Exceptional Training",
    level: 7,
    description:
      "Use a bonus action to command your companion to Dash, Disengage, Dodge, or Help. Its attacks count as magical.",
  },
  {
    subclassSlug: BEAST_MASTER_SLUG,
    name: "Bestial Fury",
    level: 11,
    description: "Your companion can make two attacks when you command it to attack.",
  },
  {
    subclassSlug: BEAST_MASTER_SLUG,
    name: "Share Spells",
    level: 15,
    description: "When you cast a spell targeting yourself, you can also affect your companion if it is within 30 ft.",
  },
];

export const RANGER_FEATURES: ClassFeatureSeedRow[] = [...RANGER_BASE_RAW, ...HUNTER_RAW, ...BEAST_MASTER_RAW].flatMap(expand);
