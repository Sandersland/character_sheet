// Warlock is 6th in the row-ownership tie-break (Wizard > Cleric > Druid >
// Bard > Sorcerer > Warlock > Paladin > Ranger); this file owns only spells
// no higher-priority class also has.
// Eldritch Blast and Hellish Rebuke are SRD 5.1 (dnd5eapi.co).
import type { CatalogSpell } from "../spells.js";

export const WARLOCK_SPELLS_2014: CatalogSpell[] = [
  {
    name: "Eldritch Blast",
    level: 0,
    school: "evocation",
    castingTime: "1 action",
    range: "120 feet",
    duration: "Instantaneous",
    description:
      "A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 force damage. The spell creates more than one beam when you reach higher levels: two beams at 5th level, three beams at 11th level, and four beams at 17th level. You can direct the beams at the same target or at different ones. Make a separate attack roll for each beam.",
    classes: ["warlock"],
    components: { verbal: true, somatic: true, material: false },
    attackType: "attack",
    effectKind: "damage",
    effectDiceCount: 1,
    effectDiceFaces: 10,
    damageType: "force",
    // PHB'14 p.110: the beam count is the scaling axis (two beams at 5th, three at 11th, four
    // at 17th), each beam its own attack roll — dice stay 1d10 per beam.
    cantripScaling: true,
    instanceCount: 1,
    instanceRoll: "each",
  },
  {
    name: "Hellish Rebuke",
    level: 1,
    school: "evocation",
    castingTime: "1 reaction",
    range: "60 feet",
    duration: "Instantaneous",
    description:
      "You point your finger, and the creature that damaged you is momentarily surrounded by hellish flames. The creature must make a Dexterity saving throw. It takes 2d10 fire damage on a failed save, or half as much damage on a successful one. At Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d10 for each slot level above 1st.",
    classes: ["warlock"],
    components: { verbal: true, somatic: true, material: false },
    attackType: "save",
    saveAbility: "dexterity",
    saveEffect: "half",
    effectKind: "damage",
    effectDiceCount: 2,
    effectDiceFaces: 10,
    damageType: "fire",
    upcastDicePerLevel: 1,
  },
  // PHB'14 p. 251.
  // 1d6 necrotic is a rider on later attacks, not spell-cast damage — no
  // effectKind/attackType.
  {
    name: "Hex",
    level: 1,
    school: "enchantment",
    castingTime: "1 bonus action",
    range: "90 feet",
    duration: "Up to 1 hour",
    concentration: true,
    description:
      "You place a curse on a creature that you can see within range. Until the spell ends, you deal an extra 1d6 necrotic damage to the target whenever you hit it with an attack. Also, choose one ability when you cast the spell. The target has disadvantage on ability checks made with the chosen ability. If the target drops to 0 hit points before this spell ends, you can use a bonus action on a subsequent turn of yours to curse a new creature. A remove curse cast on the target ends this spell early. At Higher Levels. When you cast this spell using a spell slot of 3rd or 4th level, you can maintain your concentration on the spell for up to 8 hours. When you use a spell slot of 5th level or higher, you can maintain your concentration on the spell for up to 24 hours.",
    classes: ["warlock"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "the petrified eye of a newt" },
  },
  // PHB'14 p. 215.
  // 5 temp HP and 5 cold damage are both flat — no effectKind (temp HP isn't
  // expressible as a heal roll).
  {
    name: "Armor of Agathys",
    level: 1,
    school: "abjuration",
    castingTime: "1 action",
    range: "Self",
    duration: "1 hour",
    description:
      "A protective magical force surrounds you, manifesting as a spectral frost that covers you and your gear. You gain 5 temporary hit points for the duration. If a creature hits you with a melee attack while you have these hit points, the creature takes 5 cold damage. At Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, both the temporary hit points and the cold damage increase by 5 for each slot level above 1st.",
    classes: ["warlock"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "a cup of water" },
  },
  // PHB'14 p. 215.
  {
    name: "Arms of Hadar",
    level: 1,
    school: "conjuration",
    castingTime: "1 action",
    range: "Self (10-foot radius)",
    duration: "Instantaneous",
    description:
      "You invoke the power of Hadar, the Dark Hunger. Tendrils of dark energy erupt from you and batter all creatures within 10 feet of you. Each creature in that area must make a Strength saving throw. On a failed save, a target takes 2d6 necrotic damage and can't take reactions until its next turn. On a successful save, the creature takes half as much damage but suffers no other effect. At Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d6 for each slot level above 1st.",
    classes: ["warlock"],
    components: { verbal: true, somatic: true, material: false },
    attackType: "save",
    saveAbility: "strength",
    saveEffect: "half",
    effectKind: "damage",
    effectDiceCount: 2,
    effectDiceFaces: 6,
    damageType: "necrotic",
    upcastDicePerLevel: 1,
  },
  // PHB'14 p. 251.
  // Two damage instances, different types and triggers (2d6 cold
  // unconditional; 2d6 acid on a Dexterity save) — no single
  // effectKind/attackType/damageType fits.
  {
    name: "Hunger of Hadar",
    level: 3,
    school: "conjuration",
    castingTime: "1 action",
    range: "150 feet",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "You open a gateway to the dark between the stars, a region infested with unknown horrors. A 20-foot-radius sphere of blackness and bitter cold appears, centered on a point within range and lasting for the duration. This void is filled with a cacophony of soft whispers and slurping noises that can be heard up to 30 feet away. No light, magical or otherwise, can illuminate the area, and creatures fully within the area are blinded. The void creates a warp in the fabric of space, and the area is difficult terrain. Any creature that starts its turn in the area takes 2d6 cold damage. Any creature that ends its turn in the area must succeed on a Dexterity saving throw or take 2d6 acid damage as milky, otherworldly tentacles rub against it.",
    classes: ["warlock"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "a pickled octopus tentacle" },
  },
];
