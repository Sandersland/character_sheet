// ── Feat catalog (2024 + 2014 rules) ────────────────────────────────────────────
// SRD 5.2.1 pp. 87-88 for the 16 SRD feats; PHB'24 for the re-authored rest;
// PHB'14 pp. 72/82/91 (= SRD 5.1) for the six 2014 Fighting Style feats (#1311).
// abilityOptions/abilityIncrease drive the half-feat bump; category/levelPrerequisite
// gate which slot may take a feat (see featOfferedForAsiSlot). Ability Score
// Improvement is NOT seeded — it stays the takeAsi advancement branch.
// Deeper per-feat mechanics are surfaced as description text, not automated.

import type { SeedEdition } from "./edition.js";

// Local (unexported) mirror of the backend FeatCategory (lib/srd/feats.ts) and
// frontend FeatCategory (types/character/leveling.ts) — three copies because the
// seed can't import from @/lib/ (tsx alias) or the frontend; update all three together.
type FeatCategory = "origin" | "general" | "fighting_style" | "epic_boon";

export interface FeatImprovement {
  target: string;
  amount: number;
  perLevel?: boolean;
  key?: string;
  scaling?: "proficiencyBonus";
}

export interface FeatSeed {
  name: string;
  description: string;
  category: FeatCategory;
  levelPrerequisite?: number;
  repeatable?: boolean;
  prerequisite?: string;
  abilityOptions?: string[];
  abilityIncrease?: number;
  improvements?: FeatImprovement[];
  // Omitted = shared (NULL column, valid in both editions, #1306). Only a feat
  // that mechanically diverges between editions sets this.
  edition?: SeedEdition;
}

const ALL_ABILITIES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

