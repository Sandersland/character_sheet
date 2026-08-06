// --- Fighter ClassFeature rows, authored as LITERAL data (#1227) -----------
// The pilot for #1522's "content is data" direction: Fighter's rows no longer
// derive from lib/classes/fighter.ts's AuthoredFeature[] arrays. That module
// stayed alive only for its resourceFn/deriveExtras/subclass-registration
// stubs (retired piecemeal by #1528/#1546) until #1532 deleted it outright,
// once nothing depended on it any more — they are transcribed/authored
// directly here, once, in their final DB-row shape. class-features.ts
// concatenates FIGHTER_FEATURES onto the eleven still-derived classes' rows
// to build CLASS_FEATURES; see
// its LITERAL_ROW_CLASSES export for the set of classes (today: just this
// one) whose rows tests must not compare against a TS-array "old" side.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file.
// expand() below is pure content assembly, not seeding logic — the same
// shape class-features.ts's own expandFeatureRow/collectRawFeatures already
// establishes in this same directory.
//
// SCOPE (#1227) then #1528 then #1530 then #1120: #1227 authored Fighter's
// FEATURE TEXT only, with every descriptor column left NULL (resource pools
// stayed in fighter.ts's resourceFn, every activation in classes/actions.ts's
// DERIVED_ACTIONS). #1528 populated the base class's resource+activation+
// cost+effect columns for Second Wind/Action Surge/Indomitable (the pilot's
// proof-of-authoring) and retired the matching resourceFn/DERIVED_ACTIONS
// entries — see fighter.ts's own header. #1530 populated the base class's L5
// Extra Attack row's derivedStat/derivedStatTiers (see that row's own comment
// below). #1120 populated Champion's Improved Critical row with the
// critRange derivedStat. Every OTHER row below (Battle Master/Eldritch
// Knight, and Fighting Style/Weapon Mastery on the base, Champion's own
// Remarkable Athlete/Additional Fighting Style/Heroic Warrior/Survivor) still
// leaves its descriptor columns NULL: some because the feature has no such
// axis (a passive), some because it isn't done yet (Tactical Mind's
// conditional-refund wrinkle has no AbilityCost shape yet) — see each row's
// own comment for which.
//
// EDITION RULE: `edition` omitted -> expand() seeds ONE row per edition with
// IDENTICAL text (the 2014-is-a-transcription invariant; today that's only
// Eldritch Knight, parked below). `edition` set -> exactly the one row named.
// A 2014 row's text is NEVER edited by this issue for any reason other than
// the #1221 short-rest-recharge fix (which lives on Second Wind/Action
// Surge's own resourceRecharge/resourceTotals columns below, #1528 — no
// top-level resourceFn remains in fighter.ts to hold it) — every EDITION_2014
// row below is a byte-identical copy of what
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
  // ---- Descriptor columns (#1528/#1530/#1546) — resourceKey through
  // ---- saveDcAbilities below are populated only for Second Wind/Action
  // ---- Surge/Indomitable (#1528), Extra Attack (#1530), and Combat
  // ---- Superiority/Student of War (#1546 Part B); every other row leaves
  // ---- these undefined, which `expand()` passes straight through as
  // ---- `undefined` (never writing a stray `null`/`Prisma.DbNull` override
  // ---- for a row this issue doesn't touch).
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: number; shortRestRegain?: number }[];
  resourceDieTiers?: { minLevel: number; die: string }[];
  activationCost?: string;
  resolverKind?: string;
  costKind?: string;
  costPoolKey?: string;
  costBase?: number;
  effectKind?: string;
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifierSource?: string;
  // #1530: populated on the base class's L5 "Extra Attack" row (both
  // editions) — Two/Three Extra Attacks stay text-only, see that row's own
  // comment for why. #1546 Part B: ALSO populated on Combat Superiority
  // (maneuverChoiceCount) and Student of War (toolProfChoiceCount) — see
  // each row's own comment.
  derivedStat?: string;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  // #1546 Part B: the ability list Combat Superiority's maneuverSaveDC is
  // computed from (8 + PB + max of these). Deliberately NOT matched against
  // `derivedStat` by name — see class-feature-rows.ts's
  // saveDcAbilitiesFromRows for why the same row needs both axes at once.
  saveDcAbilities?: string[];
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

