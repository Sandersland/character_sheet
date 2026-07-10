import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition, DerivedFeature, RechargeOn } from "./types.js";

const BARD_FEATURES: DerivedFeature[] = [
  {
    name: "Spellcasting",
    level: 1,
    source: "class",
    description:
      "You cast spells using Charisma. Full-caster progression (same slot table as Cleric/Wizard). You know a set number of spells from the bard list.",
  },
  {
    name: "Bardic Inspiration",
    level: 1,
    source: "class",
    description:
      "As a bonus action, give one creature within 60 ft a Bardic Inspiration die (d6, becoming d8 at L5, d10 at L10, d12 at L15). They add it to one ability check, attack roll, or saving throw within 10 minutes.",
  },
  {
    name: "Jack of All Trades",
    level: 2,
    source: "class",
    description:
      "Add half your proficiency bonus (rounded down) to any ability check that doesn't already use your proficiency bonus.",
  },
  {
    name: "Song of Rest",
    level: 2,
    source: "class",
    description:
      "If you or any friendly creatures spend hit dice during a short rest and you perform, they regain extra HP: 1d6 (L2), d8 (L9), d10 (L13), d12 (L17).",
  },
  {
    name: "Expertise",
    level: 3,
    source: "class",
    description:
      "Choose two of your skill proficiencies (or one skill + Thieves' Tools). Your proficiency bonus is doubled for those skills. Two more skills at level 10.",
  },
  {
    name: "Font of Inspiration",
    level: 5,
    source: "class",
    description:
      "You regain all of your expended Bardic Inspiration uses on a short or long rest (previously only on a long rest).",
  },
  {
    name: "Countercharm",
    level: 6,
    source: "class",
    description:
      "As an action, start a performance that lasts until the end of your next turn. During that time, friendly creatures within 30 ft have advantage on saves against being frightened or charmed.",
  },
  {
    name: "Magical Secrets",
    level: 10,
    source: "class",
    description:
      "Choose two spells from any class (including this one). They count as bard spells for you. Two more at level 14, two more at level 18.",
  },
  {
    name: "Superior Inspiration",
    level: 20,
    source: "class",
    description:
      "When you roll initiative and have no uses of Bardic Inspiration remaining, you regain one use.",
  },
];

const COLLEGE_OF_LORE_FEATURES: DerivedFeature[] = [
  {
    name: "Bonus Proficiencies",
    level: 3,
    source: "subclass",
    description:
      "You gain proficiency in three skills of your choice.",
  },
  {
    name: "Cutting Words",
    level: 3,
    source: "subclass",
    description:
      "When a creature within 60 ft that you can see makes an attack roll, ability check, or damage roll, use your reaction and expend one Bardic Inspiration die to subtract the number rolled from the creature's roll.",
  },
  {
    name: "Additional Magical Secrets",
    level: 6,
    source: "subclass",
    description:
      "Learn two spells from any class (including this one). They count as bard spells for you. This is in addition to the Magical Secrets you get at level 10.",
  },
  {
    name: "Peerless Skill",
    level: 14,
    source: "subclass",
    description:
      "When making an ability check, expend one Bardic Inspiration die to add the number rolled to the check. You can use this feature even if you're the one inspiring yourself.",
  },
];

const COLLEGE_OF_VALOR_FEATURES: DerivedFeature[] = [
  {
    name: "Bonus Proficiencies",
    level: 3,
    source: "subclass",
    description:
      "You gain proficiency with medium armor, shields, and martial weapons.",
  },
  {
    name: "Combat Inspiration",
    level: 3,
    source: "subclass",
    description:
      "A creature with a Bardic Inspiration die from you can also add it to a damage roll or use it as a reaction to add it to AC against one attack.",
  },
  {
    name: "Extra Attack",
    level: 6,
    source: "subclass",
    description: "You can attack twice whenever you take the Attack action.",
  },
  {
    name: "Battle Magic",
    level: 14,
    source: "subclass",
    description:
      "When you use your action to cast a bard spell, make one weapon attack as a bonus action.",
  },
];

export const bard: ClassDefinition = {
  features: BARD_FEATURES,
  resourceFn: (level, abilityScores) => {
    const chaMod = abilityModifier(abilityScores.charisma ?? 10);
    const total = Math.max(1, chaMod);
    const die = level >= 15 ? "d12" : level >= 10 ? "d10" : level >= 5 ? "d8" : "d6";
    const recharge: RechargeOn = level >= 5 ? "short-or-long" : "longRest";
    return [
      {
        key: "bardicInspiration",
        label: "Bardic Inspiration",
        total,
        die,
        recharge,
        description: `Bonus action: grant one creature within 60 ft a Bardic Inspiration ${die}. They add it to one roll within 10 minutes. Regain all uses on ${level >= 5 ? "a short or long rest" : "a long rest"}.`,
      },
    ];
  },
  subclasses: {
    "college of lore": { grantLevel: 3, features: COLLEGE_OF_LORE_FEATURES },
    "college of valor": { grantLevel: 3, features: COLLEGE_OF_VALOR_FEATURES },
  },
};
