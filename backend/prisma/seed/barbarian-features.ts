// DATA MODULE ONLY (#1277 AC 4): no direct database calls in this file.
//
// RESOURCE POOL: Rage's uses-per-rest total/recharge live on both Rage rows'
// resourceTotals. SRD 5.1 grants unlimited Rages at level 20 (encoded as 99);
// SRD 5.2 caps at 6 from level 17 on.
//
// ACTIVATION + BUFF: Rage's activation (bonusAction/toggle, paying 1 use from
// its own "rage" pool) and its +2/+3/+4 melee-damage buff live on the same
// rows, via toggleActionsFromRow/toggleRowOps (lib/classes/actions.ts).
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { ActionCost } from "../../src/lib/classes/actions.js";
import type { EffectBuffRow } from "../../src/lib/classes/class-feature-rows.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow, DerivedStatSeed, ResourceRechargeSeed } from "./class-features.js";

function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`barbarian-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawBarbarianFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  edition?: SeedEdition;
  derivedStat?: DerivedStatSeed;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: ResourceRechargeSeed;
  resourceTotals?: { minLevel: number; total: number; shortRestRegain?: number }[];
  activationCost?: ActionCost;
  resolverKind?: "toggle";
  costKind?: "pool" | "none";
  costPoolKey?: string;
  costBase?: number;
  effectBuffs?: EffectBuffRow[];
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

// Base class — SRD 5.1 Barbarian (2014) / SRD 5.2 Barbarian (2024)
const BARBARIAN_BASE_RAW: RawBarbarianFeature[] = [
  {
    subclassSlug: null,
    name: "Rage",
    level: 1,
    edition: "EDITION_2014",
    description:
      "As a bonus action, enter a rage lasting up to 1 minute. You gain advantage on Strength checks and saves, a bonus to melee damage (+2 at L1; +3 at L9; +4 at L16), and resistance to bludgeoning, piercing, and slashing damage. You can't cast or concentrate on spells while raging.",
    // SRD 5.1 p.21: recharges on a long rest only — no shortRestRegain on any
    // tier. Unlimited uses at L20 encoded as 99.
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
    // costPoolKey equals resourceKey — Rage spends its own dedicated pool,
    // unlike a shared-pool toggle (e.g. Monk's Elemental Attunement).
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
    // SRD 5.2: full rewrite — Rage Damage applies to any Strength attack (not
    // just melee); duration extends per-round instead of a flat 1 minute,
    // capped at 10.
    description:
      "As a Bonus Action, enter a Rage if you aren't wearing Heavy armor. While raging, you have Resistance to Bludgeoning, Piercing, and Slashing damage, Advantage on Strength checks and saving throws, and a bonus to damage when you attack using Strength with a weapon or an Unarmed Strike (the Rage Damage column); you can't cast spells or maintain Concentration. The Rage lasts until the end of your next turn, ending early if you don Heavy armor or have the Incapacitated condition, and extends another round if you make an attack roll, force a saving throw, or take a Bonus Action to extend it — for up to 10 minutes total. You regain one expended use on a Short Rest and all expended uses on a Long Rest.",
    // SRD 5.2 p.20: caps at 6 from level 17 on — no L20 tier (unlike 2014's
    // unlimited). shortRestRegain: 1 on every tier.
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
    // SRD 5.2: same mechanics as 2014, transcribed from a different document
    // (CLAUDE.md's ACTIONS precedent).
    description: "While you aren't wearing any armor, your base Armor Class equals 10 plus your Dexterity modifier and your Constitution modifier. You can still gain this benefit while using a Shield.",
  },
  {
    subclassSlug: null,
    name: "Weapon Mastery",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2. New in 2024. Text only, mirroring Fighter's own Weapon
    // Mastery row.
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
    // Pure economy reminder — advantage/disadvantage is tracked by the
    // table, not this app.
    resourceKey: "recklessAttack",
    activationCost: "free",
  },
  {
    subclassSlug: null,
    name: "Reckless Attack",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2: widens from melee weapon attacks to any Strength attack roll
    // (Unarmed Strikes, thrown/ranged too).
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
    // SRD 5.2: drops the "effects you can see"/blinded-deafened carve-outs
    // for a flat unless-Incapacitated form.
    description: "You have Advantage on Dexterity saving throws unless you have the Incapacitated condition.",
  },
  {
    subclassSlug: null,
    name: "Primal Knowledge",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2. New in 2024. Text only — skill-proficiency grant isn't
    // persisted here.
    description:
      "You gain proficiency in another skill from the Barbarian's level 1 skill list. While your Rage is active, you can make an Acrobatics, Intimidation, Perception, Stealth, or Survival check as a Strength check instead of its normal ability.",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    description: "You can attack twice whenever you take the Attack action on your turn.",
    // SRD 5.1 / SRD 5.2: edition-invariant, single flat tier (unlike
    // Fighter's scaling).
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
    // 2014-only.
    description: "You have Advantage on Initiative rolls.",
  },
  {
    subclassSlug: null,
    name: "Instinctive Pounce",
    level: 7,
    edition: "EDITION_2024",
    // SRD 5.2. New in 2024.
    description: "As part of the Bonus Action you take to enter your Rage, you can move up to half your Speed.",
  },
  {
    subclassSlug: null,
    name: "Brutal Critical",
    level: 9,
    edition: "EDITION_2014",
    description: "You can roll one additional weapon damage die on a critical hit with a melee attack. Two extra dice at level 13, three at level 17.",
  },
  {
    subclassSlug: null,
    name: "Brutal Strike",
    level: 9,
    edition: "EDITION_2024",
    // SRD 5.2. New in 2024; fills Brutal Critical's L9 slot. Text only —
    // effect-menu dispatch is per-attack player choice, not persisted state.
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
    // SRD 5.2: success sets HP to twice your Barbarian level, not a flat 1.
    // DC progression unchanged from 2014.
    description:
      "If you drop to 0 Hit Points while your Rage is active and don't die outright, you can make a DC 10 Constitution saving throw; on a success, your Hit Points change to twice your Barbarian level instead. The DC increases by 5 each time you use this feature again, resetting to 10 when you finish a Short or Long Rest.",
  },
  // Carries BOTH the L13 grant and L17 upgrade in ONE row: SRD 5.2 names both
  // tiers "Improved Brutal Strike", and ClassFeature's unique constraint on
  // (classId, subclassId, name, edition) would reject two rows sharing that
  // name. Do not split into a second L17 row.
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
    // SRD 5.2: full rewrite — regain-all-uses on Initiative roll (once per
    // Long Rest), flat 10-minute Rage, ends only on Unconscious or Heavy
    // armor.
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
    // SRD 5.2: now also covers a Strength saving throw, not just a check.
    description: "If your total for a Strength check or Strength saving throw is less than your Strength score, you can use that score in place of the total.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2. New in 2024; 2014 keeps a plain ASI at 19 instead. Text only —
    // feat system deferred.
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
    // SRD 5.2: maximum rises to 25, not 24.
    description: "Your Strength and Constitution scores each increase by 4, to a maximum of 25.",
  },
];

// Path of the Totem Warrior — all 5 rows tagged EDITION_2014; no 2024
// successor exists (Path of the Wild Heart replaces it, out of scope here).
// A 2024 character choosing this subclass still resolves to it and simply
// sees no subclass features — a known, disclosed gap.
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
    // SRD 5.2: no exhaustion cost. Extra damage dice equal your Rage Damage
    // bonus (rageMeleeDamageBonus, actions.ts) instead of a bonus-action
    // attack each turn.
    description:
      "If you use Reckless Attack while your Rage is active, the first target you hit on your turn with a Strength-based attack takes extra damage: roll a number of d6s equal to your Rage Damage bonus, of the same type as the weapon or Unarmed Strike used.",
  },
  {
    subclassSlug: BERSERKER_SLUG,
    name: "Mindless Rage",
    level: 6,
    edition: "EDITION_2014",
    description: "You can't be charmed or frightened while raging. If charmed or frightened when you rage, the effect is suspended for the duration.",
    // PHB'14 p.49: suspend-and-restore, not clear.
    // conditionImmunitiesRequireActiveBuff: "rage" names Rage's effectBuffs
    // key; syncConditionImmunityOnBuffToggleInTx (lib/combat/conditions.ts)
    // interprets "suspend".
    conditionImmunities: ["charmed", "frightened"],
    conditionImmunitiesRequireActiveBuff: "rage",
    conditionImmunitiesOnBuffStart: "suspend",
  },
  {
    subclassSlug: BERSERKER_SLUG,
    name: "Mindless Rage",
    level: 6,
    edition: "EDITION_2024",
    // SRD 5.2: outright Immunity while Raging; entering Rage ends an existing
    // Charmed/Frightened condition rather than pausing it.
    description: "You have Immunity to the Charmed and Frightened conditions while your Rage is active, and entering your Rage ends either condition on you.",
    // "clear", not "suspend" — 2024 has no restore-on-rage-end clause.
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
    // SRD 5.2: level-shifts 10 -> 14 and reworks to a 30-ft Emanation (was
    // one target), Strength-based DC (was Charisma), restorable by expending
    // a Rage use.
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