// ---- Base class — SRD 5.1 p. 23-24 (2014) / SRD 5.2 p. 47-48 (2024) -------
// 2014: 5 rows, byte-identical transcriptions of fighter.ts's old
// FIGHTER_FEATURES. 2024: 13 rows (not the 8 the pre-arbiter issue draft
// implied) — Weapon Mastery and Fighting Style are text rows this issue owns
// even though their MECHANICS are #1138/#1137's; Extra Attack decomposes into
// three separately-named/leveled 2024 features instead of one feature whose
// text describes all three tiers.
// Every row below EXCEPT Second Wind/Action Surge/Indomitable (populated
// above) and Extra Attack (populated by #1530, see that row below) leaves
// every descriptor column NULL because the feature has NO SUCH AXIS:
// Fighting Style/Weapon Mastery/Tactical Shift/Studied Attacks/Epic Boon/
// Tactical Master are all passive text or feat grants with no resource pool,
// no clickable action, and no roll this app computes. Two Extra Attacks and
// Three Extra Attacks are the SAME no-such-axis NULL for a more specific
// reason: their tier is already carried by the L5 Extra Attack row's
// derivedStatTiers (#1528's decision, populated by #1530) — attaching a
// second copy here would need deriveAttacksPerAction to dedupe instead of
// simply composing, for no benefit, since these rows have no `level` of
// their own left to gate anything else. Extra Attack (L5) is the one row
// per edition that sets derivedStat/derivedStatTiers — byte-identical across
// both, since the tier progression is edition-invariant even though the row
// SHAPE (one row vs three) forks. Tactical Mind is the last "not done yet"
// row: its conditional not-expended-on-failure refund has no AbilityCost
// shape (see its own comment below).
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
    // #1528: resourceFn's pools moved onto this row. SRD 5.1 p. 23 fully
    // resets on EITHER rest (no #1221 partial shape) — "short-or-long" is the
    // #1227 live-bug fix (was "shortRest" only, which never recharged on a
    // long rest despite the feature's own text promising it).
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
    // classLevel: SRD 5.1's "regain 1d10 + your fighter level HP" — the ONE
    // new EffectSpec axis #1528 adds (effectModifierSource), earned by this
    // row + Rally's analogous (out-of-scope) case.
    effectModifierSource: "classLevel",
  },
  {
    subclassSlug: null,
    name: "Second Wind",
    level: 1,
    edition: "EDITION_2024",
    description:
      "As a Bonus Action, regain Hit Points equal to 1d10 plus your Fighter level. You have 2 uses of this feature (3 at level 4, 4 at level 10). You regain one expended use when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest.",
    // #1528: SRD 5.2 p. 48's 2/3/4-at-L1/4/10 tiering plus the #1221 partial
    // short-rest top-up (shortRestRegain: 1 on every tier — it's flat, not
    // level-scaled) now live on this row instead of fighter.ts's resourceFn.
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
    // #1528: genuinely no edition fork on the pool mechanics (SRD 5.1 p. 24 /
    // SRD 5.2 p. 48 both read "you can't do so again until you finish a Short
    // or Long Rest") — "short-or-long" is the #1227 live-bug fix, both
    // editions, unlike Second Wind's genuine 2014/2024 shape difference.
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
    // No effectKind (NULL, "no such axis"): Action Surge is a pure counter —
    // the extra-action grant is a client-side economy effect with no roll/
    // heal to compute, same as before #1528.
  },
  {
    subclassSlug: null,
    name: "Action Surge",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2 p. 48. Recharge is "Short or Long Rest" in BOTH editions — NOT
    // the #1221 partial shape (only Second Wind is). The live recharge bug
    // (was "shortRest" only, in both editions) is fixed by this row's own
    // resourceRecharge: "short-or-long" below (#1528) — no top-level
    // resourceFn remains in fighter.ts to hold it.
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
    // #1530: the full three-tier progression rides THIS row even though 2014
    // describes all three tiers in one feature's text — ascending/last-match-
    // wins (tierAt, class-feature-rows.ts). Byte-identical to the 2024 row's
    // tiers below: the rule is edition-invariant, only the row SHAPE forks.
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
    // SRD 5.2 p. 48. 2024 decomposes the L11/L20 tiers into their own named
    // features below (Two/Three Extra Attacks) instead of folding them into
    // this row's text — transcribe the document as structured, don't
    // recombine it. Consequence for #1530: derivedStat/derivedStatTiers
    // attach to THIS row; the L11/L20 rows stay text-only (see their own
    // comments below for why NULL there is "no such axis", not "not done
    // yet").
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
    // #1528: resource block only — no activationCost/resolverKind/cost*/
    // effect* ("no such axis"): Indomitable was never a DERIVED_ACTIONS entry
    // (it has no action-economy cost; it's a reactive reroll the player
    // narrates, not a button this app dispatches through the actions
    // endpoint), so there is no activation to populate here, before or after
    // #1528.
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
    // derivedStat/derivedStatTiers NULL here because there is NO SUCH AXIS on
    // THIS row (#1530): the count this row's text describes is already
    // carried by the L5 "Extra Attack" row's derivedStatTiers, which has this
    // row's own level (11) as one of its tiers. A second derivedStat here
    // would have deriveAttacksPerAction take the max of two rows describing
    // the SAME number, not a new one — never "not done yet".
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
    // NULL for the same reason as Two Extra Attacks above: no such axis on
    // THIS row — the L5 Extra Attack row's derivedStatTiers already carries
    // level 20's value.
  },
];

