// --- Ranger ClassFeature rows, authored as LITERAL data (#1230) ------------
// Commit 1 of 3 (mirrors Barbarian's #1223 / Warlock's #1233 pilot) moved
// these rows off lib/classes/ranger.ts's AuthoredFeature[] arrays into
// literal seed data, byte-identical to the old TS-derived text (pinned by
// ranger-2014-snapshot.test.ts). Commit 2 (this one) authors Ranger's REAL
// SRD 5.2 (2024) content, transcribed from three independent SRD 5.2 sources
// (5e24srd.com, aidedd.org, and the dnd2024.wikidot/roll20 pair — see the
// PR for the corrections that transcription found) — never "the 2014 text
// with a coat of paint" — by tagging the pre-existing rows EDITION_2014 and
// adding new EDITION_2024 rows alongside them. Beast Master's 2024 rows are
// the one exception: mirror-sourced (owner decision), since Beast Master
// isn't in the free SRD — see BEAST_MASTER_RAW's own comment for the
// two-independent-mirror discipline applied there. Commit 3 moves Favored
// Enemy's resourceTotals pool onto its EDITION_2024 row (a level-tiered
// total). Tireless's and Nature's Veil's rows originally declared
// resourceKey without populating resourceTotals (a Wisdom-modifier formula,
// resourceTotals' flat-number tiers couldn't express it) — #1685 widened the
// vocabulary, so both now carry a `{ abilityMod: "wisdom", min: 1 }` tier and
// ranger.ts's resourceFn residue that used to supply their total is deleted.
// class-features.ts concatenates RANGER_FEATURES onto the still-derived
// classes' rows to build CLASS_FEATURES; see its LITERAL_ROW_CLASSES export
// for the set of classes whose rows tests must not compare against a
// TS-array "old" side.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE (mirrors barbarian-features.ts/warlock-features.ts): `edition`
// omitted -> expand() seeds ONE row per edition with IDENTICAL text —
// reserved for the handful of features genuinely edition-invariant in both
// mechanics AND wording (Extra Attack, the only one below). `edition` set ->
// exactly the one row named; a "removed in 2024" feature (Natural Explorer,
// Primeval Awareness, Land's Stride, Hide in Plain Sight, Vanish; Giant
// Killer/Steel Will/Multiattack on Hunter) means NOT authoring a 2024 row for
// that name, never deleting the 2014 row, and a rename (Ranger's Companion ->
// Primal Companion) means a wholly different row, never one edited in place.
// Every EDITION_2014 row below stays byte-identical to what commit 1 pinned
// (ranger-2014-snapshot.test.ts) — this commit only ever ADDS an
// `edition: "EDITION_2014"`/`"EDITION_2024"` tag alongside new 2024 text; it
// never edits a 2014 row's own name/level/description.
import type { ResourceTotalFormula } from "../../src/lib/classes/class-feature-rows.js";
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
  // Resource-pool descriptor columns (#1230 commit 3, widened #1685) — see
  // this file's own header for the three rows that set these.
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula; shortRestRegain?: number }[];
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

