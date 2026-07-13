// ── Action catalog ───────────────────────────────────────────────────────────
// Turn-economy actions: universal (every character) + class-specific.
// Display + gating data ONLY — executable mechanics live in lib/actions.ts.
// Adding a new action = append here + add the effect fn in lib/actions.ts.
// ActionCost enum values: action | bonusAction | reaction | free | special

export interface ActionSeed {
  key: string;
  name: string;
  description: string;
  cost: "action" | "bonusAction" | "reaction" | "free" | "special";
  universal?: boolean;
  grantClass?: string;
  grantSubclass?: string;
  grantLevel?: number;
  resourceKey?: string;
  resourceAmount?: number;
}

export const ACTIONS: ActionSeed[] = [
  // ── Universal actions (every character, every turn) ────────────────────────
  {
    key: "attack",
    name: "Attack",
    cost: "action",
    universal: true,
    description:
      "Make one or more weapon attacks (number determined by Extra Attack). Includes unarmed strikes and improvised weapons.",
  },
  {
    key: "castSpell",
    name: "Cast a Spell",
    cost: "action",
    universal: true,
    description:
      "Cast a spell with a casting time of 1 action. Bonus-action and reaction spells must be tracked manually until Phase D.",
  },
  {
    key: "dodge",
    name: "Dodge",
    cost: "action",
    universal: true,
    description:
      "Until your next turn, attacks against you have disadvantage (if you can see the attacker) and you have advantage on Dexterity saves.",
  },
  {
    key: "dash",
    name: "Dash",
    cost: "action",
    universal: true,
    description:
      "Gain extra movement equal to your speed for this turn. (Movement not tracked by this app.)",
  },
  {
    key: "disengage",
    name: "Disengage",
    cost: "action",
    universal: true,
    description: "Your movement doesn't provoke opportunity attacks for the rest of this turn.",
  },
  {
    key: "help",
    name: "Help",
    cost: "action",
    universal: true,
    description:
      "Give an ally advantage on their next ability check, or distract an enemy so an adjacent ally has advantage on their next attack roll against it.",
  },
  {
    key: "hide",
    name: "Hide",
    cost: "action",
    universal: true,
    description:
      "Attempt to hide (Dexterity Stealth vs. passive Perception). You must be heavily obscured or out of sight.",
  },
  {
    key: "search",
    name: "Search",
    cost: "action",
    universal: true,
    description: "Devote attention to finding something (Perception or Investigation check).",
  },
  {
    key: "ready",
    name: "Ready",
    cost: "action",
    universal: true,
    description:
      "Choose a trigger and a prepared reaction. When the trigger occurs before your next turn, you may take that reaction.",
  },
  {
    key: "useObject",
    name: "Use Object",
    cost: "action",
    universal: true,
    description:
      "Interact with an object requiring more effort than a free interaction (drink a potion, use a magic item, activate a device).",
  },
  {
    key: "grapple",
    name: "Grapple / Shove",
    cost: "action",
    universal: true,
    description:
      "Attempt to grapple (Athletics vs. Athletics/Acrobatics) or shove prone/away. Uses one attack if you have Extra Attack.",
  },
  // Universal reaction
  {
    key: "opportunityAttack",
    name: "Opportunity Attack",
    cost: "reaction",
    universal: true,
    description:
      "When a creature within reach moves away without Disengaging, make one melee weapon attack as a reaction.",
  },

  // ── Class: Barbarian ───────────────────────────────────────────────────────
  {
    key: "rage",
    name: "Rage",
    cost: "bonusAction",
    grantClass: "barbarian",
    grantLevel: 1,
    resourceKey: "rage",
    resourceAmount: 1,
    description:
      "Enter a rage (bonus action). +STR melee damage, resistance to B/P/S damage, advantage on Strength checks. Lasts up to 1 minute.",
  },
  {
    key: "recklessAttack",
    name: "Reckless Attack",
    cost: "free",
    grantClass: "barbarian",
    grantLevel: 2,
    description:
      "Before your first attack on your turn, choose to attack recklessly: advantage on STR melee attacks this turn, but attacks against you also have advantage.",
  },

  // ── Class: Bard ───────────────────────────────────────────────────────────
  {
    key: "bardicInspiration",
    name: "Bardic Inspiration",
    cost: "bonusAction",
    grantClass: "bard",
    grantLevel: 1,
    resourceKey: "bardicInspiration",
    resourceAmount: 1,
    description:
      "Grant a creature within 60 ft a Bardic Inspiration die. They add it to one ability check, attack roll, or saving throw within 10 minutes.",
  },

  // ── Class: Cleric ────────────────────────────────────────────────────────
  {
    key: "channelDivinityCleric",
    name: "Channel Divinity",
    cost: "action",
    grantClass: "cleric",
    grantLevel: 2,
    resourceKey: "channelDivinity",
    resourceAmount: 1,
    description:
      "Channel divine energy for a special effect (Turn Undead, or domain option). Uses one Channel Divinity charge.",
  },

  // ── Class: Druid ────────────────────────────────────────────────────────
  {
    key: "wildShape",
    name: "Wild Shape",
    cost: "action",
    grantClass: "druid",
    grantLevel: 2,
    resourceKey: "wildShape",
    resourceAmount: 1,
    description:
      "Transform into a beast you have seen. Max CR based on level. Uses one Wild Shape charge.",
  },

  // ── Class: Fighter ──────────────────────────────────────────────────────
  {
    key: "secondWind",
    name: "Second Wind",
    cost: "bonusAction",
    grantClass: "fighter",
    grantLevel: 1,
    resourceKey: "secondWind",
    resourceAmount: 1,
    description:
      "Regain 1d10 + fighter level HP as a bonus action. One use per short or long rest.",
  },
  {
    key: "actionSurge",
    name: "Action Surge",
    cost: "special",
    grantClass: "fighter",
    grantLevel: 2,
    resourceKey: "actionSurge",
    resourceAmount: 1,
    description:
      "Gain one additional action this turn. One use per short or long rest (two uses at level 17).",
  },

  // ── Class: Monk ──────────────────────────────────────────────────────────
  {
    key: "flurryOfBlows",
    name: "Flurry of Blows",
    cost: "bonusAction",
    grantClass: "monk",
    grantLevel: 2,
    resourceKey: "ki",
    resourceAmount: 2,
    description:
      "Immediately after taking the Attack action, spend 2 ki to make two unarmed strikes as a bonus action.",
  },
  {
    key: "patientDefense",
    name: "Patient Defense",
    cost: "bonusAction",
    grantClass: "monk",
    grantLevel: 2,
    resourceKey: "ki",
    resourceAmount: 1,
    description:
      "Spend 1 ki point to take the Dodge action as a bonus action.",
  },
  {
    key: "stepOfTheWind",
    name: "Step of the Wind",
    cost: "bonusAction",
    grantClass: "monk",
    grantLevel: 2,
    resourceKey: "ki",
    resourceAmount: 1,
    description:
      "Spend 1 ki to take the Disengage or Dash action as a bonus action. Your jump distance doubles for the turn.",
  },
  {
    key: "stunningStrike",
    name: "Stunning Strike",
    cost: "free",
    grantClass: "monk",
    grantLevel: 5,
    resourceKey: "ki",
    resourceAmount: 1,
    description:
      "After hitting with a melee weapon attack, spend 1 ki to force the target to make a Constitution save or be stunned until end of your next turn.",
  },

  // ── Subclass: Way of Shadow monk ─────────────────────────────────────────
  {
    key: "shadowStep",
    name: "Shadow Step",
    cost: "bonusAction",
    grantClass: "monk",
    grantSubclass: "Shadow",
    grantLevel: 6,
    description:
      "When in dim light or darkness, teleport up to 60 ft as a bonus action to an unoccupied space you can see that is also in dim light or darkness. You have advantage on the first melee attack you make before the end of this turn.",
  },
  {
    key: "opportunist",
    name: "Opportunist",
    cost: "reaction",
    grantClass: "monk",
    grantSubclass: "Shadow",
    grantLevel: 17,
    description:
      "When a creature within 5 ft of you is hit by an attack made by another creature, use your reaction to make a melee attack against that creature.",
  },

  // ── Class: Paladin ──────────────────────────────────────────────────────
  {
    key: "divineSense",
    name: "Divine Sense",
    cost: "action",
    grantClass: "paladin",
    grantLevel: 1,
    resourceKey: "divineSense",
    resourceAmount: 1,
    description:
      "Sense celestials, fiends, and undead within 60 ft until end of next turn. Uses one Divine Sense charge.",
  },
  {
    key: "layOnHands",
    name: "Lay on Hands",
    cost: "action",
    grantClass: "paladin",
    grantLevel: 1,
    resourceKey: "layOnHands",
    resourceAmount: 5,
    description:
      "Touch a creature to restore HP from your Lay on Hands pool. Alternatively, spend 5 HP to cure one disease or neutralize one poison.",
  },
  {
    key: "channelDivinityPaladin",
    name: "Channel Divinity",
    cost: "action",
    grantClass: "paladin",
    grantLevel: 3,
    resourceKey: "channelDivinity",
    resourceAmount: 1,
    description:
      "Channel divine energy through your sacred oath. Uses one Channel Divinity charge.",
  },

  // ── Class: Rogue ────────────────────────────────────────────────────────
  {
    key: "cunningAction",
    name: "Cunning Action",
    cost: "bonusAction",
    grantClass: "rogue",
    grantLevel: 2,
    description:
      "Take the Dash, Disengage, or Hide action as a bonus action.",
  },

  // ── Class: Sorcerer ─────────────────────────────────────────────────────
  {
    key: "metamagic",
    name: "Metamagic",
    cost: "free",
    grantClass: "sorcerer",
    grantLevel: 3,
    resourceKey: "sorceryPoints",
    resourceAmount: 1,
    description:
      "Apply a Metamagic option to a spell you cast (Subtle, Quickened, Twinned, etc.). Costs vary by option.",
  },

  // ── Class: Warlock ──────────────────────────────────────────────────────
  // (Warlock's Pact Magic is reflected in the spellcasting section; no extra action entry needed.)

  // ── Class: Wizard ───────────────────────────────────────────────────────
  // (Arcane Recovery is a short-rest ability, not a turn action; no action entry needed.)
];
