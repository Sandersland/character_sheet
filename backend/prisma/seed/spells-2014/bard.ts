// Bard is 4th in the row-ownership tie-break (Wizard > Cleric > Druid > Bard
// > Sorcerer > Warlock > Paladin > Ranger); this file owns only spells where
// Bard is highest priority (Vicious Mockery, Heroism, Enthrall, Compulsion,
// Glibness).
// SRD 5.1 (dnd5eapi.co).
import type { CatalogSpell } from "../spells.js";

export const BARD_SPELLS_2014: CatalogSpell[] = [
  {
    name: "Vicious Mockery",
    level: 0,
    school: "enchantment",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    description:
      "You unleash a string of insults laced with subtle enchantments at a creature you can see within range. If the target can hear you (though it need not understand you), it must succeed on a wisdom saving throw or take 1d4 psychic damage and have disadvantage on the next attack roll it makes before the end of its next turn. This spell's damage increases by 1d4 when you reach 5th level (2d4), 11th level (3d4), and 17th level (4d4).",
    classes: ["bard"],
    components: { verbal: true, somatic: false, material: false },
    attackType: "save",
    saveAbility: "wisdom",
    saveEffect: "none",
    effectKind: "damage",
    effectDiceCount: 1,
    effectDiceFaces: 4,
    damageType: "psychic",
    cantripScaling: true,
  },
  {
    name: "Heroism",
    level: 1,
    school: "enchantment",
    castingTime: "1 action",
    range: "Touch",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "A willing creature you touch is imbued with bravery. Until the spell ends, the creature is immune to being frightened and gains temporary hit points equal to your spellcasting ability modifier at the start of each of its turns. When the spell ends, the target loses any remaining temporary hit points from this spell. At Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, you can target one additional creature for each slot level above 1st.",
    classes: ["bard", "paladin"],
    components: { verbal: true, somatic: true, material: false },
    // Per-turn temp HP tied to the caster's ability modifier — no effectKind
    // (not a single-roll heal or an ac buff).
  },
  {
    name: "Enthrall",
    level: 2,
    school: "enchantment",
    castingTime: "1 action",
    range: "60 feet",
    duration: "1 minute",
    description:
      "You weave a distracting string of words, causing creatures of your choice that you can see within range and that can hear you to make a wisdom saving throw. Any creature that can't be charmed succeeds on this saving throw automatically, and if you or your companions are fighting a creature, it has advantage on the save. On a failed save, the target has disadvantage on Wisdom (Perception) checks made to perceive any creature other than you until the spell ends or until the target can no longer hear you. The spell ends if you are incapacitated or can no longer speak.",
    classes: ["bard", "warlock"],
    components: { verbal: true, somatic: true, material: false },
    attackType: "save",
    saveAbility: "wisdom",
    // Save gates a Perception-check disadvantage, not damage — no effectKind.
  },
  {
    name: "Compulsion",
    level: 4,
    school: "enchantment",
    castingTime: "1 action",
    range: "30 feet",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "Creatures of your choice that you can see within range and that can hear you must make a wisdom saving throw. A target automatically succeeds on this saving throw if it can't be charmed. On a failed save, a target is affected by this spell. Until the spell ends, you can use a bonus action on each of your turns to designate a direction that is horizontal to you. Each affected target must use as much of its movement as possible to move in that direction on its next turn. It can take any action before it moves. After moving in this way, it can make another Wisdom save to try to end the effect. A target isn't compelled to move into an obviously deadly hazard, such as a fire or a pit, but it will provoke opportunity attacks to move in the designated direction.",
    classes: ["bard"],
    components: { verbal: true, somatic: true, material: false },
    attackType: "save",
    saveAbility: "wisdom",
    // Forced movement, not damage/heal/AC — utility row.
  },
  {
    name: "Glibness",
    level: 8,
    school: "transmutation",
    castingTime: "1 action",
    range: "Self",
    duration: "1 hour",
    description:
      "Until the spell ends, when you make a Charisma check, you can replace the number you roll with a 15. Additionally, no matter what you say, magic that would determine if you are telling the truth indicates that you are being truthful.",
    classes: ["bard", "warlock"],
    components: { verbal: true, somatic: false, material: false },
    // Check-replacement + truth-detection immunity — not a channel the
    // engine models.
  },
];