// ---- Base class — SRD 5.1 Ranger (2014) / SRD 5.2 Ranger (2024) -----------
// 2014: 11 rows (byte-identical to commit 1 / ranger-2014-snapshot.test.ts).
// 2024: 15 rows — Natural Explorer, Primeval Awareness, Land's Stride, Hide
// in Plain Sight and Vanish have no 2024 successor (removed, not deleted —
// their 2014 rows stay), and nine wholly new 2024 features join (Weapon
// Mastery, Deft Explorer, Roving, Expertise, Tireless, Relentless Hunter,
// Nature's Veil, Precise Hunter, Epic Boon) alongside four genuine reworks
// (Spellcasting, Favored Enemy, Feral Senses, Foe Slayer). Extra Attack is
// the only feature left UNTAGGED: edition-invariant in mechanics AND wording
// (matches Barbarian's/Fighter's own precedent), so one shared row is
// authored rather than two paraphrases of the same sentence.
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
    // SRD 5.2: a full rewrite — no longer a terrain-lore benefit. You always
    // have Hunter's Mark prepared (it doesn't count against your prepared
    // spells) and can cast it without a spell slot 2 times at L1, rising to
    // 3/4/5/6 at L5/9/13/17 (three independent sources agree; a fourth
    // mirror's "+1d4/+1d6/…" progression is a garbled UA-playtest table,
    // discarded — #1230 research). #1230 commit 3: the free-cast pool is a
    // flat level tier (unlike Tireless/Nature's Veil below), so it moves
    // straight onto this row's own resourceTotals — no resourceFn needed for
    // this one. Coincidentally, each tier's value equals
    // proficiencyBonusForLevel(level) at every level (SRD 5.2 numeric
    // coincidence, not a rule — ranger-favored-enemy-pool.test.ts asserts
    // this explicitly so a future PB change doesn't silently retabulate this
    // table instead of being caught).
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
    subclassSlug: null,
    name: "Natural Explorer",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Choose a favored terrain type. When traveling in it: ignore difficult terrain, can't be surprised if alert, advantage on Initiative rolls, initiative even if surprised once per turn, move at normal pace while stealthing. Additional terrain at L6 and L10.",
  },
  // Natural Explorer has NO EDITION_2024 row — removed in 2024 (Deft
  // Explorer, below, fills its L2 slot instead with a different mechanic).
  {
    subclassSlug: null,
    name: "Weapon Mastery",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart. C3: exactly TWO weapon
    // kinds, no scaling at L4/L10 (unlike Barbarian's/Fighter's own Weapon
    // Mastery rows — do not copy their text). Mastery-property mechanics are
    // #1138's; this is the level-1 feature TEXT a 2024 Ranger's sheet must
    // not omit.
    description:
      "You use the mastery properties of two kinds of weapons of your choice with which you have proficiency. Whenever you finish a Long Rest, you can change one or both of those weapon choices.",
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
    // C2: SRD 5.2 Ranger gains Spellcasting at level 1, not 2 (CLAUDE.md
    // already records this — "PHB'14 half-casters gain Spellcasting at 2nd
    // level, SRD 5.2 at 1st"; the issue's own "Spellcasting (L2) ...
    // unchanged" line is a 2014 carry-over, corrected here). Prepared-spell
    // count grows from 2 at level 1 to 15 at level 20 per the Spells Prepared
    // column of the Ranger Features table (#1230 research, aidedd.org); the
    // full per-level table isn't modelled here (#1127 — no per-level
    // progression table exists for any class's prepared-spell count yet).
    description:
      "You cast spells using Wisdom. Half-caster progression, with your first spell slots at level 1. You prepare a number of ranger spells from the Ranger spell list, shown on your class table's Spells Prepared column — 2 at level 1, growing to 15 by level 20 (#1127: the per-level table itself isn't modelled).",
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
    // SRD 5.2: Fighting Style is now a FEAT, from the same shared list every
    // Fighting-Style-granting class draws from (Archery, Defense, Dueling,
    // Two-Weapon Fighting, etc. all still present) — plus one new option
    // Ranger shares with Druid: Druidic Warrior grants two Druid cantrips
    // (cast using Wisdom), swappable one at a time whenever you gain a
    // Ranger level (#1230 research, aidedd.org).
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
  // Primeval Awareness has NO EDITION_2024 row — removed in 2024, no direct
  // successor (folded into Favored Enemy's Hunter's Mark grant + Deft
  // Explorer/Roving's exploration kit — #1230 research).
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
    name: "Deft Explorer",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart; fills Fighting Style's old
    // L2 exploration-kit role with a different mechanic. C7: the Expertise
    // grant is real persisted state this row doesn't populate (grep finds no
    // Expertise modelling anywhere in backend/src/lib — same disclosed gap as
    // Barbarian's Primal Knowledge, Wizard's Scholar) — text only. The
    // two-languages grant is likewise text only.
    description:
      "Choose one skill you're proficient in; you gain Expertise in it (double proficiency bonus on its checks). You also learn two languages of your choice.",
  },
  {
    subclassSlug: null,
    name: "Land's Stride",
    level: 8,
    edition: "EDITION_2014",
    description:
      "Moving through nonmagical difficult terrain costs no extra movement. You can pass through nonmagical plants without being slowed or taking damage. Advantage on saves against magically created or manipulated plants.",
  },
  // Land's Stride has NO EDITION_2024 row — removed in 2024, no direct
  // successor (#1230 research).
  {
    subclassSlug: null,
    name: "Roving",
    level: 6,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart. C6: a real `speed` effect
    // (Barbarian's mechanically-identical Fast Movement is a hardcoded
    // deriveFastMovement, lib/srd/movement.ts) — but there is no
    // derivedStat consumer for speed at all, and no model for Climb/Swim
    // speeds — text only; follow-up filed (see PR body).
    description:
      "Your Speed increases by 10 feet while you aren't wearing Heavy armor. You also gain a Climb Speed and a Swim Speed, both equal to your Speed.",
  },
  {
    subclassSlug: null,
    name: "Hide in Plain Sight",
    level: 10,
    edition: "EDITION_2014",
    description:
      "Spend 1 minute camouflaging yourself: gain +10 to Dexterity (Stealth) checks while you remain motionless. The bonus is lost when you move, take an action, or take a reaction.",
  },
  // Hide in Plain Sight has NO EDITION_2024 row — removed in 2024, no direct
  // successor (#1230 research).
  {
    subclassSlug: null,
    name: "Expertise",
    level: 9,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart. C7: grants Expertise in two
    // MORE skills you're proficient in — same disclosed text-only shape as
    // Deft Explorer's L2 grant above (grep finds no Expertise modelling
    // anywhere in backend/src/lib).
    description: "Choose two more skills you're proficient in; you gain Expertise in them.",
  },
  {
    subclassSlug: null,
    name: "Tireless",
    level: 10,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart. C1: uses = WISDOM MODIFIER
    // (minimum of once), not proficiency bonus. #1685: now a
    // `{ abilityMod: "wisdom", min: 1 }` formula tier, evaluated by
    // evaluateResourceTotal (class-feature-rows.ts); ranger.ts's
    // EDITION_2024-gated resourceFn residue that used to supply this total is
    // deleted.
    description:
      "As a Magic action, you gain Temporary Hit Points equal to 1d8 plus your Wisdom modifier, and your Exhaustion level (if any) decreases by 1. You can use this feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest.",
    resourceKey: "tireless",
    resourceLabel: "Tireless",
    resourceRecharge: "longRest",
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
  // Vanish has NO EDITION_2024 row — removed in 2024, no direct successor
  // (#1230 research).
  {
    subclassSlug: null,
    name: "Relentless Hunter",
    level: 13,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart. Keys off the Hunter's-Mark-
    // marked creature (CLAUDE.md's effects-are-self-or-announce rule) — text
    // only by design, not omission (#1230 §4).
    description: "Taking damage can't break your Concentration on the Hunter's Mark spell.",
  },
  {
    subclassSlug: null,
    name: "Nature's Veil",
    level: 14,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart. C1: uses = WISDOM MODIFIER
    // (minimum of once) — same formula tier shape as Tireless above (#1685).
    description:
      "As a Bonus Action, you magically become Invisible until the end of your next turn. You can use this feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest.",
    resourceKey: "naturesVeil",
    resourceLabel: "Nature's Veil",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 14, total: { abilityMod: "wisdom", min: 1 } }],
  },
  {
    subclassSlug: null,
    name: "Precise Hunter",
    level: 17,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart. Keys off the Hunter's-Mark-
    // marked creature — text only by design (#1230 §4).
    description: "You have advantage on attack rolls against the creature currently marked by your Hunter's Mark spell.",
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
    // SRD 5.2: a full rewrite — flat Blindsight 30 ft, dropping the
    // 2014 row's blinded/deafened carve-outs and its "no disadvantage
    // against invisible creatures" clause (#1230 research).
    description: "You have Blindsight with a range of 30 feet.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart (2014 keeps a plain ASI at
    // 19 instead, already covered by the edition-invariant ASI-level table,
    // not a ClassFeature row). C4: mirrors Fighter's/Barbarian's own Epic
    // Boon row — the feat system itself is deferred, text only.
    description: "You gain an Epic Boon feat of your choice (Boon of Dimensional Travel recommended). You can take this feat only once.",
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
    // SRD 5.2: the Hunter's Mark damage die becomes a d10 instead of a d6 —
    // a wholly different mechanic from the 2014 row's Wisdom-modifier bonus
    // (#1230 research).
    description: "The damage die of your Hunter's Mark spell is a d10 rather than a d6.",
  },
];

