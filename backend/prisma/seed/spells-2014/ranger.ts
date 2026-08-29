import type { CatalogSpell } from "../spells.js";

export const RANGER_SPELLS_2014: CatalogSpell[] = [
  // PHB'14 p. 237.
  {
    name: "Ensnaring Strike",
    level: 1,
    school: "conjuration",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit a creature with a weapon attack before this spell ends, a writhing mass of thorny vines appears at the point of impact, and the target must succeed on a Strength saving throw or be restrained by the magical vines until the spell ends. A Large or larger creature has advantage on this saving throw. If the target succeeds on the save, the vines shrivel away. While restrained by this spell, the target takes 1d6 piercing damage at the start of each of its turns. A creature restrained by the vines or one that can touch the creature can use its action to make a Strength check against your spell save DC. On a success, the target is freed. At Higher Levels. If you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d6 for each slot level above 1st.",
    classes: ["ranger"],
    components: { verbal: true, somatic: false, material: false },
    attackType: "save",
    saveAbility: "strength",
  },
  // PHB'14 p. 249.
  {
    name: "Hail of Thorns",
    level: 1,
    school: "conjuration",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit a creature with a ranged weapon attack before the spell ends, this spell creates a rain of thorns that sprouts from your ranged weapon or ammunition. In addition to the normal effect of the attack, the target of the attack and each creature within 5 feet of it must make a Dexterity saving throw. A creature takes 1d10 piercing damage on a failed save, or half as much damage on a successful one. At Higher Levels. If you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d10 for each slot level above 1st (to a maximum of 6d10).",
    classes: ["ranger"],
    components: { verbal: true, somatic: false, material: false },
  },
  // SRD 5.1 (dnd5eapi.co).
  {
    name: "Hunter's Mark",
    level: 1,
    school: "divination",
    castingTime: "1 bonus action",
    range: "90 feet",
    duration: "Up to 1 hour",
    concentration: true,
    description:
      "You choose a creature you can see within range and mystically mark it as your quarry. Until the spell ends, you deal an extra 1d6 damage to the target whenever you hit it with a weapon attack, and you have advantage on any Wisdom (Perception) or Wisdom (Survival) check you make to find it. If the target drops to 0 hit points before this spell ends, you can use a bonus action on a subsequent turn of yours to mark a new creature. At Higher Levels. When you cast this spell using a spell slot of 3rd or 4th level, you can maintain your concentration on the spell for up to 8 hours. When you use a spell slot of 5th level or higher, you can maintain your concentration on the spell for up to 24 hours.",
    classes: ["ranger"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 228.
  {
    name: "Cordon of Arrows",
    level: 2,
    school: "transmutation",
    castingTime: "1 action",
    range: "5 feet",
    duration: "8 hours",
    description:
      "You plant four pieces of nonmagical ammunition—arrows or crossbow bolts—in the ground within range and lay magic upon them to protect an area. Until the spell ends, whenever a creature other than you comes within 30 feet of the ammunition for the first time on a turn or ends its turn there, one piece of ammunition flies up to strike it. The creature must succeed on a Dexterity saving throw or take 1d6 piercing damage. The piece of ammunition is then destroyed. The spell ends when no ammunition remains. When you cast this spell, you can designate any creatures you choose, and the spell ignores them. At Higher Levels. When you cast this spell using a spell slot of 3rd level or higher, the amount of ammunition that can be affected increases by two for each slot level above 2nd.",
    classes: ["ranger"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "four or more arrows or bolts" },
  },
  // PHB'14 p. 255.
  {
    name: "Lightning Arrow",
    level: 3,
    school: "transmutation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you make a ranged weapon attack during the spell's duration, the weapon's ammunition, or the weapon itself if it's a thrown weapon, transforms into a bolt of lightning. Make the attack roll as normal. The target takes 4d8 lightning damage on a hit, or half as much damage on a miss, instead of the weapon's normal damage. Whether you hit or miss, each creature within 10 feet of the target must make a Dexterity saving throw. Each of these creatures takes 2d8 lightning damage on a failed save, or half as much damage on a successful one. The piece of ammunition or weapon then returns to its normal form. At Higher Levels. When you cast this spell using a spell slot of 4th level or higher, the damage for both effects of the spell increases by 1d8 for each slot level above 3rd.",
    classes: ["ranger"],
    components: { verbal: true, somatic: true, material: false },
  },
  // PHB'14 p. 225.
  {
    name: "Conjure Barrage",
    level: 3,
    school: "conjuration",
    castingTime: "1 action",
    range: "Self (60-ft cone)",
    duration: "Instantaneous",
    description:
      "You throw a nonmagical weapon or fire a piece of nonmagical ammunition into the air to create a cone of identical weapons that shoot forward and then disappear. Each creature in a 60-foot cone must succeed on a Dexterity saving throw. A creature takes 3d8 damage on a failed save, or half as much damage on a successful one. The damage type is the same as that of the weapon or ammunition used as a component.",
    classes: ["ranger"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "one piece of ammunition or a thrown weapon" },
  },
  // Level 4: none owned here — Grasping Vine (Ranger's only 4th-level PHB'14 spell) is owned by DRUID_SPELLS_2014.
  // PHB'14 p. 226.
  {
    name: "Conjure Volley",
    level: 5,
    school: "conjuration",
    castingTime: "1 action",
    range: "150 feet",
    duration: "Instantaneous",
    description:
      "You fire a piece of nonmagical ammunition from a ranged weapon or throw a nonmagical weapon into the air and choose a point within range. Hundreds of duplicates of the ammunition or weapon fall in a volley from above and then disappear. Each creature in a 40-foot-radius, 20-foot-high cylinder centered on that point must make a Dexterity saving throw. A creature takes 8d8 damage on a failed save, or half as much damage on a successful one. The damage type is the same as that of the ammunition or weapon.",
    classes: ["ranger"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "one piece of ammunition or one thrown weapon" },
  },
  // PHB'14 p. 279.
  {
    name: "Swift Quiver",
    level: 5,
    school: "transmutation",
    castingTime: "1 bonus action",
    range: "Touch",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "You transmute your quiver so it produces an endless supply of nonmagical ammunition, which seems to leap into your hand when you reach for it. On each of your turns until the spell ends, you can use a bonus action to make two attacks with a weapon that uses ammunition from the quiver. Each time you make such a ranged attack, your quiver magically replaces the piece of ammunition you used with a similar piece of nonmagical ammunition. Any pieces of ammunition created by this spell disintegrate when the spell ends. If the quiver leaves your possession, the spell ends.",
    classes: ["ranger"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "a quiver containing at least one piece of ammunition" },
  },
];
