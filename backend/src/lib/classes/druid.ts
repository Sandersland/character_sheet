import type { ClassDefinition, DerivedFeature } from "./types.js";

const DRUID_FEATURES: DerivedFeature[] = [
  {
    name: "Druidic",
    level: 1,
    source: "class",
    description:
      "You know Druidic, the secret language of druids. You can speak it and leave hidden messages in natural surroundings.",
  },
  {
    name: "Spellcasting",
    level: 1,
    source: "class",
    description:
      "You cast spells using Wisdom. Full-caster progression. You prepare a number of druid spells equal to your Wisdom modifier + your druid level (minimum 1).",
  },
  {
    name: "Wild Shape",
    level: 2,
    source: "class",
    description:
      "As an action, transform into a beast you have seen. Max CR: 1/4 at L2 (no flying or swimming speed); 1/2 at L4 (no flying speed); 1 at L8. You retain your mental stats and class features but use the beast's physical stats. Lasts up to half your druid level in hours (minimum 1). Reverts when reduced to 0 HP.",
  },
  {
    name: "Timeless Body",
    level: 18,
    source: "class",
    description:
      "The primal magic you wield causes you to age more slowly. For every 10 years that pass, your body ages only 1 year.",
  },
  {
    name: "Beast Spells",
    level: 18,
    source: "class",
    description:
      "You can cast many druid spells in any shape you assume using Wild Shape. You can perform the somatic and verbal components of a druid spell while in beast form.",
  },
  {
    name: "Archdruid",
    level: 20,
    source: "class",
    description:
      "You can use your Wild Shape an unlimited number of times. Additionally, you can ignore the verbal and somatic components of your druid spells, as well as any material components lacking a cost.",
  },
];

const CIRCLE_OF_THE_LAND_FEATURES: DerivedFeature[] = [
  {
    name: "Bonus Cantrip",
    level: 2,
    source: "subclass",
    description:
      "You learn one additional druid cantrip of your choice.",
  },
  {
    name: "Natural Recovery",
    level: 2,
    source: "subclass",
    description:
      "Once per long rest during a short rest, choose expended spell slots to recover. The total levels of slots recovered can be up to half your druid level (rounded up, max 5th level).",
  },
  {
    name: "Circle Spells",
    level: 3,
    source: "subclass",
    description:
      "You gain access to additional spells based on your chosen terrain (arctic, coast, desert, forest, grassland, mountain, swamp, or Underdark). These spells are always prepared for you and don't count against your prepared spells.",
  },
  {
    name: "Land's Stride",
    level: 6,
    source: "subclass",
    description:
      "Moving through nonmagical difficult terrain costs no extra movement, and you can pass through nonmagical plants without being slowed. Advantage on saves against magically created or manipulated plants.",
  },
  {
    name: "Nature's Ward",
    level: 10,
    source: "subclass",
    description:
      "Immune to poison and disease. Elementals and fey can't charm or frighten you.",
  },
  {
    name: "Nature's Sanctuary",
    level: 14,
    source: "subclass",
    description:
      "When a beast or plant attacks you, it must make a Wisdom saving throw (DC 8 + proficiency + Wisdom modifier) or choose a different target. On a success, it is immune to this feature for 24 hours.",
  },
];

const CIRCLE_OF_THE_MOON_FEATURES: DerivedFeature[] = [
  {
    name: "Combat Wild Shape",
    level: 2,
    source: "subclass",
    description:
      "You can use Wild Shape as a bonus action. While transformed, you can expend a spell slot as a bonus action to regain 1d8 HP per level of the slot expended.",
  },
  {
    name: "Circle Forms",
    level: 2,
    source: "subclass",
    description:
      "You can use Wild Shape to transform into beasts with a challenge rating as high as 1 (instead of the base druid table). Starting at level 6, the max CR equals your druid level divided by 3 (rounded down, minimum 1).",
  },
  {
    name: "Primal Strike",
    level: 6,
    source: "subclass",
    description:
      "Your attacks while in beast form count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks.",
  },
  {
    name: "Elemental Wild Shape",
    level: 10,
    source: "subclass",
    description:
      "Expend two uses of Wild Shape to transform into an air, earth, fire, or water elemental.",
  },
  {
    name: "Thousand Forms",
    level: 14,
    source: "subclass",
    description:
      "You can cast the Alter Self spell at will without expending a spell slot.",
  },
];

// Circle of the Moon's Circle Forms raise the Wild Shape CR cap: CR 1 at L2,
// then level÷3 (min 1) from L6. Other circles use the base druid table.
function wildShapeCrCap(level: number, subclassKey: string | undefined): string {
  if (subclassKey === "circle of the moon") {
    return String(level >= 6 ? Math.max(1, Math.floor(level / 3)) : 1);
  }
  return level >= 8 ? "1" : level >= 4 ? "1/2" : "1/4";
}

// Base Wild Shape speed restrictions lift with level, regardless of subclass.
function wildShapeSpeedNote(level: number): string {
  return level >= 8 ? "" : level >= 4 ? " (no flying speed)" : " (no flying or swimming speed)";
}

export const druid: ClassDefinition = {
  features: DRUID_FEATURES,
  resourceFn: (level, _abilityScores, _profBonus, subclassKey) => {
    if (level < 2) return [];
    const crCap = `${wildShapeCrCap(level, subclassKey)}${wildShapeSpeedNote(level)}`;
    return [
      {
        key: "wildShape",
        label: "Wild Shape",
        total: level >= 20 ? 99 : 2,
        recharge: "short-or-long",
        description: `Transform into a beast (max CR ${crCap}). Lasts up to ${Math.max(1, Math.floor(level / 2))} hour(s). Regain all uses on a short or long rest.${level >= 20 ? " Unlimited uses (Archdruid)." : ""}`,
      },
    ];
  },
  subclasses: {
    "circle of the land": { grantLevel: 2, features: CIRCLE_OF_THE_LAND_FEATURES },
    "circle of the moon": { grantLevel: 2, features: CIRCLE_OF_THE_MOON_FEATURES },
  },
};
