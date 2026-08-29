// DATA MODULE ONLY (#1277 AC 4): no direct database calls in this file.
//
// EDITION RULE: every row sets `edition` explicitly, including
// edition-invariant features, which are authored as two byte-identical rows
// rather than one untagged row (CLAUDE.md's ACTIONS precedent).
//
// RESOURCE POOL: exactly one row per edition may set
// `resourceKey: "channelDivinity"` — a second row for the same edition merges
// silently via registry.ts's SHARED_POOL_MERGE instead of erroring.
//
// saveDcAbilities is deliberately unset on every row — announcedSaveDC is a
// single scalar overlaid across every class entry, so Paladin's Channel
// Divinity/Abjure Foes DC is served independently via channelDivinitySaveDC
// (lib/classes/channel-divinity.ts) instead.
//
// TEXT-ONLY (not wired to mechanics): Blessed Warrior's cantrip swap,
// Paladin's Smite's and Faithful Steed's free casts, Epic Boon's feat grant.
// Oath spell lists ARE wired, via SubclassGrantedSpell rows
// (subclass-granted-spells.ts), cross-checked against this file's text.
import type { ResourceTotalFormula } from "../../src/lib/classes/class-feature-rows.js";
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type {
  ActionCostSeed,
  ClassFeatureSeedRow,
  CostKindSeed,
  DerivedStatSeed,
  ResourceRechargeSeed,
} from "./class-features.js";