// ---- Hunter -----------------------------------------------------------------
// 2014: 4 rows (byte-identical to commit 1). 2024: 5 rows — Giant Killer and
// Steel Will have no 2024 successor (Hunter's Prey/Defensive Tactics narrow
// to their other two options), Multiattack has no 2024 successor (Superior
// Hunter's Prey fills its L11 slot with a different mechanic), and Hunter's
// Lore joins new at L3.
const HUNTER_SLUG = slug("ranger-hunter");
const HUNTER_RAW: RawRangerFeature[] = [
  {
    subclassSlug: HUNTER_SLUG,
    name: "Hunter's Prey",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Choose one: Colossus Slayer (once per turn, +1d8 damage to a wounded creature); Giant Killer (reaction attack when a Large+ creature misses you); or Horde Breaker (once per turn, attack a second creature adjacent to the first).",
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Hunter's Prey",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2: narrows to Colossus Slayer and Horde Breaker only — Giant
    // Killer has no 2024 successor. C6: swappable on a Short or Long Rest in
    // 2024 (the app's choicesKnown picks are permanent snapshots, no swap
    // mechanism) — deferred to #1353, noted there.
    description:
      "Choose one: Colossus Slayer (once per turn, +1d8 damage to a creature missing any of its Hit Points) or Horde Breaker (once per turn, make another attack with the same weapon against a different creature within 5 ft of the original target). Swappable for the other option whenever you finish a Short or Long Rest.",
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Defensive Tactics",
    level: 7,
    edition: "EDITION_2014",
    description:
      "Choose one: Escape the Horde (opportunity attacks against you have disadvantage); Multiattack Defense (+4 AC against other attacks after being hit by one); or Steel Will (advantage on saves against being frightened).",
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Defensive Tactics",
    level: 7,
    edition: "EDITION_2024",
    // SRD 5.2: narrows to Escape the Horde and Multiattack Defense only —
    // Steel Will has no 2024 successor. C5/research: Multiattack Defense
    // reworks from a flat "+4 AC" to "Disadvantage on that creature's OTHER
    // attacks this turn" — a different mechanic, not merely a number change.
    description:
      "Choose one: Escape the Horde (Opportunity Attacks have disadvantage against you) or Multiattack Defense (when a creature hits you with an attack roll, that creature has disadvantage on all other attack rolls against you this turn). Swappable for the other option whenever you finish a Short or Long Rest.",
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Multiattack",
    level: 11,
    edition: "EDITION_2014",
    description:
      "Choose one: Volley (action: ranged attack against every creature in a 10-ft radius within range); or Whirlwind Attack (action: melee attack against every creature within reach).",
  },
  // Multiattack has NO EDITION_2024 row — removed in 2024 (Superior Hunter's
  // Prey, below, fills its L11 slot instead with a wholly different, no-
  // longer-a-choice mechanic).
  {
    subclassSlug: HUNTER_SLUG,
    name: "Superior Hunter's Prey",
    level: 11,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart. Keys off the Hunter's-Mark-
    // marked creature — text only by design (#1230 §4).
    description:
      "Once per turn when you deal damage to the creature marked by your Hunter's Mark, you can deal that spell's extra damage to a different creature you can see within 30 feet of the marked creature.",
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Hunter's Lore",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart. Keys off the Hunter's-Mark-
    // marked creature — text only by design (#1230 §4).
    description:
      "While a creature is marked by your Hunter's Mark, you know whether that creature has any damage Immunities, Resistances, or Vulnerabilities, and if it does, you know what they are.",
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Superior Hunter's Defense",
    level: 15,
    edition: "EDITION_2014",
    description:
      "Choose one: Evasion (no damage on successful Dex save, half on failure); Stand Against the Tide (redirect a missed melee attack to another creature within range); or Uncanny Dodge (halve damage from one attack per reaction).",
  },
  {
    subclassSlug: HUNTER_SLUG,
    name: "Superior Hunter's Defense",
    level: 15,
    edition: "EDITION_2024",
    // C5: narrower than the issue states — NOT "Resistance to all damage
    // from a triggering source". SRD 5.2: a single fixed Reaction (the
    // 2014 row's three-option choice collapses to one feature), Resistance
    // to the triggering damage type AND any other damage of that same type,
    // lasting only until the end of the CURRENT turn.
    description:
      "When you take damage, you can take a Reaction to give yourself Resistance to that damage type and any other damage of the same type, until the end of the current turn.",
  },
];