export const FEATS: FeatSeed[] = [
  // ── Origin feats (SRD 5.2.1 + PHB'24) — no level prerequisite ──────────────
  // Alert forks by edition (#1306 worked example — SRD 5.2 vs PHB'14 p.165):
  // 2024 scales the initiative bonus with Proficiency Bonus and adds the
  // initiative-swap option; 2014 is a flat +5 with no swap. Two rows sharing
  // the name "Alert", resolved by resolveEditionRow.
  {
    name: "Alert",
    description:
      "You gain a bonus to Initiative rolls equal to your Proficiency Bonus. Immediately after rolling Initiative you can swap your Initiative with a willing ally in the same combat (not if either of you is Incapacitated).",
    category: "origin",
    improvements: [{ target: "initiative", amount: 1, scaling: "proficiencyBonus" }],
    edition: "EDITION_2024",
  },
  {
    name: "Alert",
    description:
      "You gain a +5 bonus to initiative. You can't be surprised while you are conscious. Other creatures don't gain advantage on attack rolls against you as a result of being unseen by you.",
    category: "origin",
    improvements: [{ target: "initiative", amount: 5 }],
    edition: "EDITION_2014",
  },
  {
    name: "Magic Initiate",
    description:
      "Choose Cleric, Druid, or Wizard. You learn two cantrips and one level-1 spell from that class's spell list. You can cast the level-1 spell once without a spell slot per Long Rest (or with slots you have). Your spellcasting ability is Intelligence, Wisdom, or Charisma to match the class. Repeatable, choosing a different class each time.",
    category: "origin",
    repeatable: true,
  },
  {
    name: "Savage Attacker",
    description:
      "Once per turn when you hit with a weapon, you can roll the weapon's damage dice twice and use either roll against the target.",
    category: "origin",
  },
  {
    name: "Skilled",
    description:
      "You gain proficiency in any combination of three skills or tools of your choice. Repeatable.",
    category: "origin",
    repeatable: true,
  },
  {
    name: "Lucky",
    description:
      "You have a number of Luck Points equal to your Proficiency Bonus, regained on a Long Rest. Spend a point to give yourself Advantage on a D20 Test, or to impose Disadvantage on an attack roll made against you.",
    category: "origin",
  },
  {
    name: "Tough",
    description:
      "Your Hit Point maximum increases by an amount equal to twice your character level when you gain this feat. Whenever you gain a level thereafter, your Hit Point maximum increases by an additional 2.",
    category: "origin",
    improvements: [{ target: "maxHp", amount: 2, perLevel: true }],
  },
  {
    name: "Tavern Brawler",
    // PHB'24 Tavern Brawler is Origin and grants NO ability increase (unlike 2014).
    description:
      "You are proficient with improvised weapons. Your unarmed strikes deal 1d4 bludgeoning damage, and when you roll a 1 on that die you can reroll it once. Once per turn when you hit with an unarmed strike as part of the Attack action, you can push the target 5 feet.",
    category: "origin",
    improvements: [
      { target: "weaponProficiency", amount: 1, key: "Improvised Weapons" },
      { target: "unarmedDamageDie", amount: 4 },
    ],
  },

  // ── Fighting Style feats (SRD 5.2.1) — granted by a Fighting Style feature ──
  // Improvements carry the same derived effects the former scalar styles applied
  // (#1137). Great Weapon Fighting's damage-die floor is not automated, so it stays
  // descriptive. Stamped EDITION_2024 (#1311): SRD 5.2 has exactly these four names
  // and any class with the Fighting Style feature may take any of them (no
  // per-class subset, unlike 2014 below) — content transcribed from SRD 5.2.1, not
  // a universal row, per the ACTIONS/#1430 "no shared row stays edition-NULL"
  // precedent.
  {
    name: "Archery",
    description: "You gain a +2 bonus to attack rolls you make with ranged weapons.",
    category: "fighting_style",
    prerequisite: "Fighting Style feature",
    improvements: [{ target: "rangedAttackRoll", amount: 2 }],
    edition: "EDITION_2024",
  },
  {
    name: "Defense",
    description: "While you are wearing armor, you gain a +1 bonus to Armor Class.",
    category: "fighting_style",
    prerequisite: "Fighting Style feature",
    improvements: [{ target: "armorClassWhileArmored", amount: 1 }],
    edition: "EDITION_2024",
  },
  {
    name: "Great Weapon Fighting",
    description:
      "When you roll damage for an attack with a melee weapon you are wielding with two hands, you can treat any 1 or 2 on a damage die as a 3. The weapon must have the Two-Handed or Versatile property.",
    category: "fighting_style",
    prerequisite: "Fighting Style feature",
    edition: "EDITION_2024",
  },
  {
    name: "Two-Weapon Fighting",
    // SRD 5.2.1: the off-hand attack requires a Light weapon in each hand.
    description:
      "When you make the extra attack of the Two-Weapon Fighting rule while wielding a weapon that has the Light property in each hand, you can add your ability modifier to that attack's damage.",
    category: "fighting_style",
    prerequisite: "Fighting Style feature",
    improvements: [{ target: "offhandAbilityDamage", amount: 1 }],
    edition: "EDITION_2024",
  },

  // ── 2014 Fighting Style feats (PHB'14 p. 72 Fighter / p. 82 Paladin / p. 91
  // Ranger, = SRD 5.1) — #1311. A Fighting Style is per-class in 2014 (Fighter
  // gets all six; Paladin/Ranger get a four-style subset each), but the
  // per-class option gating is #1495's scope, not this one — every 2014 class
  // with the feature is offered all six rows here until that lands. Dueling
  // and Protection have no SRD 5.2 counterpart, so they exist only as
  // EDITION_2014 rows. Archery/Defense/Two-Weapon Fighting carry the same
  // improvement as their 2024 sibling (the derived effect is identical; only
  // the transcribed wording differs) — Great Weapon Fighting's reroll and
  // Protection's imposed-disadvantage-on-another-creature's-roll stay
  // descriptive (self-or-announce; GWF also untracked in 2024 above).
  {
    name: "Archery",
    description: "You gain a +2 bonus to attack rolls you make with ranged weapons.",
    category: "fighting_style",
    prerequisite: "Fighting Style feature",
    improvements: [{ target: "rangedAttackRoll", amount: 2 }],
    edition: "EDITION_2014",
  },
  {
    name: "Defense",
    description: "While you are wearing armor, you gain a +1 bonus to AC.",
    category: "fighting_style",
    prerequisite: "Fighting Style feature",
    improvements: [{ target: "armorClassWhileArmored", amount: 1 }],
    edition: "EDITION_2014",
  },
  {
    name: "Dueling",
    description:
      "When you are wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.",
    category: "fighting_style",
    prerequisite: "Fighting Style feature",
    edition: "EDITION_2014",
  },
  {
    name: "Great Weapon Fighting",
    description:
      "When you roll a 1 or 2 on a damage die for an attack you make with a melee weapon that you are wielding with two hands, you can reroll the die and must use the new roll, even if the new roll is a 1 or a 2. The weapon must have the two-handed or versatile property for you to gain this benefit.",
    category: "fighting_style",
    prerequisite: "Fighting Style feature",
    edition: "EDITION_2014",
  },
  {
    name: "Protection",
    description:
      "When a creature you can see attacks a target other than you that is within 5 feet of you, you can use your reaction to impose disadvantage on the attack roll. You must be wielding a shield.",
    category: "fighting_style",
    prerequisite: "Fighting Style feature",
    edition: "EDITION_2014",
  },
  {
    name: "Two-Weapon Fighting",
    description:
      "When you engage in two-weapon fighting, you can add your ability modifier to the damage of the second attack.",
    category: "fighting_style",
    prerequisite: "Fighting Style feature",
    improvements: [{ target: "offhandAbilityDamage", amount: 1 }],
    edition: "EDITION_2014",
  },

  // ── General feats (level 4+) — each grants +1 to a listed ability ──────────
  {
    name: "Grappler",
    description:
      "You have Advantage on attack rolls against a creature you have Grappled, and you can move a creature Grappled by you without the extra movement cost. You can also attempt to Grapple as part of the Attack action.",
    category: "general",
    levelPrerequisite: 4,
    prerequisite: "Strength or Dexterity 13+",
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
  },
  {
    name: "Actor",
    description:
      "You have Advantage on Charisma (Deception) and Charisma (Performance) checks when trying to pass yourself off as a different person, and you can mimic the speech or sounds of another creature you have heard.",
    category: "general",
    levelPrerequisite: 4,
    prerequisite: "Charisma 13+",
    abilityOptions: ["charisma"],
    abilityIncrease: 1,
  },
  {
    name: "Athlete",
    description:
      "You have a Climb Speed equal to your Speed, standing up from Prone costs only 5 feet of movement, and you can make a running long or high jump after moving only 5 feet on foot.",
    category: "general",
    levelPrerequisite: 4,
    prerequisite: "Strength or Dexterity 13+",
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
  },
  {
    name: "Durable",
    description:
      "You have Advantage on Death Saving Throws. As a Bonus Action you can expend one Hit Point Die, roll it, add your Constitution modifier, and regain that many Hit Points.",
    category: "general",
    levelPrerequisite: 4,
    abilityOptions: ["constitution"],
    abilityIncrease: 1,
  },
  {
    name: "Keen Mind",
    description:
      "You gain proficiency (or Expertise) in one of Arcana, History, Investigation, Nature, or Religion, and you can take the Study action as a Bonus Action.",
    category: "general",
    levelPrerequisite: 4,
    prerequisite: "Intelligence 13+",
    abilityOptions: ["intelligence"],
    abilityIncrease: 1,
  },
  {
    name: "Observant",
    description:
      "You gain proficiency (or Expertise) in one of Insight, Investigation, or Perception, and you can take the Search action as a Bonus Action.",
    category: "general",
    levelPrerequisite: 4,
    prerequisite: "Intelligence or Wisdom 13+",
    abilityOptions: ["intelligence", "wisdom"],
    abilityIncrease: 1,
  },
  {
    name: "Resilient",
    description:
      "Increase the chosen ability score, and you gain proficiency in saving throws using that ability.",
    category: "general",
    levelPrerequisite: 4,
    abilityOptions: ALL_ABILITIES,
    abilityIncrease: 1,
  },
  {
    name: "Sentinel",
    description:
      "When you hit a creature with an Opportunity Attack, its Speed becomes 0 for the rest of the turn. Creatures provoke an Opportunity Attack from you even if they Disengage, and when a creature within 5 feet attacks a target other than you, you can make an Opportunity Attack against it.",
    category: "general",
    levelPrerequisite: 4,
    prerequisite: "Strength or Dexterity 13+",
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
  },
  {
    name: "War Caster",
    description:
      "You have Advantage on Constitution saving throws to maintain Concentration, you can perform somatic components with hands holding weapons or a shield, and you can cast a spell as an Opportunity Attack reaction instead of making a melee attack.",
    category: "general",
    levelPrerequisite: 4,
    prerequisite: "Spellcasting or Pact Magic feature",
    abilityOptions: ["intelligence", "wisdom", "charisma"],
    abilityIncrease: 1,
  },
  {
    name: "Great Weapon Master",
    description:
      "When you hit a creature with a Heavy weapon as part of the Attack action, you deal extra damage equal to your Proficiency Bonus. When you score a Critical Hit or reduce a creature to 0 Hit Points with a melee weapon, you can make one melee weapon attack as a Bonus Action.",
    category: "general",
    levelPrerequisite: 4,
    abilityOptions: ["strength"],
    abilityIncrease: 1,
  },
  {
    name: "Sharpshooter",
    description:
      "Attacking at long range doesn't impose Disadvantage on your ranged weapon attack rolls, your ranged weapon attacks ignore Half and Three-Quarters Cover, and being within 5 feet of an enemy doesn't impose Disadvantage on your ranged attack rolls.",
    category: "general",
    levelPrerequisite: 4,
    prerequisite: "Dexterity 13+",
    abilityOptions: ["dexterity"],
    abilityIncrease: 1,
  },
  {
    name: "Polearm Master",
    description:
      "When you attack with a Quarterstaff, Spear, or Heavy weapon with the Reach property as part of the Attack action, you can make a Bonus Action melee attack with the opposite end (1d4 bludgeoning). While wielding such a weapon, creatures provoke an Opportunity Attack from you when they enter your reach.",
    category: "general",
    levelPrerequisite: 4,
    prerequisite: "Strength or Dexterity 13+",
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
  },
  {
    name: "Crossbow Expert",
    description:
      "You ignore the Loading property of crossbows and can load them without a free hand, being within 5 feet of an enemy doesn't impose Disadvantage on your ranged attack rolls, and you can add your ability modifier to the extra attack of a Hand Crossbow with the Light property.",
    category: "general",
    levelPrerequisite: 4,
    prerequisite: "Dexterity 13+",
    abilityOptions: ["dexterity"],
    abilityIncrease: 1,
  },
  {
    name: "Shield Master",
    description:
      "If you attack with a weapon as part of the Attack action, you can make a Bonus Action shield bash (Strength save DC 8 + Strength modifier + Proficiency Bonus or be pushed 5 feet or knocked Prone), and you can use a Reaction to take no damage on a successful Dexterity save while wielding a Shield.",
    category: "general",
    levelPrerequisite: 4,
    prerequisite: "Shield Training",
    abilityOptions: ["strength"],
    abilityIncrease: 1,
  },
  {
    name: "Heavily Armored",
    description: "You gain training with Heavy armor.",
    category: "general",
    levelPrerequisite: 4,
    prerequisite: "Medium Armor Training",
    abilityOptions: ["strength", "constitution"],
    abilityIncrease: 1,
    improvements: [{ target: "armorProficiency", amount: 1, key: "heavy" }],
  },
  {
    name: "Lightly Armored",
    // PHB'24: shield training moved here from Moderately Armored.
    description: "You gain training with Light armor and Shields.",
    category: "general",
    levelPrerequisite: 4,
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
    improvements: [
      { target: "armorProficiency", amount: 1, key: "light" },
      { target: "armorProficiency", amount: 1, key: "shield" },
    ],
  },
  {
    name: "Moderately Armored",
    // PHB'24: grants Medium armor only — Shields moved to Lightly Armored.
    description: "You gain training with Medium armor.",
    category: "general",
    levelPrerequisite: 4,
    prerequisite: "Light Armor Training",
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
    improvements: [{ target: "armorProficiency", amount: 1, key: "medium" }],
  },
  {
    name: "Weapon Master",
    // Description-only: the Weapon Mastery property wiring is #1138.
    description:
      "You gain the Weapon Mastery property of one Simple or Martial weapon of your choice with which you are proficient. You can change that choice after a Long Rest.",
    category: "general",
    levelPrerequisite: 4,
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
  },
  {
    name: "Speedy",
    // PHB'24 successor to the 2014 "Mobile" feat.
    description:
      "Your Speed increases by 10 feet. When you take the Dash action, Difficult Terrain doesn't cost you extra movement for that turn, and Opportunity Attacks have Disadvantage against you.",
    category: "general",
    levelPrerequisite: 4,
    prerequisite: "Dexterity or Constitution 13+",
    abilityOptions: ["dexterity", "constitution"],
    abilityIncrease: 1,
    improvements: [{ target: "speed", amount: 10 }],
  },

  // ── Epic Boons (SRD 5.2.1) — level 19+, +1 to an ability (max 30) ──────────
  {
    name: "Boon of Combat Prowess",
    description:
      "When you miss with an attack roll against a creature you can see, you can hit instead. Once you use this benefit, you can't use it again until you finish a Short or Long Rest.",
    category: "epic_boon",
    levelPrerequisite: 19,
    abilityOptions: ALL_ABILITIES,
    abilityIncrease: 1,
  },
  {
    name: "Boon of Dimensional Travel",
    description:
      "Immediately after you take the Attack, Magic, or Dash action, you can teleport up to 30 feet to an unoccupied space you can see.",
    category: "epic_boon",
    levelPrerequisite: 19,
    abilityOptions: ALL_ABILITIES,
    abilityIncrease: 1,
  },
  {
    name: "Boon of Fate",
    description:
      "When you or a creature within 60 feet of you makes an ability check, attack roll, or saving throw, you can roll a Fate die (1d10) and add it to the roll. You can use this benefit a number of times equal to your Charisma modifier per Long Rest.",
    category: "epic_boon",
    levelPrerequisite: 19,
    abilityOptions: ALL_ABILITIES,
    abilityIncrease: 1,
  },
  {
    name: "Boon of Irresistible Offense",
    description:
      "Your Bludgeoning, Piercing, and Slashing damage ignores Resistance. When you roll a 20 on the d20 for an attack roll, you can deal extra damage to the target equal to the score of the ability increased by this feat.",
    category: "epic_boon",
    levelPrerequisite: 19,
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
  },
  {
    name: "Boon of Spell Recall",
    description:
      "You can cast any spell you have prepared without expending a spell slot, provided the spell has a level equal to or less than half your Proficiency Bonus (rounded down). Once you do so, you can't use this benefit again until you finish a Long Rest.",
    category: "epic_boon",
    levelPrerequisite: 19,
    prerequisite: "Spellcasting Feature",
    abilityOptions: ["intelligence", "wisdom", "charisma"],
    abilityIncrease: 1,
  },
  {
    name: "Boon of the Night Spirit",
    description:
      "While entirely within Dim Light or Darkness, you have Resistance to all damage except Radiant and Psychic, and you can take a Magic action to meld into an area of Dim Light or Darkness, becoming Invisible until you move or take an action.",
    category: "epic_boon",
    levelPrerequisite: 19,
    abilityOptions: ALL_ABILITIES,
    abilityIncrease: 1,
  },
  {
    name: "Boon of Truesight",
    description: "You have Truesight with a range of 60 feet.",
    category: "epic_boon",
    levelPrerequisite: 19,
    abilityOptions: ALL_ABILITIES,
    abilityIncrease: 1,
  },
];
