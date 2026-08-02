// ── Action catalog ───────────────────────────────────────────────────────────
// Turn-economy actions: universal (every character) + class-specific.
// Display + gating data ONLY — executable mechanics live in lib/actions.ts.
// Adding a new action = append here + add the effect fn in lib/actions.ts.
// ActionCost enum values: action | bonusAction | reaction | free | special
//
// Every `universal: true` description is transcribed from its own edition's
// document — SRD 5.1 ("Actions in Combat", pp. 92-95, plus "Grappling"/
// "Shoving a Creature"/"Opportunity Attacks", pp. 94-95, and "Hiding", p. 80)
// or SRD 5.2 ("Playing the Game" → Actions, plus the "Rules Glossary" entry
// per action). These rows are what GET /api/reference serves, so no frontend
// module holds any of this text (#1430).

import type { SeedEdition } from "./edition.js";

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
  /**
   * Omitted = shared (NULL column, valid in both editions, #1306) — every
   * class row.
   *
   * Every UNIVERSAL row is forked, including `dash`, `disengage`, `ready` and
   * `opportunityAttack`, whose mechanics agree. The reason is transcription,
   * not rules: each `description` is a verbatim excerpt from one named
   * document, so a shared row could only cite "SRD 5.1 and SRD 5.2", and an
   * ambiguous citation is a bug. A row that agrees mechanically still has two
   * distinct source texts.
   *
   * This diverges from CONDITIONS/CONDITIONS_2014_OVERRIDES, which shares five
   * of the fourteen conditions across editions — deliberately, so a future
   * reader does not "fix" one to match the other. The distinction CLAUDE.md
   * records: an edition-invariant rule FUNCTION does not fork; a content row
   * whose text is transcribed from an edition document does.
   *
   * `key` is edition-stable identity: the 2024 Magic row keeps
   * `key: "castSpell"` and the Utilize row keeps `key: "useObject"`, because
   * PRIMARY_ACTION_KEYS and MICRO_CAPTIONS reference keys. Genuinely new 2024
   * actions get NEW keys (`study`, `influence`).
   */
  edition?: SeedEdition;
}

/** Universal keys that exist only in SRD 5.2 — no 2014 counterpart to seed. */
export const TWENTY_FOUR_ONLY_ACTION_KEYS = ["study", "influence"] as const;

