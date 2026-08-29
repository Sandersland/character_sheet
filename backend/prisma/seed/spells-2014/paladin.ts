import type { CatalogSpell } from "../spells.js";

export const PALADIN_SPELLS_2014: CatalogSpell[] = [
  // Level 0: none (Paladin has no PHB'14 cantrips).
  // PHB'14 p. 234.
  {
    name: "Divine Favor",
    level: 1,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "Your prayer empowers you with divine radiance. Until the spell ends, your weapon attacks deal an extra 1d4 radiant damage on a hit.",
    classes: ["paladin"],
    components: { verbal: true, somatic: true, material: false },
  },
  // PHB'14 p. 224.
  {
    name: "Compelled Duel",
    level: 1,
    school: "enchantment",
    castingTime: "1 bonus action",
    range: "30 feet",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "You attempt to compel a creature into a duel. One creature that you can see within range must make a Wisdom saving throw. On a failed save, the creature is drawn to you, compelled by your divine demand. For the duration, it has disadvantage on attack rolls against creatures other than you, and must make a Wisdom saving throw each time it attempts to move to a space that is more than 30 feet away from you; if it succeeds on this saving throw, this spell doesn't restrict the target's movement for that turn. The spell ends if you attack any other creature, if you cast a spell that targets a hostile creature other than the target, if a creature friendly to you damages the target or casts a harmful spell on it, or if you end your turn more than 30 feet away from the target.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
    attackType: "save",
    saveAbility: "wisdom",
  },
  // PHB'14 p. 274.
  {
    name: "Searing Smite",
    level: 1,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit a creature with a melee weapon attack during the spell's duration, your weapon flares with white-hot intensity, and the attack deals an extra 1d6 fire damage to the target and causes the target to ignite in flames. At the start of each of its turns until the spell ends, the target must make a Constitution saving throw. On a failed save, it takes 1d6 fire damage. On a successful save, the spell ends. If the target or a creature within 5 feet of it uses an action to put out the flames, or if some other effect douses the flames (such as the target being submerged in water), the spell ends. At Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, the initial extra damage dealt by the attack increases by 1d6 for each slot level above 1st.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 282.
  {
    name: "Thunderous Smite",
    level: 1,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The first time you hit with a melee weapon attack during this spell's duration, your weapon rings with thunder that is audible within 300 feet of you, and the attack deals an extra 2d6 thunder damage to the target. Additionally, if the target is a creature, it must succeed on a Strength saving throw or be pushed 10 feet away from you and knocked prone.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 289.
  {
    name: "Wrathful Smite",
    level: 1,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit with a melee weapon attack during this spell's duration, your attack deals an extra 1d6 psychic damage. Additionally, if the target is a creature, it must make a Wisdom saving throw or be frightened of you until the spell ends. As an action, the creature can make a Wisdom check against your spell save DC to steel its resolve and end this spell.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 240.
  {
    name: "Find Steed",
    level: 2,
    school: "conjuration",
    castingTime: "10 minutes",
    range: "30 feet",
    duration: "Instantaneous",
    description:
      "You summon a spirit that assumes the form of an unusually intelligent, strong, and loyal steed, creating a long-lasting bond with it. Appearing in an unoccupied space within range, the steed takes on a form that you choose, such as a warhorse, a pony, a camel, an elk, or a mastiff. (Your DM might allow other animals to be summoned as steeds.) The steed has the statistics of the chosen form, though it is a celestial, fey, or fiend (your choice) instead of its normal type. Additionally, if your steed has an Intelligence of 5 or less, its Intelligence becomes 6, and it gains the ability to understand one language of your choice that you speak. Your steed serves you as a mount, both in combat and out, and you have an instinctive bond with it that allows you to fight as a seamless unit. While mounted on your steed, you can make any spell you cast that targets only you also target your steed. When the steed drops to 0 hit points, it disappears, leaving behind no physical form. You can also dismiss your steed at any time as an action, causing it to disappear. In either case, casting this spell again summons the same steed, restored to its hit point maximum. While your steed is within 1 mile of you, you can communicate with it telepathically. You can't have more than one steed bonded by this spell at a time. As an action, you can release the steed from its bond at any time, causing it to disappear.",
    classes: ["paladin"],
    components: { verbal: true, somatic: true, material: false },
  },
  // PHB'14 p. 220.
  {
    name: "Branding Smite",
    level: 2,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit a creature with a weapon attack before this spell ends, the weapon gleams with astral radiance as you strike. The attack deals an extra 2d6 radiant damage to the target, which becomes visible if it's invisible, and the target sheds dim light in a 5-foot radius and can't become invisible until the spell ends. At Higher Levels. When you cast this spell using a spell slot of 3rd level or higher, the extra damage increases by 1d6 for each slot level above 2nd.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 216.
  {
    name: "Aura of Vitality",
    level: 3,
    school: "evocation",
    castingTime: "1 action",
    range: "Self (30-foot radius)",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "Healing energy radiates from you in an aura with a 30-foot radius. Until the spell ends, the aura moves with you, centered on you. You can use a bonus action to cause one creature in the aura (including you) to regain 2d6 hit points.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 219.
  {
    name: "Blinding Smite",
    level: 3,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit a creature with a melee weapon attack during this spell's duration, your weapon flares with bright light, and the attack deals an extra 3d8 radiant damage to the target. Additionally, the target must succeed on a Constitution saving throw or be blinded until the spell ends. A creature blinded by this spell makes another Constitution saving throw at the end of each of its turns. On a successful save, it is no longer blinded.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 230.
  {
    name: "Crusader's Mantle",
    level: 3,
    school: "evocation",
    castingTime: "1 action",
    range: "Self (30-foot radius)",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "Holy power radiates from you in an aura with a 30-foot radius, awakening boldness in friendly creatures. Until the spell ends, the aura moves with you, centered on you. While in the aura, each nonhostile creature in the aura (including you) deals an extra 1d4 radiant damage when it hits with a weapon attack.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 237.
  {
    name: "Elemental Weapon",
    level: 3,
    school: "transmutation",
    castingTime: "1 action",
    range: "Touch",
    duration: "Up to 1 hour",
    concentration: true,
    description:
      "A nonmagical weapon you touch becomes a magic weapon. Choose one of the following damage types: acid, cold, fire, lightning, or thunder. For the duration, the weapon has a +1 bonus to attack rolls and deals an extra 1d4 damage of the chosen type when it hits. At Higher Levels. When you cast this spell using a spell slot of 5th or 6th level, the bonus to attack rolls increases to +2 and the extra damage increases to 2d4. When you use a spell slot of 7th level or higher, the bonus increases to +3 and the extra damage increases to 3d4.",
    classes: ["paladin"],
    components: { verbal: true, somatic: true, material: false },
  },
  // PHB'14 p. 216.
  {
    name: "Aura of Purity",
    level: 4,
    school: "abjuration",
    castingTime: "1 action",
    range: "Self (30-foot radius)",
    duration: "Up to 10 minutes",
    concentration: true,
    description:
      "Purifying energy radiates from you in an aura with a 30-foot radius. Until the spell ends, the aura moves with you, centered on you. Each nonhostile creature in the aura (including you) can't become diseased, has resistance to poison damage, and has advantage on saving throws against effects that cause any of the following conditions: blinded, charmed, deafened, frightened, paralyzed, poisoned, and stunned.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 278.
  {
    name: "Staggering Smite",
    level: 4,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit a creature with a melee weapon attack during this spell's duration, your weapon pierces both body and mind, and the attack deals an extra 4d6 psychic damage to the target. The target must make a Wisdom saving throw. On a failed save, it has disadvantage on attack rolls and ability checks, and can't take reactions, until the end of its next turn.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 218.
  {
    name: "Banishing Smite",
    level: 5,
    school: "abjuration",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit a creature with a weapon attack before this spell ends, your weapon crackles with force, and the attack deals an extra 5d10 force damage to the target. Additionally, if this attack reduces the target to 50 hit points or fewer, you banish it. If the target is native to a different plane of existence than the one you're on, the target disappears, returning to its home plane. If the target is native to the plane you're on, the creature vanishes into a harmless demiplane. While there, the target is incapacitated. It remains there until the spell ends, at which point the target reappears in the space it left or in the nearest unoccupied space if that space is occupied.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 221.
  {
    name: "Circle of Power",
    level: 5,
    school: "abjuration",
    castingTime: "1 action",
    range: "Self (30-foot radius)",
    duration: "Up to 10 minutes",
    concentration: true,
    description:
      "Divine energy radiates from you, distorting and diffusing magical energy within 30 feet of you. Until the spell ends, the sphere moves with you, centered on you. For the duration, each friendly creature in the area (including you) has advantage on saving throws against spells and other magical effects. Additionally, when an affected creature succeeds on a saving throw made against a spell or magical effect that allows it to make a saving throw to take only half damage, it instead takes no damage if it succeeds on the saving throw.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 231.
  {
    name: "Destructive Wave",
    level: 5,
    school: "evocation",
    castingTime: "1 action",
    range: "Self (30-foot radius)",
    duration: "Instantaneous",
    description:
      "You strike the ground, creating a burst of divine energy that ripples outward from you. Each creature you choose within 30 feet of you must succeed on a Constitution saving throw or take 5d6 thunder damage, as well as 5d6 radiant or necrotic damage (your choice), and be knocked prone. A creature that succeeds on its saving throw takes half as much damage and isn't knocked prone.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // Levels 6-9: none (Paladin caps at 5th-level spells, half-caster).
];