// ---- Beast Master -------------------------------------------------------
// 2014: 4 rows (byte-identical to commit 1). 2024: 4 rows — Ranger's
// Companion RENAMES to Primal Companion (a different row, not an edit in
// place) and every other row reworks. Beast Master's 2024 content is
// MIRROR-SOURCED, not SRD-5.2 (owner decision — Beast Master is not in the
// free SRD; the three companion stat blocks are the deliberately deferred
// part, never transcribed here — see PR body for the two-independent-mirror
// discipline this content was held to).
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
  // Ranger's Companion has NO EDITION_2024 row — RENAMED to Primal Companion
  // below (a different row, since the 2024 name differs), never edited in
  // place.
  {
    subclassSlug: BEAST_MASTER_SLUG,
    name: "Primal Companion",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2) — matches fighter-features.ts's
    // Battle Master wording for the same provenance shape. Verified against
    // ≥2 independent mirrors (owner decision 2): the three stat-block names,
    // Bonus-Action command, and the touch+Magic-action+spell-slot revival
    // (1 minute, full HP). Do NOT transcribe the three stat blocks — that
    // subsystem is deliberately deferred (see PR body).
    description:
      "You magically summon a spirit that assumes an animal form: Beast of the Land, Beast of the Sea, or Beast of the Sky (choose freely each time you summon). It acts on your turn — you can command it (no action required) or let it Dodge on its own — and a different beast can be summoned on each Long Rest, the old one vanishing. If it has died within the last hour, you can take a Magic action and expend a spell slot to touch it; it returns to life after 1 minute with all its Hit Points restored.",
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
    // PHB'24 (mirror-sourced; not in SRD 5.2). Transcription discipline
    // (owner decision 2): dungeonmister's action list ends "...Dodge, or
    // Hide" — a garbled outlier; aidedd, the PHB text, and #1230 itself all
    // agree on "Help". Asserted here only where ≥2 independent mirrors agree.
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