export const ACTIONS: ActionSeed[] = [
  // ── Universal actions, 2014 (SRD 5.1) ─────────────────────────────────────
  {
    key: "attack",
    name: "Attack",
    cost: "action",
    universal: true,
    edition: "EDITION_2014",
    description:
      "Make one melee or ranged attack. Certain features, such as the fighter's Extra Attack, let you make more than one attack with this action.",
  },
  {
    key: "castSpell",
    name: "Cast a Spell",
    cost: "action",
    universal: true,
    edition: "EDITION_2014",
    description:
      "Cast a spell with a casting time of 1 action. Casting a spell is not necessarily an action — each spell's casting time specifies whether it takes an action, a reaction, minutes, or hours.",
  },
  // castSpellBonus / castSpellReaction are app affordances that open a filtered
  // spell picker, not distinct actions in either edition. Seeded for
  // completeness and for #1431: `castSpellReaction` renders in ReactionSlot,
  // but NOTHING renders `castSpellBonus` today — BonusActionSheetBody never
  // read the universal list — so that row is dead content until #1431/#1439.
  //
  // Named "Cast a Spell (…)" only for 2014, where SRD 5.1's Cast a Spell entry
  // is titled after casting in general and says outright that casting "is not
  // necessarily an action". SRD 5.2's Magic action covers ONLY a spell with a
  // casting time of an action, so "Magic (Bonus Action)" would invent a rule.
  {
    key: "castSpellBonus",
    name: "Cast a Spell (Bonus Action)",
    cost: "bonusAction",
    universal: true,
    edition: "EDITION_2014",
    description:
      "Cast a spell with a casting time of 1 bonus action. Casting a spell is not necessarily an action; a bonus-action spell uses your bonus action. Opens the spell picker filtered to bonus-action spells.",
  },
  {
    key: "dodge",
    name: "Dodge",
    cost: "action",
    universal: true,
    edition: "EDITION_2014",
    description:
      "Focus entirely on avoiding attacks. Until the start of your next turn, any attack roll made against you has disadvantage if you can see the attacker, and you make Dexterity saving throws with advantage. You lose this benefit if you are incapacitated or if your speed drops to 0.",
  },
  {
    key: "dash",
    name: "Dash",
    cost: "action",
    universal: true,
    edition: "EDITION_2014",
    description:
      "Gain extra movement for the current turn equal to your speed, after applying any modifiers. With a speed of 30 feet, you can move up to 60 feet on your turn.",
  },
  {
    key: "disengage",
    name: "Disengage",
    cost: "action",
    universal: true,
    edition: "EDITION_2014",
    description: "Your movement doesn't provoke opportunity attacks for the rest of the turn.",
  },
  {
    key: "help",
    name: "Help",
    cost: "action",
    universal: true,
    edition: "EDITION_2014",
    description:
      "Lend aid to another creature: it gains advantage on the next ability check it makes for the task you are helping with, provided it makes the check before the start of your next turn. Alternatively, aid a friendly creature attacking a creature within 5 feet of you — the first attack roll it makes against that target before your next turn has advantage.",
  },
  {
    key: "hide",
    name: "Hide",
    cost: "action",
    universal: true,
    edition: "EDITION_2014",
    description:
      "Make a Dexterity (Stealth) check to hide. That check's total is contested by the Wisdom (Perception) check of any creature actively searching for you, and compared against passive Perception for creatures that aren't. You can't hide from a creature that can see you clearly.",
  },
  {
    key: "search",
    name: "Search",
    cost: "action",
    universal: true,
    edition: "EDITION_2014",
    description:
      "Devote your attention to finding something. Depending on the nature of your search, the GM might have you make a Wisdom (Perception) check or an Intelligence (Investigation) check.",
  },
  {
    key: "ready",
    name: "Ready",
    cost: "action",
    universal: true,
    edition: "EDITION_2014",
    description:
      "Decide what perceivable circumstance will trigger your reaction, then choose the action you will take in response, or choose to move up to your speed. When the trigger occurs before the start of your next turn you may take that reaction. A readied spell is cast now and held with concentration.",
  },
  {
    key: "useObject",
    name: "Use an Object",
    cost: "action",
    universal: true,
    edition: "EDITION_2014",
    description:
      "You normally interact with an object while doing something else, such as drawing a sword as part of an attack. When an object requires your action for its use, you take the Use an Object action — also useful when you want to interact with more than one object on your turn.",
  },
  // Grapple and Shove are NOT standalone actions in either edition: SRD 5.1
  // makes each a special melee attack substituted for one attack of the Attack
  // action, and SRD 5.2 makes each an option of the Unarmed Strike (itself
  // taken with the Attack action). They stay separate `cost: "action"` cards
  // here because re-modelling them is out of #1430's scope — but the mechanic
  // DOES fork (contest → saving throw), and shipping the 2014 contest text to
  // 2024 characters was a live rules bug this fork fixes.
  {
    key: "grapple",
    name: "Grapple",
    cost: "action",
    universal: true,
    edition: "EDITION_2014",
    description:
      "A special melee attack made with the Attack action, replacing one of its attacks. Using at least one free hand, make a Strength (Athletics) check contested by the target's Strength (Athletics) or Dexterity (Acrobatics) check (the target chooses); on a win the target is grappled. The target must be no more than one size larger than you and within your reach.",
  },
  {
    key: "shove",
    name: "Shove",
    cost: "action",
    universal: true,
    edition: "EDITION_2014",
    description:
      "A special melee attack made with the Attack action, replacing one of its attacks. Instead of an attack roll, make a Strength (Athletics) check contested by the target's Strength (Athletics) or Dexterity (Acrobatics) check (the target chooses); on a win you either knock the target prone or push it 5 feet away. The target must be no more than one size larger than you and within your reach.",
  },
  {
    key: "opportunityAttack",
    name: "Opportunity Attack",
    cost: "reaction",
    universal: true,
    edition: "EDITION_2014",
    description:
      "When a hostile creature you can see moves out of your reach, use your reaction to make one melee attack against it. The attack occurs right before the creature leaves your reach.",
  },
  {
    key: "castSpellReaction",
    name: "Cast a Spell (Reaction)",
    cost: "reaction",
    universal: true,
    edition: "EDITION_2014",
    description:
      "Cast a spell with a casting time of 1 reaction, when that spell's trigger occurs. Opens the spell picker filtered to reaction spells.",
  },

  // ── Universal actions, 2024 (SRD 5.2) ─────────────────────────────────────
  {
    key: "attack",
    name: "Attack",
    cost: "action",
    universal: true,
    edition: "EDITION_2024",
    description:
      "Make one attack roll with a weapon or an Unarmed Strike. You can equip or unequip one weapon when you make an attack as part of this action, before or after the attack.",
  },
  {
    key: "castSpell",
    name: "Magic",
    cost: "action",
    universal: true,
    edition: "EDITION_2024",
    description:
      "Cast a spell that has a casting time of an action, or use a feature or magic item that requires a Magic action to be activated.",
  },
  {
    key: "castSpellBonus",
    name: "Cast a Bonus-Action Spell",
    cost: "bonusAction",
    universal: true,
    edition: "EDITION_2024",
    description:
      "Cast a spell whose casting time is a Bonus Action. This is not the Magic action, which covers only a spell with a casting time of an action — a Bonus Action spell is cast with your Bonus Action. Opens the spell picker filtered to bonus-action spells.",
  },
  {
    key: "dodge",
    name: "Dodge",
    cost: "action",
    universal: true,
    edition: "EDITION_2024",
    description:
      "Until the start of your next turn, any attack roll made against you has Disadvantage if you can see the attacker, and you make Dexterity saving throws with Advantage. You lose these benefits if you have the Incapacitated condition or if your Speed is 0.",
  },
  {
    key: "dash",
    name: "Dash",
    cost: "action",
    universal: true,
    edition: "EDITION_2024",
    description:
      "Gain extra movement for the current turn equal to your Speed after applying any modifiers. If you have a special speed, such as a Fly Speed or Swim Speed, you can use that speed instead of your Speed.",
  },
  {
    key: "disengage",
    name: "Disengage",
    cost: "action",
    universal: true,
    edition: "EDITION_2024",
    description: "Your movement doesn't provoke Opportunity Attacks for the rest of the current turn.",
  },
  {
    key: "help",
    name: "Help",
    cost: "action",
    universal: true,
    edition: "EDITION_2024",
    // The Advantage-on-a-check half requires one of YOUR OWN skill or tool
    // proficiencies (SRD 5.2) — SRD 5.1 has no such requirement.
    description:
      "Choose one of your skill or tool proficiencies and one ally near enough for you to assist: that ally has Advantage on the next ability check they make with that skill or tool, expiring at the start of your next turn. Or momentarily distract an enemy within 5 feet of you, giving Advantage to the next attack roll one of your allies makes against that enemy.",
  },
  {
    key: "hide",
    name: "Hide",
    cost: "action",
    universal: true,
    edition: "EDITION_2024",
    // SRD 5.2 sets a flat DC 15 and grants the Invisible condition on a
    // success; SRD 5.1 leaves it a contest the GM adjudicates.
    description:
      "Succeed on a DC 15 Dexterity (Stealth) check while you are Heavily Obscured or behind Three-Quarters Cover or Total Cover, and while out of every enemy's line of sight. On a success you have the Invisible condition while hidden, and your check's total is the DC for a creature to find you with a Wisdom (Perception) check.",
  },
  {
    key: "search",
    name: "Search",
    cost: "action",
    universal: true,
    edition: "EDITION_2024",
    // Always a WISDOM check in SRD 5.2 — the Intelligence half of SRD 5.1's
    // "Perception or Investigation" became the separate Study action.
    description:
      "Make a Wisdom check to discern something that isn't obvious. The GM picks the applicable skill: Insight for a creature's state of mind, Medicine for its ailment or cause of death, Perception for a concealed creature or object, or Survival for tracks or food.",
  },
  {
    key: "study",
    name: "Study",
    cost: "action",
    universal: true,
    edition: "EDITION_2024",
    description:
      "Make an Intelligence check to study your memory, a book, a clue, or another source of knowledge and call to mind an important piece of information about it. The GM picks the applicable skill: Arcana, History, Investigation, Nature, or Religion.",
  },
  {
    key: "influence",
    name: "Influence",
    cost: "action",
    universal: true,
    edition: "EDITION_2024",
    description:
      "Urge a monster to do something. If it is hesitant rather than plainly willing or unwilling, make the ability check the GM chooses — Charisma (Deception, Intimidation, Performance, or Persuasion) or Wisdom (Animal Handling) — against a DC equal to 15 or the monster's Intelligence score, whichever is higher.",
  },
  {
    key: "ready",
    name: "Ready",
    cost: "action",
    universal: true,
    edition: "EDITION_2024",
    description:
      "Decide what perceivable circumstance will trigger your Reaction, then choose the action you will take in response, or choose to move up to your Speed. When the trigger occurs you may take that Reaction before the start of your next turn. A readied spell must have a casting time of an action; it is cast now and held with Concentration.",
  },
  {
    key: "useObject",
    name: "Utilize",
    cost: "action",
    universal: true,
    edition: "EDITION_2024",
    // Nonmagical only in SRD 5.2 — using a magic item is the Magic action.
    description:
      "Use a nonmagical object. You normally interact with an object while doing something else, such as drawing a sword as part of the Attack action; when an object requires an action for its use, you take the Utilize action.",
  },
  {
    key: "grapple",
    name: "Grapple",
    cost: "action",
    universal: true,
    edition: "EDITION_2024",
    description:
      "An option of your Unarmed Strike, taken with the Attack action. The target must succeed on a Strength or Dexterity saving throw (it chooses which), or it has the Grappled condition. The DC for the saving throw and for any escape attempts equals 8 plus your Strength modifier and Proficiency Bonus. Possible only if the target is no more than one size larger than you and you have a hand free to grab it.",
  },
  {
    key: "shove",
    name: "Shove",
    cost: "action",
    universal: true,
    edition: "EDITION_2024",
    description:
      "An option of your Unarmed Strike, taken with the Attack action. The target must succeed on a Strength or Dexterity saving throw (it chooses which), or you either push it 5 feet away or cause it to have the Prone condition. The DC equals 8 plus your Strength modifier and Proficiency Bonus. Possible only if the target is no more than one size larger than you.",
  },
  {
    key: "opportunityAttack",
    name: "Opportunity Attack",
    cost: "reaction",
    universal: true,
    edition: "EDITION_2024",
    description:
      "When a creature you can see leaves your reach using its action, its Bonus Action, its Reaction, or one of its speeds, take a Reaction to make one melee attack with a weapon or an Unarmed Strike against it. The attack occurs right before the creature leaves your reach.",
  },
  {
    key: "castSpellReaction",
    name: "Cast a Reaction Spell",
    cost: "reaction",
    universal: true,
    edition: "EDITION_2024",
    description:
      "Cast a spell whose casting time is a Reaction, when that spell's trigger occurs. This is not the Magic action — a Reaction spell is cast with your Reaction. Opens the spell picker filtered to reaction spells.",
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
    key: "bonusUnarmedStrike",
    name: "Bonus Unarmed Strike",
    cost: "bonusAction",
    grantClass: "monk",
    grantLevel: 1,
    description:
      "Martial Arts: make one Unarmed Strike as a bonus action. Requires no armor or Shield. No resource cost, no Attack-action prerequisite.",
  },
  {
    key: "flurryOfBlows",
    name: "Flurry of Blows",
    cost: "bonusAction",
    grantClass: "monk",
    grantLevel: 2,
    resourceKey: "focus",
    resourceAmount: 2,
    description:
      "Immediately after taking the Attack action, spend 2 focus to make two unarmed strikes as a bonus action.",
  },
  // Patient Defense / Step of the Wind (PHB'24 p.98, SRD 5.2, #1240): each has
  // a free variant and a 1-Focus variant that does more — not the 2014 SRD's
  // flat "always costs 1 ki" shape.
  {
    key: "patientDefense",
    name: "Patient Defense",
    cost: "bonusAction",
    grantClass: "monk",
    grantLevel: 2,
    description: "Take the Disengage action as a bonus action, for free.",
  },
  {
    key: "patientDefenseFocus",
    name: "Patient Defense (1 Focus)",
    cost: "bonusAction",
    grantClass: "monk",
    grantLevel: 2,
    resourceKey: "focus",
    resourceAmount: 1,
    description:
      "Spend 1 focus to take the Disengage action and the Dodge action as a bonus action.",
  },
  {
    key: "stepOfTheWind",
    name: "Step of the Wind",
    cost: "bonusAction",
    grantClass: "monk",
    grantLevel: 2,
    description: "Take the Dash action as a bonus action, for free.",
  },
  {
    key: "stepOfTheWindFocus",
    name: "Step of the Wind (1 Focus)",
    cost: "bonusAction",
    grantClass: "monk",
    grantLevel: 2,
    resourceKey: "focus",
    resourceAmount: 1,
    description:
      "Spend 1 focus to take the Disengage action and the Dash action as a bonus action. Your jump distance doubles for the turn.",
  },
  // Stunning Strike (L5) isn't seeded here — it's a post-hit rider (spend +
  // Con save + fail/success outcome), not a selectable catalog action. See
  // stunning-strike.ts (#1242 supersedes the #392 bare-spend stub formerly here).

  // ── Subclass: Warrior of Shadow monk (2024 rewrite, #1246) ───────────────
  // Opportunist (2014 L17 reaction) is retired — 2024 replaces it with Cloak
  // of Shadows at L17 (a resourceKey-gated cast, see shadow-arts.ts), not a
  // catalog reminder action.
  {
    key: "shadowStep",
    name: "Shadow Step",
    cost: "bonusAction",
    grantClass: "monk",
    grantSubclass: "Shadow",
    grantLevel: 6,
    description:
      "While in dim light or darkness, teleport up to 60 ft as a bonus action to an unoccupied space you can see that is also in dim light or darkness, then make one unarmed strike as part of the same bonus action. You have advantage on the first melee attack you make before the end of this turn.",
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
  // SRD 5.2 grants Metamagic at level 2, not PHB'14's level 3 (#1232 commit
  // 2b) — a same-key edition fork, mirroring the universal rows' own
  // per-edition split above.
  {
    key: "metamagic",
    name: "Metamagic",
    cost: "free",
    grantClass: "sorcerer",
    grantLevel: 3,
    resourceKey: "sorceryPoints",
    resourceAmount: 1,
    edition: "EDITION_2014",
    description:
      "Apply a Metamagic option to a spell you cast (Subtle, Quickened, Twinned, etc.). Costs vary by option.",
  },
  {
    key: "metamagic",
    name: "Metamagic",
    cost: "free",
    grantClass: "sorcerer",
    grantLevel: 2,
    resourceKey: "sorceryPoints",
    resourceAmount: 1,
    edition: "EDITION_2024",
    description:
      "Apply a Metamagic option to a spell you cast (Careful, Distant, Empowered, Extended, Heightened, Quickened, Seeking, Subtle, Transmuted, Twinned). Costs vary by option.",
  },

  // ── Class: Warlock ──────────────────────────────────────────────────────
  // (Warlock's Pact Magic is reflected in the spellcasting section; no extra action entry needed.)

  // ── Class: Wizard ───────────────────────────────────────────────────────
  // (Arcane Recovery is a short-rest ability, not a turn action; no action entry needed.)
];
