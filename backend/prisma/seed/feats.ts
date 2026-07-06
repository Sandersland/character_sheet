// ── Feat catalog ──────────────────────────────────────────────────────────────
// Curated SRD subset. abilityOptions/abilityIncrease drive the half-feat bump;
// empty abilityOptions = not a half-feat. Descriptions are concise summaries.
// Deeper per-feat mechanics (Lucky rerolls, Sentinel reactions, Mobile
// speed/disengage) are surfaced as description text, not automated.

export interface FeatImprovement {
  target: string;
  amount: number;
  perLevel?: boolean;
}

export interface FeatSeed {
  name: string;
  description: string;
  prerequisite?: string;
  abilityOptions?: string[];
  abilityIncrease?: number;
  improvements?: FeatImprovement[];
}

export const FEATS: FeatSeed[] = [
  // ── Full feats (no ability bump) ──────────────────────────────────────────
  {
    name: "Alert",
    description:
      "Always on the lookout for danger. You gain +5 to initiative rolls, can't be surprised while conscious, and other creatures don't gain advantage on attack rolls against you as a result of being unseen by you.",
    improvements: [{ target: "initiative", amount: 5 }],
  },
  {
    name: "Lucky",
    description:
      "You have 3 luck points. Whenever you make an attack roll, ability check, or saving throw, you can spend one luck point to roll an additional d20 and choose which result to use. You can also spend a luck point when a creature attacks you. Luck points refresh on a long rest.",
  },
  {
    name: "Mobile",
    description:
      "Your speed increases by 10 feet. When you take the Dash action, difficult terrain doesn't cost you extra movement for the rest of the turn. When you make a melee attack against a creature, you don't provoke opportunity attacks from that creature for the rest of the turn, whether or not you hit.",
    improvements: [{ target: "speed", amount: 10 }],
  },
  {
    name: "Sentinel",
    description:
      "You excel at seizing the opportune moment. Creatures you hit with opportunity attacks have their speed reduced to 0. Creatures within 5 feet of you provoke opportunity attacks even if they Disengage. When a creature within 5 feet attacks a target other than you, you can use a reaction to make a melee weapon attack against it.",
  },
  {
    name: "Skilled",
    description:
      "You gain proficiency in any combination of three skills or tools of your choice.",
  },
  {
    name: "Magic Initiate",
    description:
      "Choose a class: bard, cleric, druid, sorcerer, warlock, or wizard. You learn two cantrips and one 1st-level spell from that class's list. You can cast the 1st-level spell once per long rest using this feat (not using spell slots). Your spellcasting ability is the one associated with the chosen class.",
  },
  {
    name: "War Caster",
    description:
      "You have advantage on Constitution saving throws to maintain concentration on a spell when you take damage. You can perform the somatic components of spells even when you have weapons or a shield in one or both hands. When a hostile creature's movement provokes an opportunity attack from you, you can use your reaction to cast a spell at the creature instead of making an opportunity attack.",
    prerequisite: "Ability to cast at least one spell",
  },
  {
    name: "Great Weapon Master",
    description:
      "When you score a critical hit with a melee weapon or reduce a creature to 0 HP with a melee weapon, you can make one melee weapon attack as a bonus action. Before you make a melee attack with a heavy weapon, you can choose to take a −5 penalty to the attack roll. If the attack hits, you add +10 to the damage roll.",
  },
  {
    name: "Sharpshooter",
    description:
      "Attacking at long range doesn't impose disadvantage on your ranged weapon attack rolls. Your ranged weapon attacks ignore half cover and three-quarters cover. Before you make a ranged attack with a ranged weapon, you can choose to take a −5 penalty to the attack roll. If the attack hits, you add +10 to the damage roll.",
  },
  {
    name: "Polearm Master",
    description:
      "When you take the Attack action with a glaive, halberd, pike, or quarterstaff, you can use a bonus action to make a melee attack with the opposite end of the weapon (1d4 bludgeoning, uses same ability modifier). While you are wielding one of these weapons, other creatures provoke an opportunity attack from you when they enter your reach.",
  },
  {
    name: "Crossbow Expert",
    description:
      "You ignore the loading quality of crossbows. Being within 5 feet of a hostile creature doesn't impose disadvantage on ranged attack rolls. When you use the Attack action and attack with a one-handed weapon, you can use a bonus action to attack with a hand crossbow you are holding.",
  },
  {
    name: "Shield Master",
    description:
      "If you take the Attack action on your turn, you can use a bonus action to shove a creature with your shield. If you aren't incapacitated, you can add your shield's AC bonus to Dexterity saving throws against spells that target only you. You can use your reaction to halve the damage of a Dex-save-or-halve effect.",
  },
  {
    name: "Tough",
    description:
      "Your hit point maximum increases by an amount equal to twice your level when you gain this feat. Whenever you gain a level thereafter, your hit point maximum increases by an additional 2 HP.",
    improvements: [{ target: "maxHp", amount: 2, perLevel: true }],
  },
  // ── Half-feats (grant +1 to a chosen ability score) ───────────────────────
  {
    name: "Athlete",
    description:
      "+1 to Strength or Dexterity. When prone, standing up costs only 5 feet of movement. Climbing doesn't cost extra movement. Running long jump: add 1 extra foot per point of Str modifier.",
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
  },
  {
    name: "Actor",
    description:
      "+1 to Charisma. You have advantage on Deception and Performance checks when trying to pass yourself off as a different person. You can mimic the speech of another person or the sounds made by other creatures. Passive Insight DC 14 to notice.",
    abilityOptions: ["charisma"],
    abilityIncrease: 1,
  },
  {
    name: "Durable",
    description:
      "+1 to Constitution. When you roll a Hit Die to regain HP, the minimum number of HP you regain equals twice your Constitution modifier (minimum of 2).",
    abilityOptions: ["constitution"],
    abilityIncrease: 1,
  },
  {
    name: "Keen Mind",
    description:
      "+1 to Intelligence. You always know which way is north. You always know the number of hours until sunrise or sunset. You can accurately recall anything you have seen or heard within the past month.",
    abilityOptions: ["intelligence"],
    abilityIncrease: 1,
  },
  {
    name: "Observant",
    description:
      "+1 to Intelligence or Wisdom. If you can see a creature's mouth while it is speaking a language you understand, you can interpret what it's saying by reading lips. +5 bonus to your passive Perception and passive Investigation scores.",
    abilityOptions: ["intelligence", "wisdom"],
    abilityIncrease: 1,
  },
  {
    name: "Resilient",
    description:
      "+1 to the chosen ability. You gain proficiency in saving throws using the chosen ability.",
    abilityOptions: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"],
    abilityIncrease: 1,
  },
  {
    name: "Lightly Armored",
    description:
      "+1 to Strength or Dexterity. You gain proficiency with light armor.",
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
    improvements: [{ target: "armorProficiency", amount: 1, key: "light" }],
  },
  {
    name: "Moderately Armored",
    description:
      "+1 to Strength or Dexterity. You gain proficiency with medium armor and shields.",
    prerequisite: "Proficiency with light armor",
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
    improvements: [
      { target: "armorProficiency", amount: 1, key: "medium" },
      { target: "armorProficiency", amount: 1, key: "shield" },
    ],
  },
  {
    name: "Heavily Armored",
    description:
      "+1 to Strength. You gain proficiency with heavy armor.",
    prerequisite: "Proficiency with medium armor",
    abilityOptions: ["strength"],
    abilityIncrease: 1,
    improvements: [{ target: "armorProficiency", amount: 1, key: "heavy" }],
  },
  {
    name: "Weapon Master",
    description:
      "+1 to Strength or Dexterity. You gain proficiency with four weapons of your choice.",
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
    improvements: [
      { target: "weaponProficiency", amount: 1, key: "Longswords" },
      { target: "weaponProficiency", amount: 1, key: "Battleaxes" },
      { target: "weaponProficiency", amount: 1, key: "Warhammers" },
      { target: "weaponProficiency", amount: 1, key: "Greatswords" },
    ],
  },
  {
    name: "Tavern Brawler",
    description:
      "+1 to Strength or Constitution. You are proficient with improvised weapons and your " +
      "unarmed strikes deal 1d4 bludgeoning damage. When you hit a creature with an unarmed " +
      "strike or an improvised weapon on your turn, you can use a bonus action to attempt " +
      "to grapple the target.",
    abilityOptions: ["strength", "constitution"],
    abilityIncrease: 1,
    improvements: [
      { target: "weaponProficiency", amount: 1, key: "Improvised Weapons" },
      { target: "unarmedDamageDie", amount: 4 },
    ],
  },
];
