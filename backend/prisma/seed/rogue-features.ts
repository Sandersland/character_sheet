// DATA MODULE ONLY (#1277 AC 4): no direct database calls in this file.
//
// No row in this file omits `edition` — every 2024 Rogue feature's text
// differs from its 2014 counterpart, even where the mechanics agree.
//
// Rogue has no resource pool in either edition — Sneak Attack's Nd6 is a
// computed rule function (sneak-attack.ts), never a persisted pool. Cunning
// Strike's save DC stays in prose rather than `saveDcAbilities`, because
// announcedSaveDC is a single scalar overlaid across every class entry and no
// wire consumer reads a Rogue announced DC today.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ActionCostSeed, ClassFeatureSeedRow, DerivedStatSeed } from "./class-features.js";

function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`rogue-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawRogueFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  edition?: SeedEdition;
  derivedStat?: DerivedStatSeed;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  // resourceKey with no cost columns means "always enabled" (Cunning
  // Action/Fast Hands).
  resourceKey?: string;
  activationCost?: ActionCostSeed;
  regrants?: string[];
  reminder?: string;
}

function expand(raw: RawRogueFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Rogue",
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    derivedStat: raw.derivedStat,
    derivedStatTiers: raw.derivedStatTiers,
    resourceKey: raw.resourceKey,
    activationCost: raw.activationCost,
    regrants: raw.regrants,
    reminder: raw.reminder,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// Base class — SRD 5.1 Rogue (2014) / SRD 5.2 Rogue (2024)
const ROGUE_BASE_RAW: RawRogueFeature[] = [
  {
    subclassSlug: null,
    name: "Expertise",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Choose two of your skill proficiencies (or one skill + Thieves' Tools). Your proficiency bonus is doubled for those skills. Two more at level 6.",
    // PHB'14 p.96. The Thieves' Tools alternative named in the text isn't
    // modelled — persisted expertiseKnown is skills only.
    derivedStat: "expertiseChoiceCount",
    derivedStatTiers: [
      { minLevel: 1, value: 2 },
      { minLevel: 6, value: 4 },
    ],
  },
  {
    subclassSlug: null,
    name: "Expertise",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2: drops the Thieves' Tools alternative — skill proficiencies
    // only.
    description:
      "You gain Expertise in two of your skill proficiencies of your choice. Sleight of Hand and Stealth are recommended if you have proficiency in them. At Rogue level 6, you gain Expertise in two more of your skill proficiencies of your choice.",
    // SRD 5.2: same 2/L1, 4/L6 ladder as the 2014 row.
    derivedStat: "expertiseChoiceCount",
    derivedStatTiers: [
      { minLevel: 1, value: 2 },
      { minLevel: 6, value: 4 },
    ],
  },
  {
    subclassSlug: null,
    name: "Sneak Attack",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Once per turn, deal extra damage to a target you hit with a finesse or ranged weapon when you have advantage on the attack or an ally is adjacent to the target. 1d6 at L1, +1d6 every odd level (10d6 at L19).",
  },
  {
    subclassSlug: null,
    name: "Sneak Attack",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2: ally clause tightens to within 5 ft, ally not Incapacitated,
    // no Disadvantage on your roll. Nd6 progression is edition-invariant
    // (sneakAttackDiceCount, sneak-attack.ts).
    description:
      "Once per turn, you can deal an extra 1d6 damage to one creature you hit with an attack roll if you have Advantage on the roll and the attack uses a Finesse or a Ranged weapon. The extra damage's type is the same as the weapon's type. You don't need Advantage on the attack roll if at least one of your allies is within 5 feet of the target, the ally doesn't have the Incapacitated condition, and you don't have Disadvantage on the attack roll. The extra damage increases as you gain Rogue levels, capping at 10d6 from level 19.",
  },
  {
    subclassSlug: null,
    name: "Thieves' Cant",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Secret mix of dialect and codewords used by thieves' guilds. Takes 4× as long to convey a message compared to open speech. Also understand signs and symbols used by criminals.",
  },
  {
    subclassSlug: null,
    name: "Thieves' Cant",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2: adds a second, ordinary language of your choice.
    description:
      "You picked up various languages in the communities where you plied your roguish talents. You know Thieves' Cant and one other language of your choice.",
  },
  {
    subclassSlug: null,
    name: "Weapon Mastery",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2. New in 2024. Text only, matching Barbarian's/Fighter's own
    // Weapon Mastery rows.
    description:
      "Your training with weapons allows you to use the mastery properties of two kinds of weapons of your choice with which you have proficiency, such as Daggers and Shortbows. Whenever you finish a Long Rest, you can change the kinds of weapons you chose.",
  },
  {
    subclassSlug: null,
    name: "Cunning Action",
    level: 2,
    edition: "EDITION_2014",
    description: "As a bonus action, take the Dash, Disengage, or Hide action.",
    // No reminder needed — regrants names are identical in SRD 5.1 and SRD 5.2.
    resourceKey: "cunningAction",
    activationCost: "bonusAction",
    regrants: ["dash", "disengage", "hide"],
  },
  {
    subclassSlug: null,
    name: "Cunning Action",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2: mechanically identical to 2014, transcribed from a different
    // document (CLAUDE.md's ACTIONS precedent).
    description:
      "Your quick thinking and agility allow you to move and act quickly. On your turn, you can take one of the following actions as a Bonus Action: Dash, Disengage, or Hide.",
    resourceKey: "cunningAction",
    activationCost: "bonusAction",
    regrants: ["dash", "disengage", "hide"],
  },
  {
    subclassSlug: null,
    name: "Steady Aim",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2. New in 2024.
    description:
      "As a Bonus Action, you give yourself Advantage on your next attack roll on the current turn. You can use this feature only if you haven't moved during this turn, and after you use it, your Speed is 0 until the end of the current turn.",
  },
  {
    subclassSlug: null,
    name: "Cunning Strike",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2. New in 2024. Text only — dice-spend/save-effect catalog is out
    // of scope (mirrors Barbarian's Brutal Strike).
    description:
      "You've developed cunning ways to use your Sneak Attack. When you deal Sneak Attack damage, you can add one of the following Cunning Strike effects, forgoing a number of Sneak Attack damage dice equal to the effect's die cost before rolling. If an effect requires a saving throw, the DC equals 8 plus your Dexterity modifier and Proficiency Bonus. Poison (Cost: 1d6): the target makes a Constitution save or has the Poisoned condition for 1 minute, repeating the save at the end of each of its turns (requires a Poisoner's Kit on your person). Trip (Cost: 1d6): a Large or smaller target makes a Dexterity save or has the Prone condition. Withdraw (Cost: 1d6): immediately after the attack, you move up to half your Speed without provoking Opportunity Attacks.",
  },
  {
    subclassSlug: null,
    name: "Uncanny Dodge",
    level: 5,
    edition: "EDITION_2014",
    description: "When an attacker you can see hits you, use your reaction to halve the attack's damage.",
  },
  {
    subclassSlug: null,
    name: "Uncanny Dodge",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2: mechanically identical to 2014, transcribed from a different
    // document.
    description: "When an attacker that you can see hits you with an attack roll, you can take a Reaction to halve the attack's damage against you (round down).",
  },
  {
    subclassSlug: null,
    name: "Evasion",
    level: 7,
    edition: "EDITION_2014",
    description:
      "When subjected to an effect that allows a Dexterity save for half damage, you take no damage on a success and half damage on a failure.",
  },
  {
    subclassSlug: null,
    name: "Evasion",
    level: 7,
    edition: "EDITION_2024",
    // SRD 5.2: adds a can't-use-while-Incapacitated carve-out.
    description:
      "When you're subjected to an effect that allows you to make a Dexterity saving throw to take only half damage, you instead take no damage if you succeed on the saving throw and only half damage if you fail. You can't use this feature if you have the Incapacitated condition.",
  },
  {
    subclassSlug: null,
    name: "Reliable Talent",
    level: 11,
    edition: "EDITION_2014",
    description: "When making an ability check with a skill or tool you're proficient in, treat a d20 roll of 9 or lower as a 10.",
  },
  {
    subclassSlug: null,
    name: "Reliable Talent",
    level: 7,
    edition: "EDITION_2024",
    // SRD 5.2: level-shifts 11 -> 7 (fills the slot Evasion shares); mechanics unchanged.
    description: "Whenever you make an ability check that uses one of your skill or tool proficiencies, you can treat a d20 roll of 9 or lower as a 10.",
  },
  {
    subclassSlug: null,
    name: "Blindsense",
    level: 14,
    edition: "EDITION_2014",
    description: "If able to hear, you are aware of the location of any hidden or invisible creature within 10 feet.",
  },
  {
    subclassSlug: null,
    name: "Improved Cunning Strike",
    level: 11,
    edition: "EDITION_2024",
    // SRD 5.2. New in 2024.
    description: "You can use up to two Cunning Strike effects when you deal Sneak Attack damage, paying the die cost for each effect.",
  },
  {
    subclassSlug: null,
    name: "Devious Strikes",
    level: 14,
    edition: "EDITION_2024",
    // SRD 5.2. New in 2024. Fills Blindsense's L14 slot.
    description:
      "You've practiced new ways to use your Sneak Attack deviously. The following effects are now among your Cunning Strike options. Daze (Cost: 2d6): the target makes a Constitution save or, on its next turn, can do only one of move, take an action, or take a Bonus Action. Knock Out (Cost: 6d6): the target makes a Constitution save or has the Unconscious condition for 1 minute or until it takes any damage, repeating the save at the end of each of its turns. Obscure (Cost: 3d6): the target makes a Dexterity save or has the Blinded condition until the end of its next turn.",
  },
  {
    subclassSlug: null,
    name: "Slippery Mind",
    level: 15,
    edition: "EDITION_2014",
    description: "You gain proficiency in Wisdom saving throws.",
  },
  {
    subclassSlug: null,
    name: "Slippery Mind",
    level: 15,
    edition: "EDITION_2024",
    // SRD 5.2: grants Wisdom AND Charisma save proficiency, not Wisdom alone.
    description: "Your cunning mind is exceptionally difficult to control. You gain proficiency in Wisdom and Charisma saving throws.",
  },
  {
    subclassSlug: null,
    name: "Elusive",
    level: 18,
    edition: "EDITION_2014",
    description: "No attack roll has advantage against you while you aren't incapacitated.",
  },
  {
    subclassSlug: null,
    name: "Elusive",
    level: 18,
    edition: "EDITION_2024",
    // SRD 5.2: mechanically identical to 2014, transcribed from a different
    // document.
    description:
      "You're so evasive that attackers rarely gain the upper hand against you. No attack roll can have Advantage against you unless you have the Incapacitated condition.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2. New in 2024; 2014 keeps a plain ASI at 19 instead. Text only —
    // feat system deferred.
    description: "You gain an Epic Boon feat of your choice (Boon of the Night Spirit recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Stroke of Luck",
    level: 20,
    edition: "EDITION_2014",
    description:
      "If your attack misses a target in range, you can turn the miss into a hit. Or if you fail an ability check, you can treat the d20 roll as a 20. Once used, regain on a short or long rest.",
  },
  {
    subclassSlug: null,
    name: "Stroke of Luck",
    level: 20,
    edition: "EDITION_2024",
    // SRD 5.2: broadens to any failed D20 Test (attack roll, ability check,
    // OR saving throw); the attack-miss-to-hit clause is gone.
    description:
      "You have a marvelous knack for succeeding when you need to. If you fail a D20 Test, you can turn the roll into a 20. Once you use this feature, you can't use it again until you finish a Short or Long Rest.",
  },
];

// Arcane Trickster — PHB'24 (mirror-sourced; not in SRD 5.2). 2014: PHB'14.
// Mirrors: dnd2024.wikidot.com/rogue:arcane-trickster and the 5etools-mirror-3/
// 5etools-src XPHB subclassFeature rows agree verbatim.
const ARCANE_TRICKSTER_SLUG = slug("rogue-arcane-trickster");
const ARCANE_TRICKSTER_RAW: RawRogueFeature[] = [
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Arcane Trickster Spellcasting",
    level: 3,
    edition: "EDITION_2014",
    description:
      "You learn spells from the wizard list (primarily enchantment and illusion), casting with Intelligence. Third-caster progression starting at level 3.",
  },
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Arcane Trickster Spellcasting",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). Prepared-caster framing (not
    // "spells known").
    description:
      "You learn to cast spells from the wizard list, cast with Intelligence. You know three cantrips, including Mage Hand — replaceable each Rogue level (except Mage Hand), with a fourth cantrip gained at level 10 — and you prepare a growing list of level 1+ spells (three to start, more as you gain Rogue levels), also replaceable one at a time each Rogue level. You regain all expended spell slots on a Long Rest, and you can use an Arcane Focus as your spellcasting focus.",
  },
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Mage Hand Legerdemain",
    level: 3,
    edition: "EDITION_2014",
    description:
      "You know the Mage Hand cantrip. The hand is invisible and can pick locks, disarm traps, or steal items using your Sleight of Hand skill — even from creatures as long as you distract them.",
  },
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Mage Hand Legerdemain",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). 2014's lock-picking/trap-
    // disarming/item-stealing enumeration is gone.
    description:
      "When you cast Mage Hand, you can cast it as a Bonus Action, and you can make the spectral hand Invisible. You can control the hand as a Bonus Action, and through it, you can make Dexterity (Sleight of Hand) checks.",
  },
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Magical Ambush",
    level: 9,
    edition: "EDITION_2014",
    description:
      "If you are hidden when you cast a spell, the target has disadvantage on any saving throw it makes against the spell on the same turn.",
  },
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Magical Ambush",
    level: 9,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). Trigger is the Invisible
    // condition, not merely "hidden."
    description:
      "If you have the Invisible condition when you cast a spell on a creature, it has Disadvantage on any saving throw it makes against the spell on the same turn.",
  },
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Versatile Trickster",
    level: 13,
    edition: "EDITION_2014",
    description:
      "As a bonus action, direct your Mage Hand to distract a creature within 5 ft of it. Gain advantage on the next attack roll against that creature before the end of your turn.",
  },
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Versatile Trickster",
    level: 13,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2).
    description:
      "You gain the ability to distract targets with your Mage Hand. When you use the Trip option of your Cunning Strike on a creature, you can also use that option on another creature within 5 feet of the spectral hand.",
  },
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Spell Thief",
    level: 17,
    edition: "EDITION_2014",
    description:
      "Immediately after a creature casts a spell that targets you, use your reaction to force it to make a saving throw with its spellcasting ability modifier (DC = your spell save DC). On failure, you negate the spell and steal it — you can cast it (same level) once without a slot within 8 hours. Once used, regain on a long rest.",
  },
  {
    subclassSlug: ARCANE_TRICKSTER_SLUG,
    name: "Spell Thief",
    level: 17,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). Caster now saves against YOUR
    // spell save DC (2014: their own ability); lockout fires only on a
    // successful steal.
    description:
      "Immediately after a creature casts a spell that targets you or includes you in its area of effect, you can take a Reaction to force the creature to make an Intelligence saving throw. The DC equals your spell save DC. On a failed save, you negate the spell's effect against you, and you steal the knowledge of the spell if it is at least level 1 and of a level you can cast. For the next 8 hours, you have it prepared, and the creature can't cast it until then. Once you steal a spell with this feature, you can't use it again until you finish a Long Rest.",
  },
];

// Assassin — PHB'24 (mirror-sourced; not in SRD 5.2). 2014: PHB'14.
// Mirrors: dnd2024.wikidot.com/rogue:assassin and the 5etools-mirror-3/
// 5etools-src XPHB subclassFeature rows agree verbatim.
const ASSASSIN_SLUG = slug("rogue-assassin");
const ASSASSIN_RAW: RawRogueFeature[] = [
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Bonus Proficiencies",
    level: 3,
    edition: "EDITION_2014",
    description: "You gain proficiency with the disguise kit and the poisoner's kit.",
  },
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Assassin's Tools",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). Renamed from 2014's "Bonus
    // Proficiencies" — same kit grant.
    description: "You gain a Disguise Kit and a Poisoner's Kit, and you have proficiency with them.",
  },
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Assassinate",
    level: 3,
    edition: "EDITION_2014",
    description:
      "You have advantage on attack rolls against any creature that hasn't taken a turn yet this combat. Any hit against a surprised creature is a critical hit.",
  },
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Assassinate",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). Auto-crit clause removed; adds
    // Advantage on Initiative rolls and a Sneak-Attack damage rider.
    description:
      "You're adept at ambushing a target, granting you the following benefits. Initiative: you have Advantage on Initiative rolls. Surprising Strikes: during the first round of each combat, you have Advantage on attack rolls against any creature that hasn't taken a turn. If your Sneak Attack hits any target during that round, the target takes extra damage of the weapon's type equal to your Rogue level.",
  },
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Infiltration Expertise",
    level: 9,
    edition: "EDITION_2014",
    description:
      "Spend 7 days and 25 gp creating a false identity, including documentation, established acquaintances, and disguises. You can't adopt an identity that belongs to someone else.",
  },
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Infiltration Expertise",
    level: 9,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). A same-name FORK, not a
    // remove-plus-add — absorbs 2014's "Impostor" feature. Never author a
    // 2024 "Impostor" row; its mechanics live on inside this row.
    description:
      "You are expert at the following techniques that aid your infiltrations. Masterful Mimicry: you can unerringly mimic another person's speech, handwriting, or both if you have spent at least 1 hour studying them. Roving Aim: your Speed isn't reduced to 0 by using Steady Aim.",
  },
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Impostor",
    level: 13,
    edition: "EDITION_2014",
    description:
      "After studying a creature for 3 hours, you can mimic its speech, writing, and behavior. A Wisdom (Insight) check contested by your Charisma (Deception) reveals the imposture.",
  },
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Envenom Weapons",
    level: 13,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). New in 2024; fills the L13
    // slot Impostor vacated.
    description:
      "When you use the Poison option of your Cunning Strike, the target also takes 2d6 Poison damage whenever it fails the saving throw. This damage ignores Resistance to Poison damage.",
  },
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Death Strike",
    level: 17,
    edition: "EDITION_2014",
    description:
      "When you hit a surprised creature, it must make a Constitution save (DC 8 + your Dexterity modifier + proficiency bonus) or take double damage from the attack.",
  },
  {
    subclassSlug: ASSASSIN_SLUG,
    name: "Death Strike",
    level: 17,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). No longer requires Surprise —
    // gated to a first-round Sneak Attack hit instead.
    description:
      "When you hit with your Sneak Attack on the first round of a combat, the target must succeed on a Constitution saving throw (DC 8 plus your Dexterity modifier and Proficiency Bonus), or the attack's damage is doubled against the target.",
  },
];

// Thief — SRD 5.2.1 (2024) / PHB'14 (2014). The only Rogue subclass SRD 5.2
// ships.
const THIEF_SLUG = slug("rogue-thief");
const THIEF_RAW: RawRogueFeature[] = [
  {
    subclassSlug: THIEF_SLUG,
    name: "Fast Hands",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Use the Cunning Action bonus action to make a Sleight of Hand check, use Thieves' Tools to disarm a trap or open a lock, or take the Use an Object action.",
    // A mode of Cunning Action, not a second Bonus Action — the reminder
    // text says so. It doesn't name the object-use action itself since SRD
    // 5.1/5.2 use different names (Use an Object / Utilize) for it.
    resourceKey: "fastHands",
    activationCost: "bonusAction",
    regrants: ["useObject"],
    // Kept under ~90 chars — OptionCard truncates the card subtitle to one line.
    reminder: "Uses Cunning Action's Bonus Action, not an extra one — Sleight of Hand or Thieves' Tools.",
  },
  {
    subclassSlug: THIEF_SLUG,
    name: "Fast Hands",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2: "Use an Object" now names the Utilize action (or Magic for a
    // magic item that requires it).
    description:
      "As a Bonus Action, you can do one of the following. Sleight of Hand: make a Dexterity (Sleight of Hand) check to pick a lock or disarm a trap with Thieves' Tools or to pick a pocket. Use an Object: take the Utilize action, or take the Magic action to use a magic item that requires that action.",
    resourceKey: "fastHands",
    activationCost: "bonusAction",
    regrants: ["useObject"],
    reminder: "Uses Cunning Action's Bonus Action, not an extra one — Sleight of Hand or Thieves' Tools.",
  },
  {
    subclassSlug: THIEF_SLUG,
    name: "Second-Story Work",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Climbing no longer costs extra movement. When you make a running jump, the distance you cover increases by a number of feet equal to your Dexterity modifier.",
  },
  {
    subclassSlug: THIEF_SLUG,
    name: "Second-Story Work",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2: Climber grants a full Climb Speed; Jumper uses Dexterity
    // instead of Strength for jump distance (no added modifier).
    description:
      "You've trained to get into especially hard-to-reach places, granting you these benefits. Climber: you gain a Climb Speed equal to your Speed. Jumper: you can determine your jump distance using your Dexterity rather than your Strength.",
  },
  {
    subclassSlug: THIEF_SLUG,
    name: "Supreme Sneak",
    level: 9,
    edition: "EDITION_2014",
    description: "You have advantage on a Dexterity (Stealth) check if you move no more than half your speed on the same turn.",
  },
  {
    subclassSlug: THIEF_SLUG,
    name: "Supreme Sneak",
    level: 9,
    edition: "EDITION_2024",
    // SRD 5.2: reworked into a Cunning Strike option (Stealth Attack) — a
    // wholly different mechanic than 2014's flat Stealth-check Advantage.
    description:
      "You gain the following Cunning Strike option. Stealth Attack (Cost: 1d6): if you have the Invisible condition from the Hide action, this attack doesn't end that condition on you if you end the turn behind Three-Quarters Cover or Total Cover.",
  },
  {
    subclassSlug: THIEF_SLUG,
    name: "Use Magic Device",
    level: 13,
    edition: "EDITION_2014",
    description: "You ignore all class, race, and level requirements on the use of magic items.",
  },
  {
    subclassSlug: THIEF_SLUG,
    name: "Use Magic Device",
    level: 13,
    edition: "EDITION_2024",
    // SRD 5.2: full rewrite into three named benefits (Attunement/Charges/
    // Scrolls), replacing 2014's blanket requirement-ignoring clause.
    description:
      "You've learned how to maximize use of magic items, granting you the following benefits. Attunement: you can attune to up to four magic items at once. Charges: whenever you use a magic item property that expends charges, roll 1d6 — on a roll of 6, you use the property without expending the charges. Scrolls: you can use any Spell Scroll, using Intelligence as your spellcasting ability for the spell. If the spell is a cantrip or a level 1 spell, you can cast it reliably. If the scroll contains a higher-level spell, you must first succeed on an Intelligence (Arcana) check (DC 10 plus the spell's level); on a success you cast the spell from the scroll, and on a failure the scroll disintegrates.",
  },
  {
    subclassSlug: THIEF_SLUG,
    name: "Thief's Reflexes",
    level: 17,
    edition: "EDITION_2014",
    description:
      "You take two turns during the first round of any combat: your first turn at your normal initiative and your second at your initiative minus 10. You can't use this feature when surprised.",
  },
  {
    subclassSlug: THIEF_SLUG,
    name: "Thief's Reflexes",
    level: 17,
    edition: "EDITION_2024",
    // SRD 5.2: drops the "can't use when surprised" clause — otherwise
    // unchanged (two turns round 1, second at Initiative minus 10).
    description:
      "You are adept at laying ambushes and quickly escaping danger. You can take two turns during the first round of any combat. You take your first turn at your normal Initiative and your second turn at your Initiative minus 10.",
  },
];

export const ROGUE_FEATURES: ClassFeatureSeedRow[] = [
  ...ROGUE_BASE_RAW,
  ...ARCANE_TRICKSTER_RAW,
  ...ASSASSIN_RAW,
  ...THIEF_RAW,
].flatMap(expand);
