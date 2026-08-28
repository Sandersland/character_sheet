// Druid ClassFeature rows, authored as LITERAL seed data (#1226).
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// database calls or async write logic; expand() is pure content assembly.
// EDITION_2014 text is pinned byte-identical by druid-2014-snapshot.test.ts.
// EDITION_2024 base-class and Circle of the Land text is transcribed from SRD
// 5.2's own raw text; Circle of the Moon is NOT in SRD 5.2 and is
// mirror-sourced (owner decision) — see CIRCLE_OF_THE_MOON_RAW's own comment.
// A feature removed in 2024 keeps its 2014 row and gets no 2024 row; a rename
// or a level shift is a wholly new row, never one edited in place.
// Wild Shape's EDITION_2014 pool (base row below) and Circle of the Moon's
// own override of it (CIRCLE_OF_THE_MOON_RAW's Circle Forms row) are the
// first rows to use poolsFromRows' overrideRows mechanism (class-feature-
// rows.ts, #906/#1226): the Moon row declares the SAME resourceKey with its
// own totals/details, and deriveBaseLayer resolves the base pool from it
// instead whenever Circle of the Moon is the active subclass.
import type { ResourceTotalFormula } from "../../src/lib/classes/class-feature-rows.js";
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`druid-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawDruidFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions. */
  edition?: SeedEdition;
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula; shortRestRegain?: number }[];
  resourceDetailTiers?: { minLevel: number; label: string; value: string }[];
  conditionImmunities?: string[];
  activationCost?: string;
  costKind?: string;
  costPoolKey?: string;
  costBase?: number;
}

// Wild Shape's Duration text (PHB'14 p.66): floor(level / 2) hours (minimum
// 1), shared by every Circle — the first seeded use of resourceDetailTiers.
const WILD_SHAPE_DURATION_TIERS = [
  { minLevel: 2, label: "Duration", value: "1 hour(s)" },
  { minLevel: 4, label: "Duration", value: "2 hour(s)" },
  { minLevel: 6, label: "Duration", value: "3 hour(s)" },
  { minLevel: 8, label: "Duration", value: "4 hour(s)" },
  { minLevel: 10, label: "Duration", value: "5 hour(s)" },
  { minLevel: 12, label: "Duration", value: "6 hour(s)" },
  { minLevel: 14, label: "Duration", value: "7 hour(s)" },
  { minLevel: 16, label: "Duration", value: "8 hour(s)" },
  { minLevel: 18, label: "Duration", value: "9 hour(s)" },
  { minLevel: 20, label: "Duration", value: "10 hour(s)" },
];
const WILD_SHAPE_UNLIMITED_USES_TIER = { minLevel: 20, label: "Uses", value: "Unlimited (Archdruid)" };
// PHB'14 p.66: 2/level, unlimited (Archdruid) from level 20.
const WILD_SHAPE_TOTALS: { minLevel: number; total: ResourceTotalFormula }[] = [
  { minLevel: 2, total: 2 },
  { minLevel: 20, total: 99 },
];

function expand(raw: RawDruidFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Druid",
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    resourceKey: raw.resourceKey,
    resourceLabel: raw.resourceLabel,
    resourceRecharge: raw.resourceRecharge,
    resourceTotals: raw.resourceTotals,
    resourceDetailTiers: raw.resourceDetailTiers,
    conditionImmunities: raw.conditionImmunities,
    activationCost: raw.activationCost,
    costKind: raw.costKind,
    costPoolKey: raw.costPoolKey,
    costBase: raw.costBase,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

const DRUID_BASE_RAW: RawDruidFeature[] = [
  {
    subclassSlug: null,
    name: "Druidic",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You know Druidic, the secret language of druids. You can speak it and leave hidden messages in natural surroundings.",
  },
  {
    subclassSlug: null,
    name: "Druidic",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2: adds a free always-prepared Speak with Animals; hidden-message
    // detection becomes a stated Intelligence (Investigation) DC.
    description:
      "You know Druidic, the secret language of druids, and you can leave hidden messages that others can discover only with a successful DC 15 Intelligence (Investigation) check. You always have the Speak with Animals spell prepared, and you can cast it without expending a spell slot.",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You cast spells using Wisdom. Full-caster progression. You prepare a number of druid spells equal to your Wisdom modifier + your druid level (minimum 1).",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2: prepared count becomes a fixed per-level table rather than
    // Wisdom modifier + druid level.
    description:
      "You cast spells using Wisdom (spell save DC = 8 + your Proficiency Bonus + your Wisdom modifier). You know 2 Druid cantrips of your choice from the Druid spell list (3 at level 4, 4 at level 10), and you can replace one of them with another Druid cantrip whenever you finish a Long Rest. You prepare a number of Druid spells equal to the number shown on the Druid Features table for your level (4 at level 1, growing to 22 by level 20) after finishing a Long Rest, and you regain all expended spell slots when you finish a Long Rest. You can use a Druidic Focus as a spellcasting focus for your Druid spells.",
  },
  {
    subclassSlug: null,
    name: "Wild Shape",
    level: 2,
    edition: "EDITION_2014",
    description:
      "As an action, transform into a beast you have seen. Max CR: 1/4 at L2 (no flying or swimming speed); 1/2 at L4 (no flying speed); 1 at L8. You retain your mental stats and class features but use the beast's physical stats. Lasts up to half your druid level in hours (minimum 1). Reverts when reduced to 0 HP.",
    // SRD 5.1 / PHB'14 p.66: "As an action, you can magically transform..." —
    // an Action, 2/short-or-long-rest, unlimited (Archdruid) from level 20.
    // Circle of the Moon overrides this same resourceKey with its own totals
    // and Max CR curve — see CIRCLE_OF_THE_MOON_RAW's Circle Forms row.
    resourceKey: "wildShape",
    resourceLabel: "Wild Shape",
    resourceRecharge: "short-or-long",
    resourceTotals: WILD_SHAPE_TOTALS,
    resourceDetailTiers: [
      { minLevel: 2, label: "Max CR", value: "1/4 (no flying or swimming speed)" },
      { minLevel: 4, label: "Max CR", value: "1/2 (no flying speed)" },
      { minLevel: 8, label: "Max CR", value: "1" },
      ...WILD_SHAPE_DURATION_TIERS,
      WILD_SHAPE_UNLIMITED_USES_TIER,
    ],
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "wildShape",
    costBase: 1,
  },
  {
    subclassSlug: null,
    name: "Wild Shape",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2: a Bonus Action (2014's was an Action) granting Temp HP equal
    // to Druid level; a Fly Speed is allowed from level 8 (a Swim Speed was
    // never restricted — 2014's "no flying or swimming" note conflated the
    // two). The pool card reads this description verbatim (#1528
    // no-second-string), so it states the CR table and duration in prose.
    description:
      "As a Bonus Action, you transform into a Beast you have seen before, with a challenge rating of 1/4 or lower at level 2, 1/2 or lower at level 4, and 1 or lower starting at level 8 (a Fly Speed is allowed only from level 8 on; a Swim Speed is never restricted). You retain your own mental ability scores, personality, and Druid features while using the Beast's physical statistics, and you gain Temporary Hit Points equal to your Druid level when you transform. Your Wild Shape lasts for a number of hours equal to half your Druid level (round down), until you have 0 Hit Points, or until you use a Bonus Action to leave it early; using Wild Shape again also ends it. You can use this feature 2 times (3 at level 6, 4 at level 17), and you regain one expended use when you finish a Short Rest and all expended uses when you finish a Long Rest.",
    resourceKey: "wildShape",
    resourceLabel: "Wild Shape",
    resourceRecharge: "longRest",
    resourceTotals: [
      { minLevel: 2, total: 2, shortRestRegain: 1 },
      { minLevel: 6, total: 3, shortRestRegain: 1 },
      { minLevel: 17, total: 4, shortRestRegain: 1 },
    ],
    // SRD 5.2 / PHB'24 p.70: "As a Bonus Action, you shape-shift..." — a
    // Bonus Action, unlike 2014's Action above.
    activationCost: "bonusAction",
    costKind: "pool",
    costPoolKey: "wildShape",
    costBase: 1,
  },
  {
    subclassSlug: null,
    name: "Primal Order",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart. Magician's bonus is TO an
    // Intelligence check but EQUAL TO your Wisdom modifier — never an
    // "Intelligence modifier".
    description:
      "You have dedicated yourself to one of the following two ways of being a Druid, granting you a benefit; choose Magician or Warden. Magician: you learn one extra cantrip from the Druid spell list, and you gain a bonus to your Intelligence (Arcana or Nature) checks equal to your Wisdom modifier (minimum bonus of +1). Warden: you gain proficiency with Martial weapons and training with Medium armor.",
  },
  {
    subclassSlug: null,
    name: "Wild Companion",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart.
    description:
      "You can expend a spell slot or a use of your Wild Shape to cast the Find Familiar spell, without Material components; if you spend a spell slot, you cast it as a Magic action instead of its normal casting time. When you cast the spell in either way, the familiar is Fey instead of its usual type, and it disappears when you finish your next Long Rest.",
  },
  {
    subclassSlug: null,
    name: "Wild Resurgence",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart.
    description:
      "Once on each of your turns when you have no expended uses of Wild Shape, you can expend a spell slot (no action required) to regain one expended use of it. In addition, once per Long Rest, you can expend one use of your Wild Shape (no action required) to regain a level 1 spell slot.",
  },
  {
    subclassSlug: null,
    name: "Elemental Fury",
    level: 7,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart. Primal Strike here replaces
    // the 2014 Circle of the Moon subclass feature of the same name, now a
    // base-class option available to every Circle.
    description:
      "You've learned to channel primal magic through your spells and your Wild Shape attacks; choose Potent Spellcasting or Primal Strike. Potent Spellcasting: you add your Wisdom modifier to the damage you deal with any Druid cantrip. Primal Strike: once on each of your turns when you hit a target with an attack using a weapon or a Wild Shape Beast form's attack, you can deal an extra 1d8 damage of the following type of your choice: Cold, Fire, Lightning, or Thunder.",
  },
  {
    subclassSlug: null,
    name: "Improved Elemental Fury",
    level: 15,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart.
    description:
      "Your Elemental Fury improves. Your Potent Spellcasting's cantrips with a range of 10 feet or greater have their range increased by 300 feet, and your Primal Strike's extra damage increases to 2d8.",
  },
  {
    subclassSlug: null,
    name: "Timeless Body",
    level: 18,
    edition: "EDITION_2014",
    description:
      "The primal magic you wield causes you to age more slowly. For every 10 years that pass, your body ages only 1 year.",
  },
  {
    subclassSlug: null,
    name: "Beast Spells",
    level: 18,
    edition: "EDITION_2014",
    description:
      "You can cast many druid spells in any shape you assume using Wild Shape. You can perform the somatic and verbal components of a druid spell while in beast form.",
  },
  {
    subclassSlug: null,
    name: "Beast Spells",
    level: 18,
    edition: "EDITION_2024",
    // SRD 5.2: tightens the 2014 clause — now excludes any spell whose
    // Material component has a listed cost or is consumed by the spell,
    // rather than allowing every Material component silently.
    description:
      "You can cast many Druid spells in Wild Shape form. You can perform a spell's somatic and verbal components while transformed, but you can't provide a Material component unless that component has no listed cost and isn't consumed by the spell.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — 2014 keeps a plain ASI at 19 (the edition-
    // invariant ASI table, not a row). Text only; the feat grant is deferred.
    description: "You gain an Epic Boon feat of your choice (Boon of Fortitude recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Archdruid",
    level: 20,
    edition: "EDITION_2014",
    description:
      "You can use your Wild Shape an unlimited number of times. Additionally, you can ignore the verbal and somatic components of your druid spells, as well as any material components lacking a cost.",
  },
  {
    subclassSlug: null,
    name: "Archdruid",
    level: 20,
    edition: "EDITION_2024",
    // SRD 5.2: a full rewrite — three named benefits, the last folding in
    // what was Timeless Body's own 2014 row.
    description:
      "You gain the following three benefits. Evergreen Wild Shape: when you roll Initiative and have no uses of Wild Shape remaining, you regain one expended use. Nature Magician: as a Bonus Action, you can convert any number of your unexpended Wild Shape uses into one spell slot; the slot's level equals half the number of uses you convert, rounded down (minimum 1st level). You can do this once, and you regain the ability to do so when you finish a Long Rest. Longevity: the primal magic you wield causes you to age more slowly — for every 10 years that pass, your body ages only 1 year.",
  },
];

const CIRCLE_OF_THE_LAND_SLUG = slug("druid-circle-of-the-land");
const CIRCLE_OF_THE_LAND_RAW: RawDruidFeature[] = [
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Bonus Cantrip",
    level: 2,
    edition: "EDITION_2014",
    description: "You learn one additional druid cantrip of your choice.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Natural Recovery",
    level: 2,
    edition: "EDITION_2014",
    description:
      "Once per long rest during a short rest, choose expended spell slots to recover. The total levels of slots recovered can be up to half your druid level (rounded up, max 5th level).",
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Circle Spells",
    level: 3,
    edition: "EDITION_2014",
    description:
      "You gain access to additional spells based on your chosen terrain (arctic, coast, desert, forest, grassland, mountain, swamp, or Underdark). These spells are always prepared for you and don't count against your prepared spells.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Circle of the Land Spells",
    level: 3,
    edition: "EDITION_2024",
    description:
      "You always have certain spells prepared, based on a land type you choose from the Circle of the Land Spells table each time you finish a Long Rest — arid, polar, temperate, or tropical. These spells don't count against the number of Druid spells you can prepare. Arid: Blur, Burning Hands, Fire Bolt, Fireball, Blight, Wall of Stone. Polar: Fog Cloud, Hold Person, Ray of Frost, Sleet Storm, Ice Storm, Cone of Cold. Temperate: Misty Step, Shocking Grasp, Sleep, Lightning Bolt, Freedom of Movement, Tree Stride. Tropical: Acid Splash, Ray of Sickness, Web, Stinking Cloud, Polymorph, Insect Plague.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Land's Aid",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart.
    description:
      "As a Magic action, you expend a use of your Wild Shape to conjure spectral vines and vermin in a 10-foot-radius Sphere centered on a point you can see within 60 feet. Each creature of your choice in that area must make a Constitution saving throw against your spell save DC, taking 2d6 Necrotic damage on a failed save or half as much on a success. You can also choose one creature you can see in the area to regain 2d6 Hit Points. The damage and healing both increase to 3d6 when you reach level 10 and to 4d6 when you reach level 14.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Land's Stride",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Moving through nonmagical difficult terrain costs no extra movement, and you can pass through nonmagical plants without being slowed. Advantage on saves against magically created or manipulated plants.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Natural Recovery",
    level: 6,
    edition: "EDITION_2024",
    // SRD 5.2: level-shifts 2 -> 6 and adds a free-cast clause.
    description:
      "When you finish a Short Rest, you can choose expended spell slots to recover; the combined level of the slots can't exceed half your Druid level (round up), and none of them can be level 6 or higher. You can use this feature only once, and you regain the ability to do so when you finish a Long Rest. In addition, when you finish a Long Rest, you can cast one of your prepared Circle of the Land spells of level 1 or higher without expending a spell slot, provided the spell doesn't require a Material component with a cost.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Nature's Ward",
    level: 10,
    edition: "EDITION_2014",
    description: "Immune to poison and disease. Elementals and fey can't charm or frighten you.",
    // PHB'14 p.68 (#1121): poison immunity is unconditional — modeled here.
    // Disease has no ConditionKey, so it stays reminder text. The "by
    // elementals or fey" charm/fright qualifier is source-conditional and
    // deliberately NOT modeled: with no attacker model it would grant
    // unconditional immunity, more permissive than PHB'14 actually says (the
    // #1516/#1496 failure class).
    conditionImmunities: ["poisoned"],
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Nature's Ward",
    level: 10,
    edition: "EDITION_2024",
    // SRD 5.2: immunity narrows to the Poisoned condition (modeled, #1121);
    // the land-typed damage Resistance is a separate, unwired axis — text only.
    description:
      "You are immune to the Poisoned condition, and you have Resistance to a damage type based on your Druid Circle land: Fire if your land is arid, Cold if it's polar, Lightning if it's temperate, or Poison if it's tropical.",
    conditionImmunities: ["poisoned"],
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Nature's Sanctuary",
    level: 14,
    edition: "EDITION_2014",
    description:
      "When a beast or plant attacks you, it must make a Wisdom saving throw (DC 8 + proficiency + Wisdom modifier) or choose a different target. On a success, it is immune to this feature for 24 hours.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Nature's Sanctuary",
    level: 14,
    edition: "EDITION_2024",
    // SRD 5.2: a full rewrite — no saving throw at all.
    description:
      "As a Magic action, you conjure a protective terrain in a 15-foot Cube on ground you can see within 120 feet, lasting for 1 minute or until you die or have the Incapacitated condition. While within the Cube, you and your allies have Half Cover and the Resistance granted by your Nature's Ward feature, even if you don't currently have one active. As a Bonus Action, you can move the Cube up to 60 feet to a new spot on the ground you can see.",
  },
];

// Circle of the Moon is NOT in SRD 5.2 — its 2024 rows are mirror-sourced
// (owner decision, #1226) from two independent mirrors: dnd2024.wikidot.com's
// Circle of the Moon page (whose sibling Circle of the Land page is
// byte-equivalent to the real SRD 5.2 text) and wastedwizardgames.com's
// independent 2024 Druid subclass breakdown, which agrees on every number.
const CIRCLE_OF_THE_MOON_SLUG = slug("druid-circle-of-the-moon");
const CIRCLE_OF_THE_MOON_RAW: RawDruidFeature[] = [
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Combat Wild Shape",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You can use Wild Shape as a bonus action. While transformed, you can expend a spell slot as a bonus action to regain 1d8 HP per level of the slot expended.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Circle Forms",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You can use Wild Shape to transform into beasts with a challenge rating as high as 1 (instead of the base druid table). Starting at level 6, the max CR equals your druid level divided by 3 (rounded down, minimum 1).",
    // PHB'14 p.69: overrides the base Wild Shape row's OWN "wildShape"
    // resourceKey (class-feature-rows.ts's overrideRows mechanism) — same
    // totals/recharge, a different Max CR curve. Max CR is 1 from L2, then
    // level/3 (rounded down, minimum 1) from L6; the "(no flying...)" speed
    // notes are the same base-table notes every Circle carries below L8.
    resourceKey: "wildShape",
    resourceLabel: "Wild Shape",
    resourceRecharge: "short-or-long",
    resourceTotals: WILD_SHAPE_TOTALS,
    resourceDetailTiers: [
      { minLevel: 2, label: "Max CR", value: "1 (no flying or swimming speed)" },
      { minLevel: 4, label: "Max CR", value: "1 (no flying speed)" },
      { minLevel: 6, label: "Max CR", value: "2 (no flying speed)" },
      { minLevel: 8, label: "Max CR", value: "2" },
      { minLevel: 9, label: "Max CR", value: "3" },
      { minLevel: 12, label: "Max CR", value: "4" },
      { minLevel: 15, label: "Max CR", value: "5" },
      { minLevel: 18, label: "Max CR", value: "6" },
      ...WILD_SHAPE_DURATION_TIERS,
      WILD_SHAPE_UNLIMITED_USES_TIER,
    ],
  },
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Circle Forms",
    level: 3,
    edition: "EDITION_2024",
    // Mirror-sourced. Level-shifts 2 -> 3; the AC floor and temp-HP override
    // supersede the base Wild Shape feature's own values while transformed.
    description:
      "Beginning at level 3, you can transform into a Beast with a challenge rating as high as your Druid level divided by 3, rounded down (minimum challenge rating 1). While transformed, if your Armor Class would be lower than 13 plus your Wisdom modifier, you use 13 plus your Wisdom modifier instead. When you transform, you gain Temporary Hit Points equal to three times your Druid level, in place of the Temporary Hit Points your Wild Shape feature would otherwise grant.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Circle of the Moon Spells",
    level: 3,
    edition: "EDITION_2024",
    // Mirror-sourced. NEW in 2024 — no 2014 counterpart.
    description:
      "You always have certain spells prepared, and you can cast them while transformed by Wild Shape: Cure Wounds, Moonbeam, and Starry Wisp starting at level 3; Conjure Animals at level 5; Fount of Moonlight at level 7; and Mass Cure Wounds at level 9. These spells don't count against the number of Druid spells you can prepare.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Primal Strike",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Your attacks while in beast form count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Improved Circle Forms",
    level: 6,
    edition: "EDITION_2024",
    // Mirror-sourced. NEW in 2024, replacing Primal Strike (now a base-class
    // Elemental Fury option).
    description:
      "Your Circle Forms improve, granting you two benefits. Lunar Radiance: immediately after you hit a target with an attack while transformed by Wild Shape, you can change the attack's damage type to Radiant. Increased Toughness: you add your Wisdom modifier to any Constitution saving throws you make to maintain Concentration.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Elemental Wild Shape",
    level: 10,
    edition: "EDITION_2014",
    description: "Expend two uses of Wild Shape to transform into an air, earth, fire, or water elemental.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Moonlight Step",
    level: 10,
    edition: "EDITION_2024",
    // Mirror-sourced. NEW in 2024, replacing Elemental Wild Shape.
    resourceKey: "moonlightStep",
    resourceLabel: "Moonlight Step",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 10, total: { abilityMod: "wisdom", min: 1 } }],
    description:
      "As a Bonus Action, you teleport up to 30 feet to an unoccupied space you can see, and you have Advantage on the next attack roll you make before the end of this turn. You can use this feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest. You can also regain one expended use by expending a spell slot of level 2 or higher (no action required).",
  },
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Thousand Forms",
    level: 14,
    edition: "EDITION_2014",
    description: "You can cast the Alter Self spell at will without expending a spell slot.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Lunar Form",
    level: 14,
    edition: "EDITION_2024",
    // Mirror-sourced. NEW in 2024, replacing Thousand Forms.
    description:
      "Your connection to the moon grants you two benefits. Improved Lunar Radiance: once on each of your turns when you deal damage with an attack while transformed by Wild Shape, you can also deal an extra 2d10 Radiant damage. Shared Moonlight: when you use your Moonlight Step feature, you can bring along one willing creature within 10 feet of you, teleporting it to a space within 5 feet of your destination.",
  },
];

export const DRUID_FEATURES: ClassFeatureSeedRow[] = [...DRUID_BASE_RAW, ...CIRCLE_OF_THE_LAND_RAW, ...CIRCLE_OF_THE_MOON_RAW].flatMap(
  expand,
);
