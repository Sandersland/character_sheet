import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition, DerivedFeature } from "./types.js";

const CLERIC_FEATURES: DerivedFeature[] = [
  {
    name: "Spellcasting",
    level: 1,
    source: "class",
    description:
      "You cast spells using Wisdom. Full-caster progression. You prepare a number of cleric spells equal to your Wisdom modifier + your cleric level (minimum 1).",
  },
  {
    name: "Channel Divinity: Turn Undead",
    level: 2,
    source: "class",
    description:
      "As an action, each undead within 30 ft that can see or hear you must make a Wisdom save (DC 8 + proficiency + Wisdom modifier) or be turned for 1 minute. Turned undead flee you.",
  },
  {
    name: "Destroy Undead",
    level: 5,
    source: "class",
    description:
      "When you turn an undead, any with CR 1/2 or lower are instantly destroyed (CR 1 at L8; CR 2 at L11; CR 3 at L14; CR 4 at L17).",
  },
  {
    name: "Divine Intervention",
    level: 10,
    source: "class",
    description:
      "Call on your deity for aid. Roll percentile dice — on a result ≤ your cleric level, your deity intervenes. On a success, you can't use this feature again for 7 days. At level 20 it automatically succeeds.",
  },
  {
    name: "Divine Intervention Improvement",
    level: 20,
    source: "class",
    description: "Your Divine Intervention call automatically succeeds (no roll required).",
  },
];

const LIFE_DOMAIN_FEATURES: DerivedFeature[] = [
  // #1374: the lowest domain-spell tier is cleric level 1 in PHB'14 but level
  // 3 in PHB'24 (#1128) — the two editions genuinely disagree on this text,
  // so it forks into one row per edition sharing the "Domain Spells" name
  // (plan §C). The 2024 row below is unchanged text/level; only the tag is new.
  {
    name: "Domain Spells",
    level: 1,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Bless, Cure Wounds (L3); Lesser Restoration, Spiritual Weapon (L3); Beacon of Hope, Revivify (L5); Death Ward, Guardian of Faith (L7); Mass Cure Wounds, Raise Dead (L9).",
  },
  {
    name: "Domain Spells",
    level: 1,
    source: "subclass",
    edition: "EDITION_2014",
    // SRD 5.1, "Life Domain" (Life Domain Spells table) — openly licensed,
    // independently verifiable. Identical to the row above but for the first
    // tier's label (L3 -> L1), matching PHB'14's actual gate.
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Bless, Cure Wounds (L1); Lesser Restoration, Spiritual Weapon (L3); Beacon of Hope, Revivify (L5); Death Ward, Guardian of Faith (L7); Mass Cure Wounds, Raise Dead (L9).",
  },
  {
    name: "Bonus Proficiency",
    level: 1,
    source: "subclass",
    description: "You gain proficiency with heavy armor.",
  },
  {
    name: "Disciple of Life",
    level: 1,
    source: "subclass",
    description:
      "Whenever you use a spell of 1st level or higher to restore hit points to a creature, the creature regains additional HP equal to 2 + the spell's level.",
  },
  {
    name: "Channel Divinity: Preserve Life",
    level: 2,
    source: "subclass",
    description:
      "As an action, evoke healing energy that restores a total of 5× your cleric level HP, divided among creatures within 30 ft (up to half their maximum HP each). Uses the Channel Divinity pool.",
  },
  {
    name: "Blessed Healer",
    level: 6,
    source: "subclass",
    description:
      "When you cast a healing spell of 1st level or higher that restores HP to another creature, you regain HP equal to 2 + the spell's level.",
  },
  {
    name: "Divine Strike",
    level: 8,
    source: "subclass",
    description:
      "Once per turn when you hit with a weapon, deal an extra 1d8 radiant damage (+2d8 at level 14).",
  },
  {
    name: "Supreme Healing",
    level: 17,
    source: "subclass",
    description:
      "When you would normally roll dice to restore HP with a spell, use the highest number possible instead of rolling.",
  },
];

const TRICKERY_DOMAIN_FEATURES: DerivedFeature[] = [
  // #1374: same PHB'14-vs-PHB'24 lowest-tier fork as Life Domain above.
  {
    name: "Domain Spells",
    level: 1,
    source: "subclass",
    edition: "EDITION_2024",
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Charm Person, Disguise Self (L3); Mirror Image, Pass without Trace (L3); Blink, Dispel Magic (L5); Dimension Door, Polymorph (L7); Dominate Person, Modify Memory (L9).",
  },
  {
    name: "Domain Spells",
    level: 1,
    source: "subclass",
    edition: "EDITION_2014",
    // PHB'14, "Trickery Domain" — Trickery Domain Spells. Page number
    // deliberately omitted — could not be verified from a licensed source
    // (see PR description).
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Charm Person, Disguise Self (L1); Mirror Image, Pass without Trace (L3); Blink, Dispel Magic (L5); Dimension Door, Polymorph (L7); Dominate Person, Modify Memory (L9).",
  },
  {
    name: "Blessing of the Trickster",
    level: 1,
    source: "subclass",
    description:
      "As an action, touch a willing creature to give it advantage on Dexterity (Stealth) checks. Lasts 1 hour or until you use this feature again.",
  },
  {
    name: "Channel Divinity: Invoke Duplicity",
    level: 2,
    source: "subclass",
    description:
      "As an action, create an illusory duplicate of yourself within 30 ft that lasts for 1 minute (concentration). You can attack with advantage against a creature within 5 ft of the duplicate, and can cast spells as if from the duplicate's space. Uses the Channel Divinity pool.",
  },
  {
    name: "Channel Divinity: Cloak of Shadows",
    level: 6,
    source: "subclass",
    description:
      "As an action, become invisible until the end of your next turn. Uses the Channel Divinity pool.",
  },
  {
    name: "Divine Strike",
    level: 8,
    source: "subclass",
    description:
      "Once per turn when you hit with a weapon, deal an extra 1d8 poison damage (+2d8 at level 14).",
  },
  {
    name: "Improved Duplicity",
    level: 17,
    source: "subclass",
    description:
      "When you use Invoke Duplicity, you can create up to four duplicates instead of one. As a bonus action on your turn, move any number of them up to 30 ft (no more than 120 ft away from you).",
  },
];

export const cleric: ClassDefinition = {
  features: CLERIC_FEATURES,
  resourceFn: (level, abilityScores, profBonus) => {
    if (level < 2) return [];
    const total = level >= 18 ? 3 : level >= 6 ? 2 : 1;
    const wisMod = abilityModifier(abilityScores.wisdom ?? 10);
    const turnDC = 8 + profBonus + wisMod;
    return [
      {
        key: "channelDivinity",
        label: "Channel Divinity",
        total,
        recharge: "short-or-long",
        description: `Channel divine energy for special effects (Turn Undead DC ${turnDC}, plus domain options). Regain all uses on a short or long rest.`,
      },
    ];
  },
  // PHB'14 p.57: Divine Domain (Cleric's subclass) is chosen at 1st level.
  subclasses: {
    "life domain": { slug: "cleric-life-domain", grantLevel: 1, features: LIFE_DOMAIN_FEATURES },
    "trickery domain": { slug: "cleric-trickery-domain", grantLevel: 1, features: TRICKERY_DOMAIN_FEATURES },
  },
};
