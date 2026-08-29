// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no direct database calls in this file.
// Every Bard pool is row-declared; a reintroduced resourceFn pool would shadow a same-keyed row pool in mergePoolSources.
// EDITION_2024 rows below are transcribed from SRD 5.2.1 (Wizards' online reference) — it has no fixed pagination, so rows cite the document by name rather than a page.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { ResourceTotalFormula } from "../../src/lib/classes/class-feature-rows.js";
import type { FeatImprovement } from "../../src/lib/classes/resources-state.js";
import type { RechargeOn } from "../../src/lib/classes/types.js";
import type { SeedEdition } from "./edition.js";
import type { ActionCostSeed, ClassFeatureSeedRow, CostKindSeed, DerivedStatSeed } from "./class-features.js";

function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`bard-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawBardFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  edition?: SeedEdition;
  derivedStat?: DerivedStatSeed;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  improvements?: FeatImprovement[];
  resourceKey?: string;
  resourceLabel?: string;
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula }[];
  resourceDieTiers?: { minLevel: number; die: string }[];
  resourceRechargeTiers?: { minLevel: number; recharge: RechargeOn }[];
  activationCost?: ActionCostSeed;
  costKind?: CostKindSeed;
  costPoolKey?: string;
  costBase?: number;
}

function expand(raw: RawBardFeature): ClassFeatureSeedRow[] {
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({
    className: "Bard",
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    edition,
    derivedStat: raw.derivedStat,
    derivedStatTiers: raw.derivedStatTiers,
    improvements: raw.improvements,
    resourceKey: raw.resourceKey,
    resourceLabel: raw.resourceLabel,
    resourceTotals: raw.resourceTotals,
    resourceDieTiers: raw.resourceDieTiers,
    resourceRechargeTiers: raw.resourceRechargeTiers,
    activationCost: raw.activationCost,
    costKind: raw.costKind,
    costPoolKey: raw.costPoolKey,
    costBase: raw.costBase,
  }));
}

// PHB'14 p.53ff (2014) / SRD 5.2 pp. 30-33 (2024)
const BARD_BASE_RAW: RawBardFeature[] = [
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You cast spells using Charisma. Full-caster progression (same slot table as Cleric/Wizard). You know a set number of spells from the bard list.",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    description:
      "You cast spells using Charisma. You know two Bard cantrips of your choice from the Bard spell list, replacing one whenever you gain a Bard level; you learn an additional cantrip at levels 4 and 10. You prepare a growing list of Bard spells (4 at level 1, rising to 22 by level 20, per the Bard Features table), regain all expended spell slots on a Long Rest, and can change your prepared list whenever you finish one. A Musical Instrument serves as your Spellcasting Focus.",
  },
  {
    subclassSlug: null,
    name: "Bardic Inspiration",
    level: 1,
    edition: "EDITION_2014",
    description:
      "As a bonus action, give one creature within 60 ft a Bardic Inspiration die (d6, becoming d8 at L5, d10 at L10, d12 at L15). They add it to one ability check, attack roll, or saving throw within 10 minutes.",
    resourceKey: "bardicInspiration",
    resourceLabel: "Bardic Inspiration",
    // SRD 5.1 p.53: a minimum of once, equal to your Charisma modifier.
    resourceTotals: [{ minLevel: 1, total: { abilityMod: "charisma", min: 1 } }],
    // SRD 5.1 p.54: d6 at L1, d8 at L5, d10 at L10, d12 at L15.
    resourceDieTiers: [
      { minLevel: 1, die: "d6" },
      { minLevel: 5, die: "d8" },
      { minLevel: 10, die: "d10" },
      { minLevel: 15, die: "d12" },
    ],
    // SRD 5.1 p.54: Long Rest below Font of Inspiration (L5), then short-or-long.
    resourceRechargeTiers: [
      { minLevel: 1, recharge: "longRest" },
      { minLevel: 5, recharge: "short-or-long" },
    ],
    activationCost: "bonusAction",
    costKind: "pool",
    costPoolKey: "bardicInspiration",
    costBase: 1,
  },
  {
    subclassSlug: null,
    name: "Bardic Inspiration",
    level: 1,
    edition: "EDITION_2024",
    description:
      "As a Bonus Action, give one creature within 60 feet that can see or hear you a Bardic Inspiration die (d6, becoming d8 at level 5, d10 at level 10, d12 at level 15). Within the next hour, that creature can roll the die and add the number rolled to one D20 Test it makes, potentially turning the failure into a success.",
    resourceKey: "bardicInspiration",
    resourceLabel: "Bardic Inspiration",
    // SRD 5.2 p.31: a minimum of once, equal to your Charisma modifier.
    resourceTotals: [{ minLevel: 1, total: { abilityMod: "charisma", min: 1 } }],
    // SRD 5.2 p.31: d6 at level 1, d8 at level 5, d10 at level 10, d12 at level 15.
    resourceDieTiers: [
      { minLevel: 1, die: "d6" },
      { minLevel: 5, die: "d8" },
      { minLevel: 10, die: "d10" },
      { minLevel: 15, die: "d12" },
    ],
    // SRD 5.2 p.32: Long Rest below Font of Inspiration (L5), then short-or-long.
    resourceRechargeTiers: [
      { minLevel: 1, recharge: "longRest" },
      { minLevel: 5, recharge: "short-or-long" },
    ],
    activationCost: "bonusAction",
    costKind: "pool",
    costPoolKey: "bardicInspiration",
    costBase: 1,
  },
  {
    subclassSlug: null,
    name: "Jack of All Trades",
    level: 2,
    edition: "EDITION_2014",
    description:
      "Add half your proficiency bonus (rounded down) to any ability check that doesn't already use your proficiency bonus.",
  },
  {
    subclassSlug: null,
    name: "Jack of All Trades",
    level: 2,
    edition: "EDITION_2024",
    description:
      "Whenever you make an ability check that doesn't already use your Proficiency Bonus and that uses a skill proficiency you lack, you can add half your Proficiency Bonus (round down) to the check.",
  },
  {
    subclassSlug: null,
    name: "Song of Rest",
    level: 2,
    edition: "EDITION_2014",
    description:
      "If you or any friendly creatures spend hit dice during a short rest and you perform, they regain extra HP: 1d6 (L2), d8 (L9), d10 (L13), d12 (L17).",
  },
  // Song of Rest has no EDITION_2024 row: removed outright in PHB'24, not renamed or folded elsewhere.
  {
    subclassSlug: null,
    name: "Expertise",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Choose two of your skill proficiencies (or one skill + Thieves' Tools). Your proficiency bonus is doubled for those skills. Two more skills at level 10.",
    // #1588: PHB'14 p.53 — 2 skills at L3, 4 more at L10.
    derivedStat: "expertiseChoiceCount",
    derivedStatTiers: [
      { minLevel: 3, value: 2 },
      { minLevel: 10, value: 4 },
    ],
  },
  {
    subclassSlug: null,
    name: "Expertise",
    level: 2,
    edition: "EDITION_2024",
    description:
      "Choose two of your skill proficiencies (or one skill proficiency and your Thieves' Tools proficiency). Your Proficiency Bonus is doubled for any ability check you make with either chosen proficiency. At level 9, choose two more skill proficiencies to gain this benefit.",
    // #1588: SRD 5.2.1 — 2 skills at L2, 4 more at L9.
    derivedStat: "expertiseChoiceCount",
    derivedStatTiers: [
      { minLevel: 2, value: 2 },
      { minLevel: 9, value: 4 },
    ],
  },
  {
    subclassSlug: null,
    name: "Font of Inspiration",
    level: 5,
    edition: "EDITION_2014",
    description:
      "You regain all of your expended Bardic Inspiration uses on a short or long rest (previously only on a long rest).",
  },
  {
    subclassSlug: null,
    name: "Font of Inspiration",
    level: 5,
    edition: "EDITION_2024",
    description:
      "You regain all of your expended Bardic Inspiration uses when you finish a Short or Long Rest. In addition, you can expend a spell slot (no action required) to regain one expended use of Bardic Inspiration.",
  },
  {
    subclassSlug: null,
    name: "Countercharm",
    level: 6,
    edition: "EDITION_2014",
    description:
      "As an action, start a performance that lasts until the end of your next turn. During that time, friendly creatures within 30 ft have advantage on saves against being frightened or charmed.",
  },
  {
    subclassSlug: null,
    name: "Countercharm",
    level: 7,
    edition: "EDITION_2024",
    description:
      "If you or a creature within 30 feet of you fails a saving throw against an effect that applies the Charmed or Frightened condition, you can take a Reaction to cause the save to be rerolled, and the new roll has Advantage.",
  },
  {
    subclassSlug: null,
    name: "Magical Secrets",
    level: 10,
    edition: "EDITION_2014",
    description:
      "Choose two spells from any class (including this one). They count as bard spells for you. Two more at level 14, two more at level 18.",
  },
  {
    subclassSlug: null,
    name: "Magical Secrets",
    level: 10,
    edition: "EDITION_2024",
    description:
      "Whenever you reach a Bard level and the Prepared Spells number in the Bard Features table increases, you can choose any of your new prepared spells from the Bard, Cleric, Druid, and Wizard spell lists.",
  },
  {
    subclassSlug: null,
    name: "Superior Inspiration",
    level: 20,
    edition: "EDITION_2014",
    description:
      "When you roll initiative and have no uses of Bardic Inspiration remaining, you regain one use.",
  },
  {
    subclassSlug: null,
    name: "Superior Inspiration",
    level: 18,
    edition: "EDITION_2024",
    description:
      "When you roll Initiative, you regain expended uses of Bardic Inspiration until you have two if you have fewer than that.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // Feat system itself is deferred — text only.
    description: "You gain an Epic Boon feat of your choice (Boon of Spell Recall recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Words of Creation",
    level: 20,
    edition: "EDITION_2024",
    description:
      "You always have the Power Word Heal and Power Word Kill spells prepared. When you cast either spell, you can target a second creature within 10 feet of the first target with the same spell.",
  },
];

// PHB'14 p.55 (2014) / SRD 5.2.1 (2024)
const LORE_SLUG = slug("bard-college-of-lore");
const COLLEGE_OF_LORE_RAW: RawBardFeature[] = [
  {
    subclassSlug: LORE_SLUG,
    name: "Bonus Proficiencies",
    level: 3,
    edition: "EDITION_2014",
    description: "You gain proficiency in three skills of your choice.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Bonus Proficiencies",
    level: 3,
    edition: "EDITION_2024",
    description: "You gain proficiency with three skills of your choice.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Cutting Words",
    level: 3,
    edition: "EDITION_2014",
    description:
      "When a creature within 60 ft that you can see makes an attack roll, ability check, or damage roll, use your reaction and expend one Bardic Inspiration die to subtract the number rolled from the creature's roll.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Cutting Words",
    level: 3,
    edition: "EDITION_2024",
    description:
      "When a creature you can see within 60 feet of yourself makes a damage roll or succeeds on an ability check or attack roll, you can take a Reaction and expend one Bardic Inspiration die, subtracting the number rolled from the creature's roll and potentially turning its success into a failure — this works supernaturally even against a creature that can't hear you.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Additional Magical Secrets",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Learn two spells from any class (including this one). They count as bard spells for you. This is in addition to the Magical Secrets you get at level 10.",
  },
  // Additional Magical Secrets has no EDITION_2024 row: renamed outright to Magical Discoveries below, never edited in place.
  {
    subclassSlug: LORE_SLUG,
    name: "Magical Discoveries",
    level: 6,
    edition: "EDITION_2024",
    description:
      "You always have two spells from the Cleric, Druid, or Wizard spell list prepared — a cantrip or a spell for which you have spell slots — chosen from any combination of the three. Whenever you gain a Bard level, you can replace one of these spells with another that meets this feature's criteria.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Peerless Skill",
    level: 14,
    edition: "EDITION_2014",
    description:
      "When making an ability check, expend one Bardic Inspiration die to add the number rolled to the check. You can use this feature even if you're the one inspiring yourself.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Peerless Skill",
    level: 14,
    edition: "EDITION_2024",
    description:
      "When you make an ability check or attack roll and fail, you can expend one Bardic Inspiration die and add the number rolled to the roll, potentially turning the failure into a success. On a failure, the Bardic Inspiration die isn't expended.",
  },
];

// College of Valor 2024 text is NOT in SRD 5.2 (owner decision, #1224) — mirror-sourced from aidedd.org, Roll20's compendium, and D&D Beyond (agree word-for-mechanic).
const VALOR_SLUG = slug("bard-college-of-valor");
const COLLEGE_OF_VALOR_RAW: RawBardFeature[] = [
  {
    subclassSlug: VALOR_SLUG,
    name: "Bonus Proficiencies",
    level: 3,
    edition: "EDITION_2014",
    description: "You gain proficiency with medium armor, shields, and martial weapons.",
    // PHB'14 p.56: grants these outright, no choice involved.
    improvements: [
      { target: "armorProficiency", amount: 1, key: "medium" },
      { target: "armorProficiency", amount: 1, key: "shield" },
      { target: "weaponProficiency", amount: 1, key: "Martial Weapons" },
    ],
  },
  // Bonus Proficiencies has no EDITION_2024 row: renamed outright to Martial Training below, never edited in place.
  {
    subclassSlug: VALOR_SLUG,
    name: "Martial Training",
    level: 3,
    edition: "EDITION_2024",
    description:
      "You gain proficiency with Martial weapons, Medium armor, and Shields. In addition, you can use a Simple or Martial weapon as a Spellcasting Focus for your Bard spells.",
  },
  {
    subclassSlug: VALOR_SLUG,
    name: "Combat Inspiration",
    level: 3,
    edition: "EDITION_2014",
    description:
      "A creature with a Bardic Inspiration die from you can also add it to a damage roll or use it as a reaction to add it to AC against one attack.",
  },
  {
    subclassSlug: VALOR_SLUG,
    name: "Combat Inspiration",
    level: 3,
    edition: "EDITION_2024",
    description:
      "A creature that has a Bardic Inspiration die from you can use it in one of two ways, in addition to its other uses: Defense — when an attack roll targets that creature, it can take a Reaction to roll the Bardic Inspiration die and add the number rolled to its AC against that attack, potentially causing the attack to miss; or Offense — immediately after the creature hits with an attack roll, it can roll the Bardic Inspiration die and add the number rolled to the attack's damage roll.",
  },
  {
    subclassSlug: VALOR_SLUG,
    name: "Extra Attack",
    level: 6,
    edition: "EDITION_2014",
    // PHB-only, not in SRD 5.1 or SRD 5.2 (#1530); no page verified.
    description: "You can attack twice whenever you take the Attack action.",
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 6, value: 2 }],
  },
  {
    subclassSlug: VALOR_SLUG,
    name: "Extra Attack",
    level: 6,
    // Keep derivedStat/derivedStatTiers on both edition rows — class-feature-migration.test.ts's DERIVED_STAT_ROW_KEYS depends on this tuple.
    edition: "EDITION_2024",
    description:
      "You can attack twice whenever you take the Attack action on your turn. Immediately after you attack this way, you can cast one of your cantrips that has a casting time of an action instead of making one of those attacks.",
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 6, value: 2 }],
  },
  {
    subclassSlug: VALOR_SLUG,
    name: "Battle Magic",
    level: 14,
    edition: "EDITION_2014",
    description: "When you use your action to cast a bard spell, make one weapon attack as a bonus action.",
  },
  {
    subclassSlug: VALOR_SLUG,
    name: "Battle Magic",
    level: 14,
    edition: "EDITION_2024",
    description: "After you cast a spell that has a casting time of an action, you can make one weapon attack as a Bonus Action.",
  },
];

export const BARD_FEATURES: ClassFeatureSeedRow[] = [...BARD_BASE_RAW, ...COLLEGE_OF_LORE_RAW, ...COLLEGE_OF_VALOR_RAW].flatMap(expand);