// ---- Champion — SRD 5.1 p. 25 (2014) / SRD 5.2 p. 49 (2024) ---------------
// Remarkable Athlete / Additional Fighting Style / Heroic Warrior / Survivor
// have NO SUCH AXIS (passive text with no roll/pool/action this app
// computes) and leave every descriptor column NULL. Improved Critical /
// Superior Critical are #1120: crit range is edition-invariant (identical
// level AND threshold in both editions, verified against both source docs),
// so both rows carry the SAME derivedStat/derivedStatTiers regardless of
// `edition` — only their TEXT forks (2024 additionally covers Unarmed
// Strikes). Both tiers ride the "Improved Critical" row's own
// derivedStatTiers (minLevel 3 -> 19, minLevel 15 -> 18); "Superior Critical"
// stays text-only, the same shape "Improved Combat Superiority (d10)/(d12)"
// use below for their own die-size bump — a second row on this axis would
// need deriveCritRange to take a cross-row MIN rather than
// deriveAttacksPerAction's MAX, which one row's own last-match-wins tier
// array already resolves without any cross-row aggregation.
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
    // SRD 5.2 p. 49: extends the crit range to Unarmed Strikes too. Crit
    // RANGE itself is an edition-invariant derivedStat axis (#1120) — text
    // forks, mechanics don't.
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
// #1546 Part B: Combat Superiority and Student of War are DONE now — the
// superiority-dice pool (resourceKey/resourceTotals/resourceDieTiers), the
// maneuver-choice count (derivedStat/derivedStatTiers), the tool-choice count
// (Student of War's own derivedStat/derivedStatTiers), and the maneuver save
// DC (saveDcAbilities, resolved by lib/srd/announced-save-dc.ts) are all row
// data — the "no tier array expresses a computed DC" blocker Finding 2
// disproved: the OLD resourceFn's pool description was a computed string
// embedding the DC, but that string is dead (nothing renders
// ResourcePool.description — the wire DC comes from the #1316
// `maneuvers.saveDC` rider instead), so the row's own authored `description`
// text (below) simply replaces it, and the DC itself moved to a dedicated
// column + resolver rather than a tier. Know Your Enemy / Improved Combat
// Superiority / Relentless / Ultimate Combat Superiority still have NO SUCH
// AXIS (passive text/proficiency grants with no clickable action this app
// dispatches — maneuvers themselves are their own GrantedAbility catalog,
// castManeuver/maneuvers.ts, not ClassFeature rows at all).
const BATTLE_MASTER_SLUG = slug("fighter-battle-master");

// #1546 Part B: dice 4/5/6 @ L3/7/15, die d8/d10/d12 @ L3/10/18, maneuvers
// known 3/5/7/9 @ L3/7/10/15, DC 8 + PB + max(Str, Dex) — edition-invariant
// (PHB'14 p.73), byte-identical between the 2014 and 2024 Combat Superiority
// rows; only each row's TEXT forks (transcribed from a different document —
// CLAUDE.md's ACTIONS precedent). Extracted to one object spread into both
// rows below rather than authored twice — a fallow duplication finding on two
// literal copies of this exact block, not a suppression.
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
    // 4/5/6 dice at L3/7/15, d8 base, all restored on a short or long rest,
    // maneuvers known 3/5/7/9 at L3/7/10/15, DC 8 + PB + max(Str, Dex) — only
    // the maneuver CATALOG changed (out of scope, #1138-adjacent). Still
    // authored as its own 2024 row: the text is transcribed from a different
    // document than the 2014 row (mirror vs SRD 5.1), which forks even where
    // the mechanics agree (CLAUDE.md's ACTIONS precedent).
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
    // #1546 Part B: flat 1 from L3 (the subclass grant level), edition-invariant.
    derivedStat: "toolProfChoiceCount",
    derivedStatTiers: [{ minLevel: 3, value: 1 }],
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
// verified". #1531 owns authoring EK's real 2024 text. Every row below also
// leaves every descriptor column NULL — NOT DONE YET for all six, not NO SUCH
// AXIS: unlike Champion/Battle Master above, EK's own rows (Eldritch Strike's
// on-hit rider, War Magic/Improved War Magic's bonus-action attack trigger)
// plausibly need real resource/activation/effect columns of their own, so
// #1531 owns descriptor population here too, alongside EK's verified 2024
// text — none of it is authored ahead of that pass.
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
