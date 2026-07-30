// --- Fighter ClassFeature rows, authored as LITERAL data (#1227) -----------
// The pilot for #1522's "content is data" direction: Fighter's rows no longer
// derive from lib/classes/fighter.ts's AuthoredFeature[] arrays (deleted in
// this same diff — fallow's repo-wide dead-code gate would otherwise flag
// them as orphaned) — they are transcribed/authored directly here, once, in
// their final DB-row shape. class-features.ts concatenates FIGHTER_FEATURES
// onto the eleven still-derived classes' rows to build CLASS_FEATURES; see
// its LITERAL_ROW_CLASSES export for the set of classes (today: just this
// one) whose rows tests must not compare against a TS-array "old" side.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file.
// expand() below is pure content assembly, not seeding logic — the same
// shape class-features.ts's own expandFeatureRow/collectRawFeatures already
// establishes in this same directory.
//
// SCOPE (#1227): this issue authors Fighter's FEATURE TEXT only. Every
// resource pool stays in fighter.ts's resourceFn (forked on edition, #1499);
// every activation stays in classes/actions.ts's DERIVED_ACTIONS. No
// descriptor column (resourceKey, activationCost, effectKind, ...) is
// populated by any row below — #1528 is what populates those, for whichever
// class it lands on next.
//
// EDITION RULE: `edition` omitted -> expand() seeds ONE row per edition with
// IDENTICAL text (the 2014-is-a-transcription invariant; today that's only
// Eldritch Knight, parked below). `edition` set -> exactly the one row named.
// A 2014 row's text is NEVER edited by this issue for any reason other than
// the #1221 short-rest-recharge fix (which lives in fighter.ts's resourceFn,
// not here) — every EDITION_2014 row below is a byte-identical copy of what
// fighter.ts's FIGHTER_FEATURES/CHAMPION_FEATURES/BATTLE_MASTER_FEATURES/
// ELDRITCH_KNIGHT_FEATURES said before this migration (pinned by
// class-feature-migration.test.ts's 2014-snapshot test). A "removed in 2024"
// feature (the original issue's framing) means simply NOT authoring a 2024
// row for that name — never deleting the 2014 row. A level-shift (e.g.
// Champion's Remarkable Athlete 2014 L7 -> 2024 L3) is two rows with two
// `level` values, never one row edited in place.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list.
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`fighter-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawFighterFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions (see file header). */
  edition?: SeedEdition;
}

function expand(raw: RawFighterFeature): ClassFeatureSeedRow[] {
  const base = { className: "Fighter", subclassSlug: raw.subclassSlug, name: raw.name, level: raw.level, description: raw.description };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// ---- Base class — SRD 5.1 p. 23-24 (2014) / SRD 5.2 p. 47-48 (2024) -------
// 2014: 5 rows, byte-identical transcriptions of fighter.ts's old
// FIGHTER_FEATURES. 2024: 13 rows (not the 8 the pre-arbiter issue draft
// implied) — Weapon Mastery and Fighting Style are text rows this issue owns
// even though their MECHANICS are #1138/#1137's; Extra Attack decomposes into
// three separately-named/leveled 2024 features instead of one feature whose
// text describes all three tiers.
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
    // SRD 5.2 p. 47: a Fighting Style FEAT, not a class-feature menu, and
    // retrainable on every Fighter level gained. Only carries the four
    // Fighting Style feats SRD 5.2 itself has (Archery, Defense, Great Weapon
    // Fighting, Two-Weapon Fighting) — Dueling/Protection are 2014-only, and
    // the wider PHB'24 feat list is unverified (do not widen this text).
    description:
      "You gain a Fighting Style feat of your choice: Archery, Defense, Great Weapon Fighting, or Two-Weapon Fighting. Whenever you gain a Fighter level, you can replace the feat you chose with a different Fighting Style feat.",
  },
  {
    subclassSlug: null,
    name: "Second Wind",
    level: 1,
    edition: "EDITION_2014",
    description: "As a bonus action, regain 1d10 + your fighter level HP. Regain use on a short or long rest.",
  },
  {
    subclassSlug: null,
    name: "Second Wind",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2 p. 48. Uses 2/3/4 at L1/4/10 and the shortRestRegain: 1 partial
    // top-up live in fighter.ts's resourceFn (#1499/#1221) — this row is text
    // only, and its description states the same rule the pool descriptor
    // enforces mechanically.
    description:
      "As a Bonus Action, regain Hit Points equal to 1d10 plus your Fighter level. You have 2 uses of this feature (3 at level 4, 4 at level 10). You regain one expended use when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest.",
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
  },
  {
    subclassSlug: null,
    name: "Action Surge",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2 p. 48. Recharge is "Short or Long Rest" in BOTH editions — NOT
    // the #1221 partial shape (only Second Wind is). The live recharge bug
    // (today's resourceFn says "shortRest" only, in both editions) is fixed
    // in fighter.ts, not here.
    description:
      "Take one additional action on your turn, except the Magic action. Regain your use of this feature on a Short or Long Rest. You have 2 uses starting at level 17, but only once on a turn.",
  },
  {
    subclassSlug: null,
    name: "Tactical Mind",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2 p. 48. The use-not-expended-on-failure wrinkle has no
    // AbilityCost/EffectSpec shape yet (#1528's problem) — text only here.
    description:
      "When you fail an ability check, you can expend a use of your Second Wind to roll 1d10 and add the number rolled to the check, potentially turning failure into success. If the check still fails, this use of Second Wind isn't expended.",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    edition: "EDITION_2014",
    description: "You can attack twice when taking the Attack action. Three times at level 11; four times at level 20.",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2 p. 48. 2024 decomposes the L11/L20 tiers into their own named
    // features below (Two/Three Extra Attacks) instead of folding them into
    // this row's text — transcribe the document as structured, don't
    // recombine it. Consequence for #1530: derivedStat/derivedStatTiers
    // attach to THIS row; the L11/L20 rows stay text-only.
    description: "You can attack twice instead of once whenever you take the Attack action on your turn.",
  },
  {
    subclassSlug: null,
    name: "Tactical Shift",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2 p. 48. Trigger is the Second Wind BONUS ACTION heal itself, not
    // a Tactical Mind use — stated explicitly since it's easy to conflate.
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
    // SRD 5.2 p. 48. 2014 keeps a plain ASI at 19 instead (already covered by
    // the edition-invariant ASI-level table, not a ClassFeature row). The
    // feat system itself is deferred — text only.
    description: "You gain an Epic Boon feat of your choice (Boon of Combat Prowess recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Three Extra Attacks",
    level: 20,
    edition: "EDITION_2024",
    description: "You can attack four times whenever you take the Attack action on your turn.",
  },
];

// ---- Champion — SRD 5.1 p. 25 (2014) / SRD 5.2 p. 49 (2024) ---------------
const CHAMPION_SLUG = slug("fighter-champion");
const CHAMPION_RAW: RawFighterFeature[] = [
  {
    subclassSlug: CHAMPION_SLUG,
    name: "Improved Critical",
    level: 3,
    edition: "EDITION_2014",
    description: "Your weapon attacks score a critical hit on a roll of 19 or 20.",
  },
  {
    subclassSlug: CHAMPION_SLUG,
    name: "Improved Critical",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2 p. 49: extends the crit range to Unarmed Strikes too. Crit
    // RANGE itself is an edition-invariant derivedStat axis (#1120); this row
    // is the text a 2024 Champion's sheet shows.
    description: "Your weapon attacks and Unarmed Strikes score a critical hit on a roll of 19 or 20.",
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
    // SRD 5.2 p. 49: level-shifts 7 -> 3 AND is a full rewrite (Initiative +
    // Athletics advantage, post-crit half-Speed move) — a wholly different
    // mechanic under the same name, not an edit of the 2014 row (which stays
    // at L7, untouched). #1124's half-proficiency implementation is the 2014
    // row's mechanics, not a 2024 gap.
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
    // SRD 5.2 p. 49: level-shifts 10 -> 7; grants another Fighting Style FEAT
    // (base's #1137 feat-partition, not a class-feature menu option).
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
    // SRD 5.2 p. 49: two named benefits. Defy Death's 18-20 COUNTS AS a 20
    // outright (not merely advantage); Heroic Rally requires Bloodied AND >=1
    // HP — the same threshold the 2014 row states as "no more than half your
    // hit points left", pre-Bloodied vocabulary.
    description:
      "Defy Death: you have Advantage on Death Saving Throws, and rolling 18-20 on one counts as a 20 outright. Heroic Rally: at the start of each of your turns, regain Hit Points equal to 5 plus your Constitution modifier while you are Bloodied and have at least 1 Hit Point.",
  },
];

// ---- Battle Master — PHB'24 (mirror-sourced; not in SRD 5.2 — the subclass ---
// ---- appears in neither SRD). 2014: SRD 5.1 p. 25. -------------------------
// Mirrors: dnd2024.wikidot.com/fighter:battle-master and Roll20's licensed
// compendium agree verbatim; no first-party SRD text exists for this
// subclass in either edition, so it is never cited as "SRD 5.2".
const BATTLE_MASTER_SLUG = slug("fighter-battle-master");
const BATTLE_MASTER_RAW: RawFighterFeature[] = [
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Combat Superiority",
    level: 3,
    edition: "EDITION_2014",
    description:
      "You learn maneuvers fueled by superiority dice (d8s). You have 4 dice and regain all expended dice on a short or long rest. Maneuvers can only be used once per attack unless otherwise stated.",
  },
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Combat Superiority",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). No numeric change from 2014 —
    // 4/5/6 dice at L3/7/15, d8 base, all restored on a short or long rest,
    // maneuvers known 3/5/7/9 at L3/7/10/15, DC 8 + PB + max(Str, Dex) — only
    // the maneuver CATALOG changed (out of scope, #1138-adjacent). Still
    // authored as its own 2024 row: the text is transcribed from a different
    // document than the 2014 row (mirror vs SRD 5.1), which forks even where
    // the mechanics agree (CLAUDE.md's ACTIONS precedent).
    description:
      "You learn maneuvers fueled by Superiority Dice. You have 4 d8s (5 at level 7, 6 at level 15), and you know 3 maneuvers (5 at level 7, 7 at level 10, 9 at level 15). The save DC for a maneuver that requires one equals 8 + your Proficiency Bonus + your Strength or Dexterity modifier. You regain all expended dice on a short or long rest.",
  },
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Student of War",
    level: 3,
    edition: "EDITION_2014",
    description: "You gain proficiency with one type of artisan's tools of your choice.",
  },
  {
    subclassSlug: BATTLE_MASTER_SLUG,
    name: "Student of War",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). Adds a skill choice from the
    // Fighter's level-1 list, which gained Persuasion in 2024 (SRD 5.2 p.
    // 47). The skill grant's mechanics (a second choice-count) are out of
    // scope — text row only.
    description:
      "You gain proficiency with one type of artisan's tools of your choice, and you gain proficiency in one skill of your choice from the Fighter's level 1 skill list.",
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
    // level: a Bonus Action, ranged, in-combat-usable probe with a
    // once-per-Long-Rest cap (restorable by spending a Superiority Die),
    // replacing 2014's uncapped 1-minute out-of-combat comparison.
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
    // PHB'24 (mirror-sourced; not in SRD 5.2). Unchanged name and level from
    // the 2014 row (2024 splits the d12 step out to its own L18 feature
    // instead — see Ultimate Combat Superiority below).
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
    // PHB'24 (mirror-sourced; not in SRD 5.2). Total rewrite: a once-per-turn
    // maneuver-cost substitute (flat 1d8, regardless of current Superiority
    // Die size) replacing 2014's initiative-triggered refund. The spend-path
    // behavior change (castManeuver's cost path) is a follow-up — text only
    // here.
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
    // PHB'24 (mirror-sourced; not in SRD 5.2). Renamed from the 2014 row's
    // "Improved Combat Superiority (d12)" — a DIFFERENT name at the same
    // level, so this does not pair with the 2014 row as a same-name fork (the
    // migration test's KNOWN_FORKED_NAMES check never sees it; the edition-
    // tagged-feature ledger doesn't either — see feature-edition.test.ts's
    // comment on this exact row). PHB'14 folds this d12 step into its L10
    // feature's own text rather than a separate L18 feature; today's 2014
    // rows split it — left as-is on purpose (#1227: changing it would break
    // "2014 serializes identically").
    description: "Your Superiority Dice turn into d12s.",
  },
];

// ---- Eldritch Knight — PARKED (#1531) --------------------------------------
// Research could not verify PHB'24's Eldritch Knight text against any
// first-party source (unlike Battle Master, no independent mirrors agreed).
// Authoring unverified text as "real 2024 content" is exactly the failure
// this issue exists to end, so no EDITION_2024-tagged row is authored here —
// every row below is UNTAGGED (`edition` omitted), meaning expand() seeds the
// SAME (byte-identical, from fighter.ts's old ELDRITCH_KNIGHT_FEATURES) text
// for both editions. This is the one Fighter subclass EDITIONS_STILL_IDENTICAL's
// removal comment (seed-class-features.ts) discloses as a residual — do not
// read Fighter's removal from that ratchet as "all of Fighter's 2024 text is
// verified". #1531 owns authoring EK's real 2024 text.
const ELDRITCH_KNIGHT_SLUG = slug("fighter-eldritch-knight");
const ELDRITCH_KNIGHT_RAW: RawFighterFeature[] = [
  {
    subclassSlug: ELDRITCH_KNIGHT_SLUG,
    name: "Eldritch Knight Spellcasting",
    level: 3,
    description:
      "You learn spells from the wizard list (primarily abjuration and evocation), casting with Intelligence. Third-caster progression: spell slots start at level 3. You know cantrips and a limited number of spells.",
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