function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`paladin-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawPaladinFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  edition: SeedEdition;
  derivedStat?: DerivedStatSeed;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: ResourceRechargeSeed;
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula; shortRestRegain?: number }[];
  activationCost?: ActionCostSeed;
  costKind?: CostKindSeed;
  costPoolKey?: string;
  costBase?: number;
  reminder?: string;
}

function expand(raw: RawPaladinFeature): ClassFeatureSeedRow[] {
  return [
    {
      className: "Paladin",
      subclassSlug: raw.subclassSlug,
      name: raw.name,
      level: raw.level,
      description: raw.description,
      edition: raw.edition,
      derivedStat: raw.derivedStat,
      derivedStatTiers: raw.derivedStatTiers,
      resourceKey: raw.resourceKey,
      resourceLabel: raw.resourceLabel,
      resourceRecharge: raw.resourceRecharge,
      resourceTotals: raw.resourceTotals,
      activationCost: raw.activationCost,
      costKind: raw.costKind,
      costPoolKey: raw.costPoolKey,
      costBase: raw.costBase,
      reminder: raw.reminder,
    },
  ];
}

// Base class — PHB'14 p.82ff (2014) / SRD 5.2 pp. 46-49 (2024)
const BASE_RAW: RawPaladinFeature[] = [
  {
    subclassSlug: null,
    name: "Divine Sense",
    level: 1,
    edition: "EDITION_2014",
    description:
      "As an action, sense the presence of celestials, fiends, and undead within 60 ft until the end of your next turn (they aren't hidden from this sense). You can also detect consecrated or desecrated places/objects. Uses = 1 + Charisma modifier per long rest.",
    // PHB'14 p.84: 1 + Charisma modifier, no stated minimum. `min: 1` is NOT
    // RAW — kept for byte-parity with the legacy Math.max(1, 1 + chaMod) floor.
    resourceKey: "divineSense",
    resourceLabel: "Divine Sense",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 1, total: { abilityMod: "charisma", plus: 1, min: 1 } }],
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "divineSense",
    costBase: 1,
  },
  {
    subclassSlug: null,
    name: "Lay on Hands",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Touch to restore HP from a pool of 5 × your paladin level. Alternatively, spend 5 HP from the pool to cure one disease or neutralize one poison. The pool replenishes on a long rest.",
    // PHB'14 p.84: pool = 5 × Paladin level.
    resourceKey: "layOnHands",
    resourceLabel: "Lay on Hands",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 1, total: { levelTimes: 5 } }],
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "layOnHands",
    costBase: 5,
    reminder: "Touch a creature to restore HP; alternatively, spend 5 HP to cure one disease or neutralize one poison.",
  },
  {
    subclassSlug: null,
    name: "Lay on Hands",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2: Bonus Action (was Action); poison clause reworded to "remove
    // the Poisoned condition."
    description:
      "As a Bonus Action, touch a creature and restore a number of Hit Points from a pool equal to five times your Paladin level. Alternatively, expend 5 Hit Points from the pool to remove the Poisoned condition from the creature instead of healing it. The pool refills when you finish a Long Rest.",
    resourceKey: "layOnHands",
    resourceLabel: "Lay on Hands",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 1, total: { levelTimes: 5 } }],
    activationCost: "bonusAction",
    costKind: "pool",
    costPoolKey: "layOnHands",
    costBase: 5,
    reminder: "Touch a creature to restore HP; alternatively, spend 5 HP to remove the Poisoned condition instead of healing.",
  },
  {
    subclassSlug: null,
    name: "Fighting Style",
    level: 2,
    edition: "EDITION_2014",
    description:
      "Choose a fighting style specialty: Defense (+1 AC in armor), Dueling (+2 melee damage with one weapon), Great Weapon Fighting (reroll 1s and 2s on damage), or Protection (impose disadvantage on attacks against adjacent allies).",
  },
  {
    subclassSlug: null,
    name: "Fighting Style",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2: choice is now a Fighting Style feat, plus the Paladin-only
    // Blessed Warrior option.
    description:
      "You gain a Fighting Style feat of your choice. Blessed Warrior is available only to you: learn two Cleric cantrips of your choice, treated as Paladin spells for you, using Charisma as your spellcasting ability for them; you can replace one of them whenever you gain a Paladin level.",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You cast spells using Charisma starting at level 2. Half-caster progression (you gain spell slots more slowly than full casters). You prepare a number of paladin spells equal to your Charisma modifier + half your paladin level (rounded down).",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2: the Spellcasting feature text appears at level 1, but
    // spellcastingStartLevel() still gates when slots actually start — this
    // row only moves when the TEXT appears, not when slots start.
    description:
      "You cast spells using Charisma as your spellcasting ability. You are a Half-Caster: consult the Paladin Features table for your spell slots, which you gain starting at 1st level. You prepare a growing list of Paladin spells (2 at level 1, rising to 15 by level 20, per the Paladin Features table), regain all expended spell slots on a Long Rest, and can change your prepared list whenever you finish one. A Holy Symbol serves as your Spellcasting Focus.",
  },
  {
    subclassSlug: null,
    name: "Divine Smite",
    level: 2,
    edition: "EDITION_2014",
    description:
      "When you hit with a melee weapon attack, expend one spell slot to deal +2d8 radiant damage (+1d8 per slot level above 1st, max +5d8). Undead and fiends take an additional 1d8 radiant damage.",
  },
  {
    subclassSlug: null,
    name: "Paladin's Smite",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2, verbatim. No Spell catalog row exists for Divine Smite itself
    // (out of scope, follow-up filed).
    description:
      "You always have the Divine Smite spell prepared. In addition, you can cast it without expending a spell slot, but you must finish a Long Rest before you can cast it in this way again.",
  },
  {
    subclassSlug: null,
    name: "Divine Health",
    level: 3,
    edition: "EDITION_2014",
    description: "The divine magic flowing through you makes you immune to disease.",
  },
  {
    subclassSlug: null,
    name: "Channel Divinity",
    level: 3,
    edition: "EDITION_2014",
    description:
      "You can channel divine energy through your sacred oath to fuel magical effects. You have 1 use, regained on a short or long rest. The specific options depend on your oath (see subclass features).",
    resourceKey: "channelDivinity",
    resourceLabel: "Channel Divinity",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 3, total: 1 }],
    // PHB'14 p.164. Reminder text must match the Channel Divinity rows in
    // CLERIC_FEATURES so a Cleric/Paladin multiclass sees identical text
    // regardless of dedupe (#1340).
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "channelDivinity",
    costBase: 1,
    reminder:
      "Spend 1 use for any Channel Divinity effect you have — a Cleric's Turn Undead and Divine Domain options and a Paladin's Oath options all draw on this one pool.",
  },
  {
    subclassSlug: null,
    name: "Channel Divinity",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2, verbatim on uses/recharge (2 uses, 3 at level 11; short rest
    // regains 1, long rest regains all).
    description:
      "You can channel divine energy to fuel magical effects. You start with one option, Divine Sense, and your Oath grants you more. When you use your Channel Divinity, choose one of its options; unless it says otherwise, no action is required. You can use your Channel Divinity twice between rests, and you gain a third use at Paladin level 11. You regain one of its expended uses when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest. Any saving throw associated with a Channel Divinity option uses your spell save DC.",
    resourceKey: "channelDivinity",
    resourceLabel: "Channel Divinity",
    resourceRecharge: "longRest",
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "channelDivinity",
    costBase: 1,
    reminder:
      "Spend 1 use for any Channel Divinity effect you have — a Cleric's Turn Undead and Divine Domain options and a Paladin's Oath options all draw on this one pool.",
    resourceTotals: [
      { minLevel: 3, total: 2, shortRestRegain: 1 },
      { minLevel: 11, total: 3, shortRestRegain: 1 },
    ],
  },
  {
    subclassSlug: null,
    name: "Channel Divinity: Divine Sense",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2, verbatim on trigger/duration (Bonus Action, 10 minutes or
    // until Incapacitated).
    description:
      "As a Bonus Action, expend a use of your Channel Divinity to open your awareness to the presence of celestials, fiends, and undead within 60 feet of yourself that aren't behind total cover. For 10 minutes or until you have the Incapacitated condition, you know the location of any creature of those types in that radius and, for any creature you can see, whether it is one of those creature types. You also learn the creature type of any place or object in the area consecrated or desecrated as with the Hallow spell.",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    edition: "EDITION_2014",
    description: "You can attack twice whenever you take the Attack action on your turn.",
    // SRD 5.1 / SRD 5.2: edition-invariant, single flat tier (unlike
    // Fighter's scaling).
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    edition: "EDITION_2024",
    description: "You can attack twice whenever you take the Attack action on your turn.",
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    subclassSlug: null,
    name: "Faithful Steed",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2. New in 2024, no 2014 counterpart.
    description:
      "You always have the Find Steed spell prepared, and you can cast it once without a spell slot, doing so again only after you finish a Long Rest.",
  },
  {
    subclassSlug: null,
    name: "Aura of Protection",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Friendly creatures within 10 ft add your Charisma modifier (minimum +1) to saving throws while you are conscious. Aura extends to 30 ft at level 18.",
  },
  {
    subclassSlug: null,
    name: "Aura of Protection",
    level: 6,
    edition: "EDITION_2024",
    // SRD 5.2: 10-foot Emanation, inactive while Incapacitated; the level-18
    // range increase moves to Aura Expansion.
    description:
      "You and friendly creatures within your 10-foot Emanation add your Charisma modifier (minimum +1) to saving throws, an effect that is inactive while you have the Incapacitated condition. If another Paladin is within the Emanation, a creature can benefit from only one Aura of Protection at a time; that creature chooses which aura applies.",
  },
  {
    subclassSlug: null,
    name: "Abjure Foes",
    level: 9,
    edition: "EDITION_2024",
    // SRD 5.2: target makes a Wisdom save (the DC is Charisma-derived, but
    // the save ability rolled is Wisdom). New in 2024.
    description:
      "As a Magic action, expend a use of your Channel Divinity to overwhelm creatures with divine awe. Choose a number of creatures you can see within 60 feet of yourself, up to your Charisma modifier (minimum of one creature). Each target must succeed on a Wisdom saving throw or have the Frightened condition for 1 minute or until it takes any damage. While Frightened, a target can do only one of the following on its turn: move, take an action, or take a bonus action.",
  },
  {
    subclassSlug: null,
    name: "Aura of Courage",
    level: 10,
    edition: "EDITION_2014",
    description:
      "Friendly creatures within 10 ft can't be frightened while you are conscious. Aura extends to 30 ft at level 18.",
  },
  {
    subclassSlug: null,
    name: "Aura of Courage",
    level: 10,
    edition: "EDITION_2024",
    // SRD 5.2: Immunity to Frightened (not just "can't be frightened"),
    // scoped to Aura of Protection.
    description:
      "You and friendly creatures within your Aura of Protection have Immunity to the Frightened condition while you don't have the Incapacitated condition.",
  },
  {
    subclassSlug: null,
    name: "Improved Divine Smite",
    level: 11,
    edition: "EDITION_2014",
    description:
      "Whenever you hit with a melee weapon, you deal an extra 1d8 radiant damage in addition to any other Divine Smite dice.",
  },
  {
    subclassSlug: null,
    name: "Radiant Strikes",
    level: 11,
    edition: "EDITION_2024",
    // SRD 5.2: applies to a melee weapon OR unarmed strike (2014: melee
    // weapon only); not limited to once per turn.
    description:
      "Your strikes now carry supernatural power. When you hit a creature with an attack using a Melee weapon or an Unarmed Strike, the target takes an extra 1d8 Radiant damage.",
  },
  {
    subclassSlug: null,
    name: "Cleansing Touch",
    level: 14,
    edition: "EDITION_2014",
    description:
      "As an action, end one spell on yourself or one willing creature within reach. Uses = Charisma modifier per long rest (minimum 1).",
  },
  {
    subclassSlug: null,
    name: "Restoring Touch",
    level: 14,
    edition: "EDITION_2024",
    // SRD 5.2: folded into the Lay on Hands pool (5 HP per condition removed)
    // rather than its own pool.
    description:
      "You can use your Lay on Hands to remove the Blinded, Charmed, Deafened, Frightened, Paralyzed, or Stunned condition from a creature: for each condition removed, use 5 Hit Points from your Lay on Hands pool, in addition to any Hit Points used to restore Hit Points.",
  },
  {
    subclassSlug: null,
    name: "Aura Expansion",
    level: 18,
    edition: "EDITION_2024",
    // SRD 5.2. New in 2024.
    description: "Your Aura of Protection is now a 30-foot Emanation.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2. New in 2024; 2014 keeps a plain ASI at 19 instead.
    description: "You gain an Epic Boon feat of your choice (Boon of Fate recommended). You can take this feat only once.",
  },
];

// Oath of Devotion — PHB'14 p.87 (2014) / SRD 5.2 pp. 49-50 (2024)
const DEVOTION_SLUG = slug("paladin-oath-of-devotion");
const DEVOTION_RAW: RawPaladinFeature[] = [
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Oath Spells",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Always-prepared oath spells: Protection from Evil and Good, Sanctuary (L3); Lesser Restoration, Zone of Truth (L5); Beacon of Hope, Dispel Magic (L9); Freedom of Movement, Guardian of Faith (L13); Commune, Flame Strike (L17).",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Oath of Devotion Spells",
    level: 3,
    edition: "EDITION_2024",
    description:
      "Always-prepared oath spells: Protection from Evil and Good, Shield of Faith (3rd level); Aid, Zone of Truth (5th level); Beacon of Hope, Dispel Magic (9th level); Freedom of Movement, Guardian of Faith (13th level); Commune, Flame Strike (17th level).",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Channel Divinity: Sacred Weapon",
    level: 3,
    edition: "EDITION_2014",
    description:
      "As an action, imbue one weapon with positive energy for 1 minute. It emits bright light (20 ft), dim light (20 ft more), and you add your Charisma modifier to attack rolls. The weapon becomes magical if it isn't already. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Sacred Weapon",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2: triggers immediately after the Attack action (not "as an
    // action"); duration extends to 10 minutes (was 1).
    description:
      "Immediately after you take the Attack action on your turn, you can imbue one weapon you're holding with positive energy. For 10 minutes, you add your Charisma modifier to attack rolls made with that weapon, and each time you hit with it, you can choose for the weapon to deal Radiant damage instead of one of its other damage types. The weapon also emits bright light in a 20-foot radius and dim light for an additional 20 feet, and it becomes magical if it isn't already. The effect ends early if you aren't holding or carrying the weapon, if you have the Incapacitated condition, or when you finish a Long Rest.",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Channel Divinity: Turn the Unholy",
    level: 3,
    edition: "EDITION_2014",
    description:
      "As an action, present your holy symbol and speak a prayer. Each fiend or undead within 30 ft must make a Wisdom saving throw or be turned for 1 minute. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Aura of Devotion",
    level: 7,
    edition: "EDITION_2014",
    description: "Friendly creatures within 10 ft can't be charmed while you are conscious (30 ft at level 18).",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Aura of Devotion",
    level: 7,
    edition: "EDITION_2024",
    // SRD 5.2: Immunity to Charmed, scoped to Aura of Protection.
    description: "You and friendly creatures within your Aura of Protection have Immunity to the Charmed condition.",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Purity of Spirit",
    level: 15,
    edition: "EDITION_2014",
    description: "You are always under the effects of a Protection from Evil and Good spell.",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Smite of Protection",
    level: 15,
    edition: "EDITION_2024",
    // SRD 5.2.
    description:
      "Whenever you cast Divine Smite, you and your allies have Half Cover while within your Aura of Protection until the start of your next turn.",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Holy Nimbus",
    level: 20,
    edition: "EDITION_2014",
    description:
      "As an action, emit an aura of sunlight for 1 minute (60-ft radius, bright light). At the start of each turn, enemies in the aura take 10 radiant damage. You have advantage on saves against spells cast by fiends and undead during this time. Once used, regain on a long rest.",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Holy Nimbus",
    level: 20,
    edition: "EDITION_2024",
    // SRD 5.2: Bonus Action (was Action), 10-minute duration (was 1).
    description:
      "As a Bonus Action, you gleam with an aura of divine radiance that lasts for 10 minutes or until you dismiss it (no action required). While the aura lasts, you gain the following benefits: Holy Ward — you have Advantage on saving throws against spells cast by Fiends or Undead; Radiant Damage — whenever a Fiend or Undead hits you with a melee attack, that creature takes 10 Radiant damage; Sunlight — you shed bright light in a 30-foot radius and dim light for an additional 30 feet, and the light counts as sunlight. You can use this feature again only after you finish a Long Rest.",
  },
];

// Oath of the Ancients — PHB'14 p.88 (2014) / mirror-sourced from aidedd.org
// + dungeonmister.com (2024, not in SRD 5.2).
const ANCIENTS_SLUG = slug("paladin-oath-of-the-ancients");
const ANCIENTS_RAW: RawPaladinFeature[] = [
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Oath Spells",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Always-prepared oath spells: Ensnaring Strike, Speak with Animals (L3); Moonbeam, Misty Step (L5); Plant Growth, Protection from Energy (L9); Ice Storm, Stoneskin (L13); Commune with Nature, Tree Stride (L17).",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Oath of the Ancients Spells",
    level: 3,
    edition: "EDITION_2024",
    // Mirror-sourced: spell tier list unchanged from 2014; only the feature
    // name renames.
    description:
      "Always-prepared oath spells: Ensnaring Strike, Speak with Animals (3rd level); Moonbeam, Misty Step (5th level); Plant Growth, Protection from Energy (9th level); Ice Storm, Stoneskin (13th level); Commune with Nature, Tree Stride (17th level).",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Channel Divinity: Nature's Wrath",
    level: 3,
    edition: "EDITION_2014",
    description:
      "As an action, restrain a creature within 10 ft: ethereal vines bind it until it makes a Strength or Dexterity save (DC = paladin spell save DC). Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Nature's Wrath",
    level: 3,
    edition: "EDITION_2024",
    // Mirror-sourced: range 10→15 ft, multiple targets (was one), Strength
    // save only (was Str/Dex choice), Restrained condition (repeating save)
    // rather than fixed-DC bind.
    description:
      "As a Magic action, expend a use of your Channel Divinity to invoke spectral vines. Choose one or more creatures you can see within 15 feet of yourself. Each target must succeed on a Strength saving throw or have the Restrained condition until the vines are destroyed (AC 20; 20 Hit Points; immunity to Poison and Psychic damage) or you use a Bonus Action to release them. A Restrained target repeats the save at the end of each of its turns, ending the effect on itself on a success.",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Channel Divinity: Turn the Faithless",
    level: 3,
    edition: "EDITION_2014",
    description:
      "As an action, present your holy symbol. Each fey or fiend within 30 ft must make a Wisdom saving throw or be turned for 1 minute. A turned creature that has nowhere to flee cowers. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Aura of Warding",
    level: 7,
    edition: "EDITION_2014",
    description: "You and friendly creatures within 10 ft have resistance to damage from spells (30 ft at level 18).",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Aura of Warding",
    level: 7,
    edition: "EDITION_2024",
    // Mirror-sourced: resistance narrows to Necrotic/Psychic/Radiant (was all
    // spell damage), scoped to Aura of Protection.
    description:
      "Ancient magic lies so heavily upon you that it forms an eldritch ward: you and friendly creatures within your Aura of Protection have Resistance to Necrotic, Psychic, and Radiant damage.",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Undying Sentinel",
    level: 15,
    edition: "EDITION_2014",
    description:
      "When reduced to 0 HP without dying outright, you drop to 1 HP instead. Once used, regain on a long rest. You also don't suffer the aging effects of spells or magical effects.",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Undying Sentinel",
    level: 15,
    edition: "EDITION_2024",
    // Mirror-sourced: adds a healing clause (2014 had none); drops the
    // aging-immunity clause.
    description:
      "When you are reduced to 0 Hit Points and are not killed outright, you can choose to drop to 1 Hit Point instead, and you regain a number of Hit Points equal to three times your Paladin level. You can use this feature only once until you finish a Long Rest.",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Elder Champion",
    level: 20,
    edition: "EDITION_2014",
    description:
      "As an action, take on an aspect of nature for 1 minute: regain 10 HP at the start of each turn; cast spells as a bonus action; enemies within 10 ft have disadvantage on saves against your paladin spells and Channel Divinity. Once used, regain on a long rest.",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Elder Champion",
    level: 20,
    edition: "EDITION_2024",
    // Mirror-sourced: Bonus Action (was Action), 10-minute duration (was 1).
    description:
      "As a Bonus Action, you gain the appearance of an ancient force of nature for 10 minutes or until you dismiss it (no action required). For the duration, you gain the following benefits: Diminish Defiance — enemies within 10 feet of you have Disadvantage on saving throws against your Paladin spells and Channel Divinity options; Regeneration — at the start of each of your turns, you regain 10 Hit Points; Swift Spells — you can cast your Paladin spells with a casting time of an action as a Bonus Action instead. You can use this feature again only after you finish a Long Rest.",
  },
];

// Oath of Vengeance — PHB'14 p.89 (2014) / mirror-sourced from aidedd.org +
// dungeonmister.com (2024, not in SRD 5.2).
const VENGEANCE_SLUG = slug("paladin-oath-of-vengeance");
const VENGEANCE_RAW: RawPaladinFeature[] = [
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Oath Spells",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Always-prepared oath spells: Bane, Hunter's Mark (L3); Hold Person, Misty Step (L5); Haste, Protection from Energy (L9); Banishment, Dimension Door (L13); Hold Monster, Scrying (L17).",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Oath of Vengeance Spells",
    level: 3,
    edition: "EDITION_2024",
    // Mirror-sourced: spell tier list unchanged from 2014; only the feature
    // name renames.
    description:
      "Always-prepared oath spells: Bane, Hunter's Mark (3rd level); Hold Person, Misty Step (5th level); Haste, Protection from Energy (9th level); Banishment, Dimension Door (13th level); Hold Monster, Scrying (17th level).",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Channel Divinity: Abjure Enemy",
    level: 3,
    edition: "EDITION_2014",
    description:
      "As an action, choose a creature within 60 ft. It makes a Wisdom save (DC = paladin spell save DC) or becomes frightened and its speed is 0 until the end of your next turn (half speed on a success). Fiends and undead have disadvantage on this save. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Channel Divinity: Vow of Enmity",
    level: 3,
    edition: "EDITION_2014",
    description:
      "As a bonus action, say a vow of enmity against a creature within 10 ft. Gain advantage on attack rolls against it for 1 minute or until it drops to 0 HP. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Vow of Enmity",
    level: 3,
    edition: "EDITION_2024",
    // Mirror-sourced; action cost deliberately omitted — three secondary
    // sources disagree on it (aidedd/dungeonmister/dndplaybook).
    description:
      "Expend a use of your Channel Divinity to utter a vow of enmity against a creature you can see within 10 feet of yourself. You have Advantage on attack rolls against that creature for 1 minute. If the creature drops to 0 Hit Points before this vow ends, you can transfer the vow to a new creature within 30 feet of you, provided you can see the new target.",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Relentless Avenger",
    level: 7,
    edition: "EDITION_2014",
    description:
      "When you hit with an opportunity attack, you can move up to half your speed (without provoking opportunity attacks) as part of the same reaction.",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Relentless Avenger",
    level: 7,
    edition: "EDITION_2024",
    // Mirror-sourced: reworked from "you move" to "target's Speed drops to
    // 0."
    description:
      "Your battle instincts sharpen when you cross blades with your foes. When you hit a creature with an Opportunity Attack, you can reduce that creature's Speed to 0 until the end of the current turn.",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Soul of Vengeance",
    level: 15,
    edition: "EDITION_2014",
    description:
      "When a creature under your Vow of Enmity makes an attack, use your reaction to make a melee weapon attack against it.",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Soul of Vengeance",
    level: 15,
    edition: "EDITION_2024",
    // Mirror-sourced: triggers on the vowed creature's hit OR miss (2014
    // text is silent on misses).
    description:
      "You can maintain your focus on a foe. When the creature under the effect of your Vow of Enmity hits or misses with an attack, you can use your Reaction to make a melee attack against that creature if it's within your reach.",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Avenging Angel",
    level: 20,
    edition: "EDITION_2014",
    description:
      "As an action, assume an angelic form for 1 hour: fly speed 60 ft; enemies within 30 ft who can see you must make a Wisdom save or be frightened of you for 1 minute. Once used, regain on a long rest.",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Avenging Angel",
    level: 20,
    edition: "EDITION_2024",
    // Mirror-sourced; duration is CONTESTED — 10 minutes per aidedd/
    // dungeonmister (2-of-3 majority, used here), dndplaybook says 1 hour.
    description:
      "As a Bonus Action, you undergo a transformation for 10 minutes or until you dismiss it (no action required). You grow angelic wings, giving you a Fly Speed of 60 feet with the ability to hover. While transformed, you also emanate frightful power: whenever a creature hostile to you starts its turn within 30 feet of you or enters that area for the first time on a turn, it must succeed on a Wisdom saving throw or have the Frightened condition until your transformation ends. You have Advantage on attack rolls against creatures that have the Frightened condition. You can use this feature again only after you finish a Long Rest.",
  },
];

export const PALADIN_FEATURES: ClassFeatureSeedRow[] = [...BASE_RAW, ...DEVOTION_RAW, ...ANCIENTS_RAW, ...VENGEANCE_RAW].flatMap(expand);
