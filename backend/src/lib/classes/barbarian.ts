import type { ClassDefinition, DerivedFeature } from "./types.js";

const BARBARIAN_FEATURES: DerivedFeature[] = [
  {
    name: "Rage",
    level: 1,
    source: "class",
    description:
      "As a bonus action, enter a rage lasting up to 1 minute. You gain advantage on Strength checks and saves, a bonus to melee damage (+2 at L1; +3 at L9; +4 at L16), and resistance to bludgeoning, piercing, and slashing damage. You can't cast or concentrate on spells while raging.",
  },
  {
    name: "Unarmored Defense",
    level: 1,
    source: "class",
    description:
      "While not wearing armor, your AC equals 10 + your Dexterity modifier + your Constitution modifier. You may use a shield.",
  },
  {
    name: "Reckless Attack",
    level: 2,
    source: "class",
    description:
      "When making your first attack on your turn, you may attack recklessly: you have advantage on melee weapon attack rolls using Strength this turn, but attack rolls against you also have advantage until your next turn.",
  },
  {
    name: "Danger Sense",
    level: 2,
    source: "class",
    description:
      "You have advantage on Dexterity saving throws against effects that you can see, such as traps and spells. Doesn't apply when blinded, deafened, or incapacitated.",
  },
  {
    name: "Extra Attack",
    level: 5,
    source: "class",
    description: "You can attack twice whenever you take the Attack action on your turn.",
  },
  {
    name: "Fast Movement",
    level: 5,
    source: "class",
    description: "Your speed increases by 10 feet while you aren't wearing heavy armor.",
  },
  {
    name: "Feral Instinct",
    level: 7,
    source: "class",
    description:
      "You have advantage on initiative rolls. If surprised at the start of combat, you can still act normally on your first turn if you enter your rage before doing anything else.",
  },
  {
    name: "Brutal Critical",
    level: 9,
    source: "class",
    description:
      "You can roll one additional weapon damage die on a critical hit with a melee attack. Two extra dice at level 13, three at level 17.",
  },
  {
    name: "Relentless Rage",
    level: 11,
    source: "class",
    description:
      "When reduced to 0 HP while raging without dying outright, make a DC 10 Con save (DC +5 each use; resets on a short or long rest) to drop to 1 HP instead.",
  },
  {
    name: "Persistent Rage",
    level: 15,
    source: "class",
    description: "Your rage ends early only if you fall unconscious or choose to end it.",
  },
  {
    name: "Indomitable Might",
    level: 18,
    source: "class",
    description:
      "If your total for a Strength check is less than your Strength score, you can use that score in place of the total.",
  },
  {
    name: "Primal Champion",
    level: 20,
    source: "class",
    description:
      "Your Strength and Constitution scores each increase by 4, and their maximums become 24.",
  },
];

const TOTEM_WARRIOR_FEATURES: DerivedFeature[] = [
  {
    name: "Spirit Seeker",
    level: 3,
    source: "subclass",
    description:
      "Gain the ability to cast Beast Sense and Speak with Animals as rituals.",
  },
  {
    name: "Totem Spirit",
    level: 3,
    source: "subclass",
    description:
      "Choose a totem animal and gain a benefit while raging. Bear: resistance to all damage except psychic. Eagle: Disengage/Dash as a bonus action; can't be opportunity attacked except by flying creatures. Wolf: allies have advantage on melee attacks against creatures within 5 ft of you.",
  },
  {
    name: "Aspect of the Beast",
    level: 6,
    source: "subclass",
    description:
      "Gain a magical benefit from a second totem animal (can be the same or different). Bear: carry twice the weight; advantage on Strength checks. Eagle: see up to 1 mile clearly, dim light as bright. Wolf: hunt with a group; allies can't be tracked when traveling.",
  },
  {
    name: "Spirit Walker",
    level: 10,
    source: "subclass",
    description:
      "Cast the Commune with Nature spell as a ritual.",
  },
  {
    name: "Totemic Attunement",
    level: 14,
    source: "subclass",
    description:
      "Gain a benefit from a third totem animal while raging. Bear: threatening presence — enemies within 5 ft have disadvantage on attacks against non-you targets. Eagle: fly speed equal to walking speed. Wolf: knock prone when you hit with melee attack as a bonus action.",
  },
];

const BERSERKER_FEATURES: DerivedFeature[] = [
  {
    name: "Frenzy",
    level: 3,
    source: "subclass",
    description:
      "When you rage, choose to go into a frenzy. For the rage's duration, make one melee weapon attack as a bonus action on each of your turns. When the rage ends, you suffer one level of exhaustion.",
  },
  {
    name: "Mindless Rage",
    level: 6,
    source: "subclass",
    description:
      "You can't be charmed or frightened while raging. If charmed or frightened when you rage, the effect is suspended for the duration.",
  },
  {
    name: "Intimidating Presence",
    level: 10,
    source: "subclass",
    description:
      "As an action, frighten one creature within 30 ft that can see and hear you. It must succeed on a Wisdom save (DC 8 + proficiency + Charisma modifier) or be frightened until the end of your next turn. On a success, the target is immune to this feature for 24 hours.",
  },
  {
    name: "Retaliation",
    level: 14,
    source: "subclass",
    description:
      "When you take damage from a creature within 5 ft, use your reaction to make one melee weapon attack against that creature.",
  },
];

/** Rage uses per long rest by Barbarian level. */
function rageCountForLevel(level: number): number {
  if (level >= 20) return 99;
  if (level >= 17) return 6;
  if (level >= 12) return 5;
  if (level >= 6) return 4;
  if (level >= 3) return 3;
  return 2;
}

export const barbarian: ClassDefinition = {
  features: BARBARIAN_FEATURES,
  resourceFn: (level) => [
    {
      key: "rage",
      label: "Rage",
      total: rageCountForLevel(level),
      recharge: "longRest",
      description: `Bonus action: enter a rage for up to 1 minute (ends early if you fall unconscious or choose to end it). Resistance to bludgeoning, piercing, and slashing damage (applied automatically) and advantage on Strength checks & saves while raging. Regain all rages on a long rest.${level >= 20 ? " Unlimited uses at level 20." : ""}`,
    },
  ],
  subclasses: {
    "totem warrior": { grantLevel: 3, features: TOTEM_WARRIOR_FEATURES },
    berserker: { grantLevel: 3, features: BERSERKER_FEATURES },
  },
};
