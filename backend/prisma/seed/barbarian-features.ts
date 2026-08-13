// --- Barbarian ClassFeature rows, authored as LITERAL data (#1223) ---------
// Commit 1 of 3 (mirrors Fighter's pilot, #1227/#1528/#1532) moved these rows
// off lib/classes/barbarian.ts's AuthoredFeature[] arrays into literal seed
// data, byte-identical to the old TS-derived text (pinned by
// barbarian-2014-snapshot.test.ts). Commit 2 authored Barbarian's REAL SRD
// 5.2 (2024) content, transcribed from the parsed progression table + full
// extracted SRD 5.2 text researched for this issue — never from "the 2014
// text with a coat of paint". Commit 3 (this one) moves Rage's resource pool
// onto its two rows (see the RESOURCE POOL block below) and deletes
// lib/classes/barbarian.ts outright, now that nothing depends on it.
// class-features.ts concatenates BARBARIAN_FEATURES onto the still-derived
// classes' rows to build CLASS_FEATURES; see its LITERAL_ROW_CLASSES export
// for the set of classes whose rows tests must not compare against a
// TS-array "old" side.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE (mirrors fighter-features.ts): `edition` omitted -> expand()
// seeds ONE row per edition with IDENTICAL text — reserved for the handful of
// features that are genuinely edition-invariant in both mechanics AND
// wording (Extra Attack, Fast Movement below). `edition` set -> exactly the
// one row named; a "removed in 2024" feature (Brutal Critical, every Totem
// Warrior row) means NOT authoring a 2024 row for that name, never deleting
// the 2014 row, and a level-shift (Berserker's Retaliation 14->10,
// Intimidating Presence 10->14) is two rows with two `level` values, never
// one row edited in place. Every EDITION_2014 row below stays byte-identical
// to what commit 1 pinned (barbarian-2014-snapshot.test.ts) — this commit
// only ever ADDS an `edition: "EDITION_2024"` (or, for Totem Warrior,
// "EDITION_2014") tag alongside new 2024 text; it never edits a 2014 row's
// own name/level/description.
//
// RESOURCE POOL (commit 3 of 3, mirrors Fighter's #1227 -> #1528 two-step):
// Rage's uses-per-rest total/recharge now live on both Rage rows'
// resourceKey/resourceLabel/resourceRecharge/resourceTotals below, replacing
// lib/classes/barbarian.ts's resourceFn (rageCountForLevel), which this same
// commit deletes. SRD 5.1 grants unlimited Rages at level 20 (encoded as 99,
// same as the retired resourceFn did); SRD 5.2 caps at 6 from level 17 on —
// the headline bug this issue fixes (today a level-20 2024 Barbarian
// resolves the 2014 table and is told "Unlimited uses at level 20"). #1528's
// "no-second-string" rule (poolFromRow reads the row's own `description`,
// never a second hand-written pool string) means the 2014 Rage pool's
// description is now this row's feature text below, which no longer mentions
// "Regain all rages on a long rest." or "Unlimited uses at level 20." — those
// sentences lived only in the retired resourceFn string, not in the
// byte-identical-pinned row text (barbarian-2014-snapshot.test.ts), so
// dropping them is this commit's accepted, intended consequence, not a
// regression to fix.
//
// ACTIVATION + BUFF (#1686): Rage's DERIVED_ACTIONS "rage"/"endRage" pair and
// ACTION_EFFECT_FN.rage's hand-rolled resistDamageTypes/rollEffects/tiered
// modifier closure are RETIRED — both Rage rows below now carry
// activationCost/resolverKind ("toggle") + a costKind/costPoolKey/costBase
// block (paying 1 use from the row's own "rage" pool) + one `effectBuffs`
// entry whose `modifier` is the +2/+3/+4 tier array evaluateBuffModifier
// resolves. This is the "buff-granting subclass is authorable as seed rows"
// proof #1686 exists for — see toggleActionsFromRow/toggleRowOps
// (lib/classes/actions.ts) for the generic engine this data drives.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { ActionCost } from "../../src/lib/classes/actions.js";
import type { EffectBuffRow } from "../../src/lib/classes/class-feature-rows.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list (mirrors fighter-features.ts's slug()).
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`barbarian-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawBarbarianFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions (see file header). */
  edition?: SeedEdition;
  // #1530 carryover: the base class's L5 "Extra Attack" row is the only row
  // this commit populates a descriptor column on — it was already set on
  // barbarian.ts's AuthoredFeature entry (class-features.ts's expandFeatureRow
  // read it from there before this migration), so dropping it here would be a
  // silent regression in deriveAttacksPerAction, not a neutral move. Every
  // other row leaves this undefined — no other Barbarian feature has this
  // axis.
  derivedStat?: string;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  // Rage's resource-pool descriptor columns (#1223 commit 3) — see this
  // file's own header for why only Rage's two rows below ever set these.
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: number; shortRestRegain?: number }[];
  // Rage's activation block (#1686) — see this file's own header for why
  // only Rage's two rows below ever set these.
  activationCost?: ActionCost;
  resolverKind?: "toggle";
  costKind?: "pool" | "none";
  costPoolKey?: string;
  costBase?: number;
  effectBuffs?: EffectBuffRow[];
  // Mindless Rage's own while-raging condition immunity (#1121) — see this
  // file's own header for why only its two rows below ever set these.
  conditionImmunities?: string[];
  conditionImmunitiesRequireActiveBuff?: string;
  conditionImmunitiesOnBuffStart?: "clear" | "suspend";
}

function expand(raw: RawBarbarianFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Barbarian",
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
    activationCost: raw.activationCost,
    resolverKind: raw.resolverKind,
    costKind: raw.costKind,
    costPoolKey: raw.costPoolKey,
    costBase: raw.costBase,
    effectBuffs: raw.effectBuffs,
    conditionImmunities: raw.conditionImmunities,
    conditionImmunitiesRequireActiveBuff: raw.conditionImmunitiesRequireActiveBuff,
    conditionImmunitiesOnBuffStart: raw.conditionImmunitiesOnBuffStart,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// Rage's damage-bonus tier array (#1686) — the +2/+3/+4-by-barbarian-level
// progression, identical in both editions (SRD 5.1 p.21 / SRD 5.2 p.20),
// evaluated by evaluateBuffModifier off the granting entry's own level. One
// shared constant so the 2014/2024 rows below can't drift on the tiers
// themselves even though their surrounding buff (resist types, roll effects)
// stays authored per row.
const RAGE_DAMAGE_TIERS = [
  { minLevel: 1, value: 2 },
  { minLevel: 9, value: 3 },
  { minLevel: 16, value: 4 },
] as const;

// The while-active buff itself (#1686) — edition-invariant: both SRD 5.1
// p.21 and SRD 5.2 p.20 grant the identical b/p/s resistance + Strength
// check/save advantage + level-tiered melee-damage bonus while raging.
function rageBuff(): EffectBuffRow[] {
  return [
    {
      key: "rage",
      target: "meleeDamage",
      modifier: [...RAGE_DAMAGE_TIERS],
      duration: "while-active",
      resistDamageTypes: ["bludgeoning", "piercing", "slashing"],
      rollEffects: [
        { mode: "advantage", kind: "check", ability: "strength" },
        { mode: "advantage", kind: "save", ability: "strength" },
      ],
    },
  ];
}

// ---- Base class — SRD 5.1 Barbarian (2014) / SRD 5.2 Barbarian (2024) -----
// 2014: 12 rows (byte-identical to commit 1 / barbarian-2014-snapshot.test.ts).
// 2024: 17 rows — Brutal Critical has no 2024 successor (removed, not
// deleted — its 2014 row stays), and six wholly new 2024 features join
// (Weapon Mastery, Primal Knowledge, Instinctive Pounce, Brutal Strike,
// Improved Brutal Strike, Epic Boon). Extra Attack and Fast Movement are the
// only two features left UNTAGGED: both are edition-invariant in mechanics
// AND wording (SRD 5.2's own phrasing carries no rules delta from SRD 5.1
// here), so one shared row is authored rather than two paraphrases of the
// same sentence.
const BARBARIAN_BASE_RAW: RawBarbarianFeature[] = [
  {
    subclassSlug: null,
    name: "Rage",
    level: 1,
    edition: "EDITION_2014",
    description:
      "As a bonus action, enter a rage lasting up to 1 minute. You gain advantage on Strength checks and saves, a bonus to melee damage (+2 at L1; +3 at L9; +4 at L16), and resistance to bludgeoning, piercing, and slashing damage. You can't cast or concentrate on spells while raging.",
    // #1223 commit 3: reproduces rageCountForLevel's old table exactly — 2/3/4/
    // 5/6 at L1/3/6/12/17, then unlimited (encoded as 99, matching the retired
    // resourceFn) at L20. SRD 5.1 p.21 recharges on a long rest only — no
    // shortRestRegain on any tier.
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
    // #1686: activation pays 1 use from this row's OWN "rage" pool (the
    // resourceTotals above) — costPoolKey equals resourceKey here because
    // Rage spends its own dedicated pool, unlike a shared-pool toggle
    // (Elemental Attunement spends the monk's shared "focus" pool instead).
    activationCost: "bonusAction",
    resolverKind: "toggle",
    costKind: "pool",
    costPoolKey: "rage",
    costBase: 1,
    effectBuffs: rageBuff(),
  },
  {
    subclassSlug: null,
    name: "Rage",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2: a full rewrite of Rage's shape — Bonus Action gated on not
    // wearing Heavy armor, Rage Damage applies to ANY Strength attack (weapon
    // or Unarmed Strike, not just melee), and duration is no longer a flat
    // "1 minute": it ends at the end of your next turn unless extended by an
    // attack roll, forcing a save, or a further Bonus Action, capped at 10
    // minutes total. Recharge also changes (short-rest partial regain is new,
    // #1223 research) — the pool ITSELF (uses-per-rest count) stays off this
    // row; see the file header for why.
    description:
      "As a Bonus Action, enter a Rage if you aren't wearing Heavy armor. While raging, you have Resistance to Bludgeoning, Piercing, and Slashing damage, Advantage on Strength checks and saving throws, and a bonus to damage when you attack using Strength with a weapon or an Unarmed Strike (the Rage Damage column); you can't cast spells or maintain Concentration. The Rage lasts until the end of your next turn, ending early if you don Heavy armor or have the Incapacitated condition, and extends another round if you make an attack roll, force a saving throw, or take a Bonus Action to extend it — for up to 10 minutes total. You regain one expended use on a Short Rest and all expended uses on a Long Rest.",
    // #1223 commit 3: SRD 5.2 p.20 caps Rages at 6 from level 17 on — NO L20
    // tier (unlike the 2014 row above), which is the headline bug this issue
    // fixes (today a level-20 2024 Barbarian resolves the 2014 resourceFn's
    // 99 and is told "Unlimited uses at level 20"). shortRestRegain: 1 on
    // every tier is the row-object-carried #1221 partial short-rest top-up
    // (class-feature-rows.ts's ResourceTotalTier) — "regain one expended use
    // on a Short Rest, and all on a Long Rest" (SRD 5.2 p.20).
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
    // #1686 — see the 2014 row above for why costPoolKey === resourceKey.
    activationCost: "bonusAction",
    resolverKind: "toggle",
    costKind: "pool",
    costPoolKey: "rage",
    costBase: 1,
    effectBuffs: rageBuff(),
  },
  {
    subclassSlug: null,
    name: "Unarmored Defense",
    level: 1,
    edition: "EDITION_2014",
    description: "While not wearing armor, your AC equals 10 + your Dexterity modifier + your Constitution modifier. You may use a shield.",
  },
  {
    subclassSlug: null,
    name: "Unarmored Defense",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2: same mechanics as 2014 (10 + Dex + Con, Shield allowed), but
    // transcribed from a different document — forks even where the rule
    // agrees (CLAUDE.md's ACTIONS precedent; #1223 research flagged this row
    // explicitly as needing its own 2024 text).
    description: "While you aren't wearing any armor, your base Armor Class equals 10 plus your Dexterity modifier and your Constitution modifier. You can still gain this benefit while using a Shield.",
  },
  {
    subclassSlug: null,
    name: "Weapon Mastery",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart. Mastery-property mechanics
    // are #1138's; this is the level-1 feature TEXT a 2024 Barbarian's sheet
    // must not omit (mirrors fighter-features.ts's own Weapon Mastery row).
    description:
      "You use the mastery properties of two kinds of Simple or Martial Melee weapons of your choice (3 at level 4, 4 at level 10). Whenever you finish a Long Rest, you can change one of those weapon choices.",
  },
  {
    subclassSlug: null,
    name: "Reckless Attack",
    level: 2,
    edition: "EDITION_2014",
    description:
      "When making your first attack on your turn, you may attack recklessly: you have advantage on melee weapon attack rolls using Strength this turn, but attack rolls against you also have advantage until your next turn.",
    // Row-driven action (#1912) — a pure economy reminder, no resource cost
    // (advantage/disadvantage is tracked by the table, not this app).
    resourceKey: "recklessAttack",
    activationCost: "free",
  },
  {
    subclassSlug: null,
    name: "Reckless Attack",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2: widens from melee WEAPON attack rolls using Strength to any
    // attack roll using Strength — Unarmed Strikes and thrown/ranged Strength
    // attacks now qualify too (#1223 research; the issue's own checklist
    // never mentions this delta).
    description:
      "When you make your first attack roll on your turn, you can attack recklessly, giving you Advantage on attack rolls using Strength until the start of your next turn — but attack rolls against you also have Advantage during that time.",
    resourceKey: "recklessAttack",
    activationCost: "free",
  },
  {
    subclassSlug: null,
    name: "Danger Sense",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You have advantage on Dexterity saving throws against effects that you can see, such as traps and spells. Doesn't apply when blinded, deafened, or incapacitated.",
  },
  {
    subclassSlug: null,
    name: "Danger Sense",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2: drops the "effects you can see" / blinded-deafened carve-outs
    // for a flat unless-Incapacitated form (#1223 research; unmentioned by
    // the issue's own checklist).
    description: "You have Advantage on Dexterity saving throws unless you have the Incapacitated condition.",
  },
  {
    subclassSlug: null,
    name: "Primal Knowledge",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart. The skill-proficiency grant
    // is real persisted state this row doesn't populate (#1223 research
    // section 6); the Strength-check substitution is text only.
    description:
      "You gain proficiency in another skill from the Barbarian's level 1 skill list. While your Rage is active, you can make an Acrobatics, Intimidation, Perception, Stealth, or Survival check as a Strength check instead of its normal ability.",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    description: "You can attack twice whenever you take the Attack action on your turn.",
    // Edition-invariant (SRD 5.1 / SRD 5.2 Barbarian, Extra Attack) — one flat
    // tier, no further scaling at higher levels (unlike Fighter). Carried over
    // verbatim from barbarian.ts's AuthoredFeature entry (#1530) — see this
    // interface's own comment for why dropping it would regress
    // deriveAttacksPerAction.
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    subclassSlug: null,
    name: "Fast Movement",
    level: 5,
    description: "Your speed increases by 10 feet while you aren't wearing heavy armor.",
  },
  {
    subclassSlug: null,
    name: "Feral Instinct",
    level: 7,
    edition: "EDITION_2014",
    description:
      "You have advantage on initiative rolls. If surprised at the start of combat, you can still act normally on your first turn if you enter your rage before doing anything else.",
  },
  {
    subclassSlug: null,
    name: "Feral Instinct",
    level: 7,
    edition: "EDITION_2024",
    // SRD 5.2: Initiative Advantage only — the surprise-negation clause is
    // 2014-only (#1223 research; unmentioned by the issue's own checklist).
    description: "You have Advantage on Initiative rolls.",
  },
  {
    subclassSlug: null,
    name: "Instinctive Pounce",
    level: 7,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart.
    description: "As part of the Bonus Action you take to enter your Rage, you can move up to half your Speed.",
  },
  {
    subclassSlug: null,
    name: "Brutal Critical",
    level: 9,
    edition: "EDITION_2014",
    description: "You can roll one additional weapon damage die on a critical hit with a melee attack. Two extra dice at level 13, three at level 17.",
  },
  // Brutal Critical has NO EDITION_2024 row — removed in 2024 (Brutal
  // Strike, below, fills its L9 slot instead). "Removed in 2024" means not
  // authoring a 2024 row for this name, never deleting the 2014 row above.
  {
    subclassSlug: null,
    name: "Brutal Strike",
    level: 9,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart. Fills Brutal Critical's L9
    // slot with a wholly different mechanic (a Reckless Attack trade-off, not
    // a crit-die bonus). Effect-menu dispatch (which Brutal Strike option
    // fires) is per-attack player choice, not persisted state — text only.
    description:
      "If you use Reckless Attack, you can forgo Advantage on one Strength-based attack roll that doesn't already have Disadvantage; on a hit, the target takes an extra 1d10 damage of the weapon's or Unarmed Strike's type, and you apply one Brutal Strike effect of your choice: Forceful Blow (push the target 15 feet away, then move up to half your Speed toward it without provoking Opportunity Attacks) or Hamstring Blow (reduce the target's Speed by 15 feet until the start of your next turn — only the most recent Hamstring Blow on a target applies).",
  },
  {
    subclassSlug: null,
    name: "Relentless Rage",
    level: 11,
    edition: "EDITION_2014",
    description:
      "When reduced to 0 HP while raging without dying outright, make a DC 10 Con save (DC +5 each use; resets on a short or long rest) to drop to 1 HP instead.",
  },
  {
    subclassSlug: null,
    name: "Relentless Rage",
    level: 11,
    edition: "EDITION_2024",
    // SRD 5.2: a success sets HP to TWICE your Barbarian level instead of a
    // flat 1 HP (#1223 research; unmentioned by the issue's own checklist).
    // DC progression (+5 per use, resets on a Short or Long Rest) is
    // unchanged from 2014.
    description:
      "If you drop to 0 Hit Points while your Rage is active and don't die outright, you can make a DC 10 Constitution saving throw; on a success, your Hit Points change to twice your Barbarian level instead. The DC increases by 5 each time you use this feature again, resetting to 10 when you finish a Short or Long Rest.",
  },
  // Improved Brutal Strike carries BOTH the L13 grant and the L17 upgrade in
  // ONE row (level 13): SRD 5.2 names the L13 AND L17 features both "Improved
  // Brutal Strike", and ClassFeature's @@unique([classId, subclassId, name,
  // edition]) (NULLS NOT DISTINCT) would reject two rows sharing that name —
  // mirrors the existing 2014 "Brutal Critical" row above, which already
  // states its L13/L17 tiers in one row's text rather than two same-named
  // rows. Do not split this into a second L17 row.
  {
    subclassSlug: null,
    name: "Improved Brutal Strike",
    level: 13,
    edition: "EDITION_2024",
    description:
      "You gain two more Brutal Strike effects: Staggering Blow (the target has Disadvantage on its next saving throw and can't make Opportunity Attacks until the start of your next turn) and Sundering Blow (before the start of your next turn, the next attack roll against the target from another creature gains a +5 bonus — only one Sundering Blow bonus applies per attack roll). At level 17, your Brutal Strike's extra damage increases to 2d10, and you can apply two different Brutal Strike effects at once.",
  },
  {
    subclassSlug: null,
    name: "Persistent Rage",
    level: 15,
    edition: "EDITION_2014",
    description: "Your rage ends early only if you fall unconscious or choose to end it.",
  },
  {
    subclassSlug: null,
    name: "Persistent Rage",
    level: 15,
    edition: "EDITION_2024",
    // SRD 5.2: a full rewrite — a once-per-Long-Rest regain-all-uses trigger
    // on rolling Initiative (new), a flat 10-minute Rage with no round-to-
    // round extension needed, ending early only on the Unconscious condition
    // (not merely Incapacitated) or donning Heavy armor.
    description:
      "When you roll Initiative, you can regain all expended uses of Rage; once you do, you can't do so again until you finish a Long Rest. Your Rage then lasts 10 minutes without needing to be extended round to round, ending early only if you have the Unconscious condition or don Heavy armor.",
  },
  {
    subclassSlug: null,
    name: "Indomitable Might",
    level: 18,
    edition: "EDITION_2014",
    description: "If your total for a Strength check is less than your Strength score, you can use that score in place of the total.",
  },
  {
    subclassSlug: null,
    name: "Indomitable Might",
    level: 18,
    edition: "EDITION_2024",
    // SRD 5.2: now also covers a Strength SAVING THROW, not just a Strength
    // check (#1223 research; unmentioned by the issue's own checklist).
    description: "If your total for a Strength check or Strength saving throw is less than your Strength score, you can use that score in place of the total.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart (2014 keeps a plain ASI at
    // 19 instead, already covered by the edition-invariant ASI-level table,
    // not a ClassFeature row). Mirrors Fighter's own Epic Boon row (#1227);
    // the feat system itself is deferred — text only.
    description: "You gain an Epic Boon feat of your choice (Boon of Irresistible Offense recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Primal Champion",
    level: 20,
    edition: "EDITION_2014",
    description: "Your Strength and Constitution scores each increase by 4, and their maximums become 24.",
  },
  {
    subclassSlug: null,
    name: "Primal Champion",
    level: 20,
    edition: "EDITION_2024",
    // SRD 5.2: the maximum rises to 25, not 24 (#1223 research; unmentioned
    // by the issue's own checklist).
    description: "Your Strength and Constitution scores each increase by 4, to a maximum of 25.",
  },
];

// ---- Path of the Totem Warrior ----------------------------------------------
// 5 rows, ALL tagged EDITION_2014 — no 2024 successor exists (Path of the
// Wild Heart replaces it in PHB'24, out of scope here, #1223 research). "No
// 2024 successor" means authoring ZERO EDITION_2024 rows for this subclass,
// never deleting these five. `Subclass.edition` isn't read by any path today
// (#1223 research finding 5), so a 2024 character choosing this subclass
// still resolves to it and simply sees no subclass features — a known,
// disclosed gap, not something this row set can fix.
const TOTEM_WARRIOR_SLUG = slug("barbarian-totem-warrior");
const TOTEM_WARRIOR_RAW: RawBarbarianFeature[] = [
  {
    subclassSlug: TOTEM_WARRIOR_SLUG,
    name: "Spirit Seeker",
    level: 3,
    edition: "EDITION_2014",
    description: "Gain the ability to cast Beast Sense and Speak with Animals as rituals.",
  },
  {
    subclassSlug: TOTEM_WARRIOR_SLUG,
    name: "Totem Spirit",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Choose a totem animal and gain a benefit while raging. Bear: resistance to all damage except psychic. Eagle: Disengage/Dash as a bonus action; can't be opportunity attacked except by flying creatures. Wolf: allies have advantage on melee attacks against creatures within 5 ft of you.",
  },
  {
    subclassSlug: TOTEM_WARRIOR_SLUG,
    name: "Aspect of the Beast",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Gain a magical benefit from a second totem animal (can be the same or different). Bear: carry twice the weight; advantage on Strength checks. Eagle: see up to 1 mile clearly, dim light as bright. Wolf: hunt with a group; allies can't be tracked when traveling.",
  },
  {
    subclassSlug: TOTEM_WARRIOR_SLUG,
    name: "Spirit Walker",
    level: 10,
    edition: "EDITION_2014",
    description: "Cast the Commune with Nature spell as a ritual.",
  },
  {
    subclassSlug: TOTEM_WARRIOR_SLUG,
    name: "Totemic Attunement",
    level: 14,
    edition: "EDITION_2014",
    description:
      "Gain a benefit from a third totem animal while raging. Bear: threatening presence — enemies within 5 ft have disadvantage on attacks against non-you targets. Eagle: fly speed equal to walking speed. Wolf: knock prone when you hit with melee attack as a bonus action.",
  },
];

// ---- Path of the Berserker --------------------------------------------------
// 2014: 4 rows. 2024: 4 rows, same names, two level shifts (Retaliation
// 14->10, Intimidating Presence 10->14) — each a separate row with its own
// `level`, never one row edited in place.
const BERSERKER_SLUG = slug("barbarian-berserker");
const BERSERKER_RAW: RawBarbarianFeature[] = [
  {
    subclassSlug: BERSERKER_SLUG,
    name: "Frenzy",
    level: 3,
    edition: "EDITION_2014",
    description:
      "When you rage, choose to go into a frenzy. For the rage's duration, make one melee weapon attack as a bonus action on each of your turns. When the rage ends, you suffer one level of exhaustion.",
  },
  {
    subclassSlug: BERSERKER_SLUG,
    name: "Frenzy",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2: no exhaustion cost. Instead of a bonus-action attack each
    // turn, the first Strength-based hit each turn (while Raging and using
    // Reckless Attack) deals extra damage: a number of d6s equal to your Rage
    // Damage bonus (the same edition-invariant +2/+3/+4 progression,
    // actions.ts's rageMeleeDamageBonus — #1223 research finding 4).
    description:
      "If you use Reckless Attack while your Rage is active, the first target you hit on your turn with a Strength-based attack takes extra damage: roll a number of d6s equal to your Rage Damage bonus, of the same type as the weapon or Unarmed Strike used.",
  },
  {
    subclassSlug: BERSERKER_SLUG,
    name: "Mindless Rage",
    level: 6,
    edition: "EDITION_2014",
    description: "You can't be charmed or frightened while raging. If charmed or frightened when you rage, the effect is suspended for the duration.",
    // #1121, PHB'14 p.49: "you can't be charmed or frightened while raging.
    // If you are charmed or frightened when you enter your rage, the effect
    // is suspended for the duration of the rage" — suspend-and-restore, not
    // clear. `conditionImmunitiesRequireActiveBuff: "rage"` names Rage's own
    // effectBuffs key (rageBuff() above); syncConditionImmunityOnBuffToggleInTx
    // (lib/combat/conditions.ts) is where "suspend" is interpreted.
    conditionImmunities: ["charmed", "frightened"],
    conditionImmunitiesRequireActiveBuff: "rage",
    conditionImmunitiesOnBuffStart: "suspend",
  },
  {
    subclassSlug: BERSERKER_SLUG,
    name: "Mindless Rage",
    level: 6,
    edition: "EDITION_2024",
    // SRD 5.2: outright Immunity while Raging (2014 only suspends the
    // condition), and entering Rage ENDS an existing Charmed/Frightened
    // condition rather than merely pausing it.
    description: "You have Immunity to the Charmed and Frightened conditions while your Rage is active, and entering your Rage ends either condition on you.",
    // #1121 — "clear" (not "suspend"): 2024 ends the condition outright, RAW
    // has no restore-on-rage-end clause (contrast the 2014 row above).
    conditionImmunities: ["charmed", "frightened"],
    conditionImmunitiesRequireActiveBuff: "rage",
    conditionImmunitiesOnBuffStart: "clear",
  },
  {
    subclassSlug: BERSERKER_SLUG,
    name: "Intimidating Presence",
    level: 10,
    edition: "EDITION_2014",
    description:
      "As an action, frighten one creature within 30 ft that can see and hear you. It must succeed on a Wisdom save (DC 8 + proficiency + Charisma modifier) or be frightened until the end of your next turn. On a success, the target is immune to this feature for 24 hours.",
  },
  {
    subclassSlug: BERSERKER_SLUG,
    name: "Intimidating Presence",
    level: 14,
    edition: "EDITION_2024",
    // SRD 5.2: level-shifts 10 -> 14 AND is reworked — a Bonus Action (was an
    // Action) hitting every creature of your choice in a 30-foot Emanation
    // (was one creature within 30 ft), DC now Strength-based (was Charisma-
    // based), 1-minute Frightened with a repeating save (was until end of
    // your next turn / immune 24h), restorable once per Long Rest by
    // expending a Rage use.
    description:
      "As a Bonus Action, each creature of your choice in a 30-foot Emanation from you must make a Wisdom saving throw (DC 8 plus your Strength modifier and Proficiency Bonus) or gain the Frightened condition for 1 minute, repeating the save at the end of each of its turns. Once you use this feature, you can't use it again until you finish a Long Rest unless you expend a use of your Rage (no action required) to restore it.",
  },
  {
    subclassSlug: BERSERKER_SLUG,
    name: "Retaliation",
    level: 14,
    edition: "EDITION_2014",
    description: "When you take damage from a creature within 5 ft, use your reaction to make one melee weapon attack against that creature.",
  },
  {
    subclassSlug: BERSERKER_SLUG,
    name: "Retaliation",
    level: 10,
    edition: "EDITION_2024",
    // SRD 5.2: level-shifts 14 -> 10 (fills the slot Intimidating Presence
    // vacated); mechanics unchanged except naming Unarmed Strike explicitly
    // alongside a weapon.
    description: "When you take damage from a creature within 5 feet of you, you can take a Reaction to make one melee attack against that creature, using a weapon or an Unarmed Strike.",
  },
];

export const BARBARIAN_FEATURES: ClassFeatureSeedRow[] = [...BARBARIAN_BASE_RAW, ...TOTEM_WARRIOR_RAW, ...BERSERKER_RAW].flatMap(expand);
