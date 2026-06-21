import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { PrismaClient } from "../src/generated/prisma/client.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── Action catalog ───────────────────────────────────────────────────────────
// Turn-economy actions: universal (every character) + class-specific.
// Display + gating data ONLY — executable mechanics live in lib/actions.ts.
// Adding a new action = append here + add the effect fn in lib/actions.ts.
// ActionCost enum values: action | bonusAction | reaction | free | special

interface ActionSeed {
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

const ACTIONS: ActionSeed[] = [
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

// --- Reference catalog -------------------------------------------------
// A small SRD subset populating the character-creation form's baseline
// lists (served via GET /api/reference, see src/routes/reference.ts).
// Covers every race/class/background used by SEED_CHARACTERS below, plus a
// handful of extra options so the form isn't a list of three.

// Full PHB race/subrace list. Expanded to named subraces so racial proficiency
// grants (armor for Mountain Dwarf, weapons for Elves, etc.) resolve correctly.
// Legacy generic entries (plain "Dwarf", "Elf") are kept for back-compat with
// any existing characters created before this expansion.
const RACES = [
  // Dwarf subraces
  { name: "Hill Dwarf",     speed: 25 },
  { name: "Mountain Dwarf", speed: 25 },
  // Elf subraces
  { name: "High Elf",       speed: 30 },
  { name: "Wood Elf",       speed: 35 },
  { name: "Drow",           speed: 30 },
  // Halfling subraces
  { name: "Lightfoot Halfling", speed: 25 },
  { name: "Stout Halfling",     speed: 25 },
  // Human (no subrace split)
  { name: "Human",         speed: 30 },
  // Dragonborn (no subrace split in PHB)
  { name: "Dragonborn",    speed: 30 },
  // Gnome subraces
  { name: "Forest Gnome",  speed: 25 },
  { name: "Rock Gnome",    speed: 25 },
  // Half-races and Tiefling
  { name: "Half-Elf",      speed: 30 },
  { name: "Half-Orc",      speed: 30 },
  { name: "Tiefling",      speed: 30 },
  // Legacy generic entries — kept for back-compat with characters created
  // before this list was expanded to named subraces.
  { name: "Dwarf",         speed: 25 },
  { name: "Halfling",      speed: 25 },
  { name: "Gnome",         speed: 25 },
];

const CLASSES = [
  {
    name: "Wizard",
    hitDie: "d6",
    savingThrows: ["intelligence", "wisdom"],
    skillChoiceCount: 2,
    skillChoices: ["arcana", "history", "insight", "investigation", "medicine", "religion"],
    isSpellcaster: true,
    subclassLevel: 2,
  },
  {
    name: "Fighter",
    hitDie: "d10",
    savingThrows: ["strength", "constitution"],
    skillChoiceCount: 2,
    skillChoices: [
      "acrobatics",
      "animalHandling",
      "athletics",
      "history",
      "insight",
      "intimidation",
      "perception",
      "survival",
    ],
    isSpellcaster: false,
    subclassLevel: 3,
  },
  {
    name: "Rogue",
    hitDie: "d8",
    savingThrows: ["dexterity", "intelligence"],
    skillChoiceCount: 4,
    skillChoices: [
      "acrobatics",
      "athletics",
      "deception",
      "insight",
      "intimidation",
      "investigation",
      "perception",
      "performance",
      "persuasion",
      "sleightOfHand",
      "stealth",
    ],
    isSpellcaster: false,
    subclassLevel: 3,
    toolProficiencies: ["Thieves' Tools"], // class always grants this
  },
  {
    name: "Cleric",
    hitDie: "d8",
    savingThrows: ["wisdom", "charisma"],
    skillChoiceCount: 2,
    skillChoices: ["history", "insight", "medicine", "persuasion", "religion"],
    isSpellcaster: true,
    subclassLevel: 1,
  },
  {
    name: "Barbarian",
    hitDie: "d12",
    savingThrows: ["strength", "constitution"],
    skillChoiceCount: 2,
    skillChoices: ["animalHandling", "athletics", "intimidation", "nature", "perception", "survival"],
    isSpellcaster: false,
    subclassLevel: 3,
  },
  {
    name: "Bard",
    hitDie: "d8",
    savingThrows: ["dexterity", "charisma"],
    skillChoiceCount: 3,
    skillChoices: [
      "acrobatics",
      "animalHandling",
      "arcana",
      "athletics",
      "deception",
      "history",
      "insight",
      "intimidation",
      "investigation",
      "medicine",
      "nature",
      "perception",
      "performance",
      "persuasion",
      "religion",
      "sleightOfHand",
      "stealth",
      "survival",
    ],
    isSpellcaster: true,
    subclassLevel: 3,
    // PHB: Three musical instruments of your choice.
    toolChoiceCount: 3,
    toolChoices: [
      "Bagpipes", "Drum", "Dulcimer", "Flute", "Lute",
      "Lyre", "Horn", "Pan Flute", "Shawm", "Viol",
    ],
  },
  {
    name: "Druid",
    hitDie: "d8",
    savingThrows: ["intelligence", "wisdom"],
    skillChoiceCount: 2,
    skillChoices: ["arcana", "animalHandling", "insight", "medicine", "nature", "perception", "religion", "survival"],
    isSpellcaster: true,
    subclassLevel: 2,
  },
  {
    name: "Monk",
    hitDie: "d8",
    savingThrows: ["strength", "dexterity"],
    skillChoiceCount: 2,
    skillChoices: ["acrobatics", "athletics", "history", "insight", "religion", "stealth"],
    isSpellcaster: false,
    subclassLevel: 3,
    // PHB: One type of artisan's tools or one musical instrument of your choice.
    toolChoiceCount: 1,
    toolChoices: [
      "Alchemist's Supplies", "Brewer's Supplies", "Calligrapher's Supplies",
      "Carpenter's Tools", "Cartographer's Tools", "Cobbler's Tools",
      "Cook's Utensils", "Glassblower's Tools", "Jeweler's Tools",
      "Leatherworker's Tools", "Mason's Tools", "Painter's Supplies",
      "Potter's Tools", "Smith's Tools", "Tinker's Tools",
      "Weaver's Tools", "Woodcarver's Tools",
      "Bagpipes", "Drum", "Dulcimer", "Flute", "Lute",
      "Lyre", "Horn", "Pan Flute", "Shawm", "Viol",
    ],
  },
  {
    name: "Paladin",
    hitDie: "d10",
    savingThrows: ["wisdom", "charisma"],
    skillChoiceCount: 2,
    skillChoices: ["athletics", "insight", "intimidation", "medicine", "persuasion", "religion"],
    isSpellcaster: true,
    subclassLevel: 3,
  },
  {
    name: "Ranger",
    hitDie: "d10",
    savingThrows: ["strength", "dexterity"],
    skillChoiceCount: 3,
    skillChoices: ["animalHandling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"],
    isSpellcaster: true,
    subclassLevel: 3,
  },
  {
    name: "Sorcerer",
    hitDie: "d6",
    savingThrows: ["constitution", "charisma"],
    skillChoiceCount: 2,
    skillChoices: ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"],
    isSpellcaster: true,
    subclassLevel: 1,
  },
  {
    name: "Warlock",
    hitDie: "d8",
    savingThrows: ["wisdom", "charisma"],
    skillChoiceCount: 2,
    skillChoices: ["arcana", "deception", "history", "intimidation", "investigation", "nature", "religion"],
    isSpellcaster: true,
    subclassLevel: 1,
  },
];

// --- Subclass catalog -------------------------------------------------------
// Class-keyed subclass catalog powering the character-creation dropdown and
// post-creation setSubclass transaction. Only classes/subclasses currently
// covered by SEED_CHARACTERS need full mechanics support in srd.ts — others
// are included for creation UX completeness.
interface SubclassSeed {
  className: string;    // must match an entry in CLASSES
  name: string;
  description: string;
}

const SUBCLASSES: SubclassSeed[] = [
  // ── Fighter ────────────────────────────────────────────────────────────────
  {
    className: "Fighter",
    name: "Battle Master",
    description:
      "Masters of tactical martial combat. You learn special maneuvers fueled by superiority dice (d8s). You know 3 maneuvers at level 3, gaining more at higher levels. Superiority dice refresh on a short or long rest.",
  },
  {
    className: "Fighter",
    name: "Champion",
    description:
      "A paragon of physical might. Your critical hit range expands (19–20 at level 3, 18–20 at level 15), and you gain additional combat benefits including second wind improvements.",
  },
  {
    className: "Fighter",
    name: "Eldritch Knight",
    description:
      "A warrior who weaves abjuration and evocation magic into combat. You gain spellcasting using Intelligence, following the third-caster progression (slots start at level 3).",
  },
  // ── Wizard ────────────────────────────────────────────────────────────────
  {
    className: "Wizard",
    name: "School of Evocation",
    description:
      "You focus your study on magic that creates powerful elemental effects. Sculpt Spells lets you protect allies from area-of-effect spells; Empowered Evocation adds your Intelligence modifier to evocation spell damage.",
  },
  {
    className: "Wizard",
    name: "School of Abjuration",
    description:
      "A specialist in protective and warding magic. You gain an Arcane Ward that absorbs damage, and can extend its protection to allies.",
  },
  {
    className: "Wizard",
    name: "School of Illusion",
    description:
      "You study magic that dazzles the senses and tricks the mind. Improved Minor Illusion and Malleable Illusions let you push the boundaries of what can appear real.",
  },
  // ── Rogue ─────────────────────────────────────────────────────────────────
  {
    className: "Rogue",
    name: "Arcane Trickster",
    description:
      "You combine roguish skill with arcane magic, learning enchantment and illusion spells using Intelligence following the third-caster progression. Mage Hand becomes an extension of your cunning.",
  },
  {
    className: "Rogue",
    name: "Assassin",
    description:
      "Trained in the art of swift, lethal strikes. You gain proficiency with disguise and poisoner's kits, and deal massive damage to surprised targets with Assassinate.",
  },
  // ── Cleric ────────────────────────────────────────────────────────────────
  {
    className: "Cleric",
    name: "Life Domain",
    description:
      "Devoted to the positive energy that sustains life. You gain heavy armor proficiency and powerful healing features including Disciple of Life (healing spells restore additional HP) and Blessed Healer.",
  },
  {
    className: "Cleric",
    name: "Trickery Domain",
    description:
      "A champion of deception and infiltration. You gain access to domain spells like Charm Person and Disguise Self, and can grant allies the ability to attack with advantage using your Blessing of the Trickster.",
  },
  // ── Barbarian ─────────────────────────────────────────────────────────────
  {
    className: "Barbarian",
    name: "Totem Warrior",
    description:
      "You forge a connection to a spirit animal. Totem choices include Bear (resistance while raging), Eagle (disengage/dash as bonus action), and Wolf (allies have advantage on melee attacks vs. nearby targets).",
  },
  {
    className: "Barbarian",
    name: "Berserker",
    description:
      "You channel a battle frenzy beyond normal rage. Frenzied Rage lets you make a bonus attack each turn, and Mindless Rage makes you immune to the charmed and frightened conditions while raging.",
  },
  // ── Bard ─────────────────────────────────────────────────────────────────
  {
    className: "Bard",
    name: "College of Lore",
    description:
      "Devoted to knowledge and cunning. You gain proficiency in three additional skills, Cutting Words to impose penalties on enemy rolls, and bonus spells from any class at level 6.",
  },
  {
    className: "Bard",
    name: "College of Valor",
    description:
      "A bard who fights as well as they inspire. You gain medium armor and shield proficiency, Combat Inspiration (allies add your Bardic Inspiration die to damage rolls), and Extra Attack at level 6.",
  },
  // ── Druid ─────────────────────────────────────────────────────────────────
  {
    className: "Druid",
    name: "Circle of the Land",
    description:
      "You draw on the magic of the natural world, becoming a conduit for druidic power. You gain additional spells based on a chosen terrain type (arctic, coast, desert, forest, grassland, mountain, swamp, or Underdark), Natural Recovery to restore expended spell slots on a short rest, and spells always prepared from your circle.",
  },
  {
    className: "Druid",
    name: "Circle of the Moon",
    description:
      "You are at home in the wild, capable of transforming into more powerful beasts. Starting at level 2 you can Wild Shape into beasts with CR up to 1 (scaling to CR equal to a third of your druid level at level 6), and you can use Wild Shape as a bonus action. At higher levels you can transform into elementals.",
  },
  // ── Monk ─────────────────────────────────────────────────────────────────
  {
    className: "Monk",
    name: "Way of the Open Hand",
    description:
      "You master techniques to push and trip opponents, cover yourself in a shroud of ki, and enter a trance state that heals your wounds. Open Hand Technique allows you to impose special effects on creatures hit by your Flurry of Blows — knocking them prone, pushing them 15 ft, or denying their reaction.",
  },
  {
    className: "Monk",
    name: "Way of Shadow",
    description:
      "You follow a tradition that values stealth and subtlety. You can cast certain spells by spending ki points, teleport between areas of shadow, and silence a zone around yourself. At higher levels you become one with the darkness, striking from the unseen.",
  },
  // ── Paladin ───────────────────────────────────────────────────────────────
  {
    className: "Paladin",
    name: "Oath of Devotion",
    description:
      "The Oath of Devotion binds you to the loftiest ideals of justice and order. Channel Divinity options include Sacred Weapon (add Cha modifier to attack rolls) and Turn the Unholy. You gain spells such as Protection from Evil and Good and Guardian of Faith, and eventually radiate an aura of courage.",
  },
  {
    className: "Paladin",
    name: "Oath of the Ancients",
    description:
      "You swear to protect the light and the living world. Channel Divinity options are Nature's Wrath (restrain a creature) and Turn the Faithless. You gain spells such as Ensnaring Strike and Misty Step, and eventually gain resistance to spell damage from magical effects.",
  },
  {
    className: "Paladin",
    name: "Oath of Vengeance",
    description:
      "You pursue the worst of the worst with righteous fury. Vow of Enmity grants advantage on attack rolls against one creature; Abjure Enemy holds a foe in fear. You gain spells such as Bane and Hold Person, and eventually can teleport to strike your quarry wherever they flee.",
  },
  // ── Ranger ───────────────────────────────────────────────────────────────
  {
    className: "Ranger",
    name: "Hunter",
    description:
      "You stalk prey with precision and power. Hunter's Prey options (Colossus Slayer, Giant Killer, Horde Breaker) let you customize your approach against different threats. Defensive Tactics at level 7 add further versatility, letting you shrug off opportunity attacks, gain multiattack defense, or escape being surrounded.",
  },
  {
    className: "Ranger",
    name: "Beast Master",
    description:
      "You forge an unbreakable bond with an animal companion that fights alongside you. Your companion acts on your turn and grows more powerful as you level — sharing your proficiency bonus, gaining additional attacks, and becoming harder to kill. The bond lets you communicate with it telepathically.",
  },
  // ── Sorcerer ─────────────────────────────────────────────────────────────
  {
    className: "Sorcerer",
    name: "Draconic Bloodline",
    description:
      "Magic runs in your veins as the blood of a dragon ancestor. You gain natural armor (AC 13 + Dex modifier without armor), resistance to your dragon type's damage, bonus damage on spells of that type, and eventually sprout wings and radiate a draconic presence that can frighten or charm creatures around you.",
  },
  {
    className: "Sorcerer",
    name: "Wild Magic",
    description:
      "Your innate magic stems from an untamed, chaotic source. Every time you cast a 1st level or higher spell there is a chance of a Wild Magic Surge — a random magical effect. Tides of Chaos grants advantage on one attack roll, ability check, or saving throw. Controlled Chaos and Spell Bombardment appear at higher levels.",
  },
  // ── Warlock ───────────────────────────────────────────────────────────────
  {
    className: "Warlock",
    name: "The Fiend",
    description:
      "You have made a pact with a powerful devil or demon of the Lower Planes. Dark One's Blessing grants temporary HP whenever you reduce a hostile creature to 0. You gain a bonus spell list including Burning Hands and Command, and eventually gain fire resistance, immunity to fire, and the ability to call up fiends to serve you.",
  },
  {
    className: "Warlock",
    name: "The Archfey",
    description:
      "Your patron is a lord or lady of the Feywild. Fey Presence (charm or frighten nearby creatures as an action) and Misty Escape (teleport and turn invisible as a reaction when hit) define your early power. At higher levels you become immune to charm, can beguile minds, and can blur the line between dream and reality.",
  },
  {
    className: "Warlock",
    name: "The Great Old One",
    description:
      "Your patron is an entity of unfathomable cosmic power. Awakened Mind lets you telepathically communicate with any creature you can see. You gain spells such as Dissonant Whispers and Detect Thoughts, and eventually can project your awareness across planes, speak into the minds of others, and create a lair in the Far Realm.",
  },
];

// --- Maneuver catalog -------------------------------------------------------
// SRD Battle Master maneuvers. Seeded by name (unique); the known-maneuver
// picker will fetch these from GET /api/maneuvers. Descriptions are concise
// enough to render as inline tooltips without truncation.
interface ManeuverSeed {
  name: string;
  description: string;
}

const MANEUVERS: ManeuverSeed[] = [
  {
    name: "Commander's Strike",
    description:
      "When you take the Attack action, forgo one of your attacks and use a bonus action to direct one ally to strike. Expend a superiority die; the ally uses their reaction to make one weapon attack and adds the die result to the damage roll.",
  },
  {
    name: "Disarming Attack",
    description:
      "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. The target must make a Strength saving throw or drop one item of your choice. The item lands at its feet.",
  },
  {
    name: "Distracting Strike",
    description:
      "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. The next attack roll against the target by someone other than you has advantage if made before the start of your next turn.",
  },
  {
    name: "Evasive Footwork",
    description:
      "When you move, expend a superiority die and add it to your AC until you stop moving.",
  },
  {
    name: "Feinting Attack",
    description:
      "As a bonus action, you can expend a superiority die and choose one creature within 5 feet. You have advantage on your next attack roll against that creature this turn. On a hit, add the die result to the damage roll.",
  },
  {
    name: "Goading Attack",
    description:
      "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. The target must make a Wisdom saving throw or have disadvantage on all attack rolls against targets other than you until the end of your next turn.",
  },
  {
    name: "Lunging Attack",
    description:
      "When you make a melee weapon attack, expend a superiority die to increase your reach by 5 feet. On a hit, add the die result to the damage roll.",
  },
  {
    name: "Maneuvering Attack",
    description:
      "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. Choose one friendly creature. It can use its reaction to move up to half its speed without provoking opportunity attacks from the target.",
  },
  {
    name: "Menacing Attack",
    description:
      "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. The target must make a Wisdom saving throw or be frightened of you until the end of your next turn.",
  },
  {
    name: "Parry",
    description:
      "When you take damage from a melee attack, use your reaction to expend a superiority die and reduce the damage by the die result + your Dexterity modifier.",
  },
  {
    name: "Precision Attack",
    description:
      "When you make a weapon attack roll, you can expend a superiority die and add the result to the roll. You can use this maneuver before or after making the attack roll, but before any effects of the attack are applied.",
  },
  {
    name: "Pushing Attack",
    description:
      "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. If the target is Large or smaller, it must make a Strength saving throw or be pushed up to 15 feet away from you.",
  },
  {
    name: "Rally",
    description:
      "As a bonus action, expend a superiority die to bolster one ally you can see within 60 feet. The ally gains temporary HP equal to the die result + your Charisma modifier.",
  },
  {
    name: "Riposte",
    description:
      "When a creature misses you with a melee attack, use your reaction to expend a superiority die and make one melee weapon attack against that creature. On a hit, add the die result to the damage roll.",
  },
  {
    name: "Sweeping Attack",
    description:
      "When you hit a creature with a melee weapon attack, expend a superiority die and attempt to hit a second creature within 5 feet of the first. If the original roll would have hit the second creature, it takes the die result in damage.",
  },
  {
    name: "Trip Attack",
    description:
      "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. If the target is Large or smaller, it must make a Strength saving throw or be knocked prone.",
  },
];

// ── Feat catalog ──────────────────────────────────────────────────────────────
// Curated SRD subset. abilityOptions/abilityIncrease drive the half-feat bump;
// empty abilityOptions = not a half-feat. Descriptions are concise summaries.
// Deeper per-feat mechanics (Lucky rerolls, Sentinel reactions, Mobile
// speed/disengage) are surfaced as description text, not automated.

interface FeatImprovement {
  target: string;
  amount: number;
  perLevel?: boolean;
}

interface FeatSeed {
  name: string;
  description: string;
  prerequisite?: string;
  abilityOptions?: string[];
  abilityIncrease?: number;
  improvements?: FeatImprovement[];
}

const FEATS: FeatSeed[] = [
  // ── Full feats (no ability bump) ──────────────────────────────────────────
  {
    name: "Alert",
    description:
      "Always on the lookout for danger. You gain +5 to initiative rolls, can't be surprised while conscious, and other creatures don't gain advantage on attack rolls against you as a result of being unseen by you.",
    improvements: [{ target: "initiative", amount: 5 }],
  },
  {
    name: "Lucky",
    description:
      "You have 3 luck points. Whenever you make an attack roll, ability check, or saving throw, you can spend one luck point to roll an additional d20 and choose which result to use. You can also spend a luck point when a creature attacks you. Luck points refresh on a long rest.",
  },
  {
    name: "Mobile",
    description:
      "Your speed increases by 10 feet. When you take the Dash action, difficult terrain doesn't cost you extra movement for the rest of the turn. When you make a melee attack against a creature, you don't provoke opportunity attacks from that creature for the rest of the turn, whether or not you hit.",
    improvements: [{ target: "speed", amount: 10 }],
  },
  {
    name: "Sentinel",
    description:
      "You excel at seizing the opportune moment. Creatures you hit with opportunity attacks have their speed reduced to 0. Creatures within 5 feet of you provoke opportunity attacks even if they Disengage. When a creature within 5 feet attacks a target other than you, you can use a reaction to make a melee weapon attack against it.",
  },
  {
    name: "Skilled",
    description:
      "You gain proficiency in any combination of three skills or tools of your choice.",
  },
  {
    name: "Magic Initiate",
    description:
      "Choose a class: bard, cleric, druid, sorcerer, warlock, or wizard. You learn two cantrips and one 1st-level spell from that class's list. You can cast the 1st-level spell once per long rest using this feat (not using spell slots). Your spellcasting ability is the one associated with the chosen class.",
  },
  {
    name: "War Caster",
    description:
      "You have advantage on Constitution saving throws to maintain concentration on a spell when you take damage. You can perform the somatic components of spells even when you have weapons or a shield in one or both hands. When a hostile creature's movement provokes an opportunity attack from you, you can use your reaction to cast a spell at the creature instead of making an opportunity attack.",
    prerequisite: "Ability to cast at least one spell",
  },
  {
    name: "Great Weapon Master",
    description:
      "When you score a critical hit with a melee weapon or reduce a creature to 0 HP with a melee weapon, you can make one melee weapon attack as a bonus action. Before you make a melee attack with a heavy weapon, you can choose to take a −5 penalty to the attack roll. If the attack hits, you add +10 to the damage roll.",
  },
  {
    name: "Sharpshooter",
    description:
      "Attacking at long range doesn't impose disadvantage on your ranged weapon attack rolls. Your ranged weapon attacks ignore half cover and three-quarters cover. Before you make a ranged attack with a ranged weapon, you can choose to take a −5 penalty to the attack roll. If the attack hits, you add +10 to the damage roll.",
  },
  {
    name: "Polearm Master",
    description:
      "When you take the Attack action with a glaive, halberd, pike, or quarterstaff, you can use a bonus action to make a melee attack with the opposite end of the weapon (1d4 bludgeoning, uses same ability modifier). While you are wielding one of these weapons, other creatures provoke an opportunity attack from you when they enter your reach.",
  },
  {
    name: "Crossbow Expert",
    description:
      "You ignore the loading quality of crossbows. Being within 5 feet of a hostile creature doesn't impose disadvantage on ranged attack rolls. When you use the Attack action and attack with a one-handed weapon, you can use a bonus action to attack with a hand crossbow you are holding.",
  },
  {
    name: "Shield Master",
    description:
      "If you take the Attack action on your turn, you can use a bonus action to shove a creature with your shield. If you aren't incapacitated, you can add your shield's AC bonus to Dexterity saving throws against spells that target only you. You can use your reaction to halve the damage of a Dex-save-or-halve effect.",
  },
  {
    name: "Tough",
    description:
      "Your hit point maximum increases by an amount equal to twice your level when you gain this feat. Whenever you gain a level thereafter, your hit point maximum increases by an additional 2 HP.",
    improvements: [{ target: "maxHp", amount: 2, perLevel: true }],
  },
  // ── Half-feats (grant +1 to a chosen ability score) ───────────────────────
  {
    name: "Athlete",
    description:
      "+1 to Strength or Dexterity. When prone, standing up costs only 5 feet of movement. Climbing doesn't cost extra movement. Running long jump: add 1 extra foot per point of Str modifier.",
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
  },
  {
    name: "Actor",
    description:
      "+1 to Charisma. You have advantage on Deception and Performance checks when trying to pass yourself off as a different person. You can mimic the speech of another person or the sounds made by other creatures. Passive Insight DC 14 to notice.",
    abilityOptions: ["charisma"],
    abilityIncrease: 1,
  },
  {
    name: "Durable",
    description:
      "+1 to Constitution. When you roll a Hit Die to regain HP, the minimum number of HP you regain equals twice your Constitution modifier (minimum of 2).",
    abilityOptions: ["constitution"],
    abilityIncrease: 1,
  },
  {
    name: "Keen Mind",
    description:
      "+1 to Intelligence. You always know which way is north. You always know the number of hours until sunrise or sunset. You can accurately recall anything you have seen or heard within the past month.",
    abilityOptions: ["intelligence"],
    abilityIncrease: 1,
  },
  {
    name: "Observant",
    description:
      "+1 to Intelligence or Wisdom. If you can see a creature's mouth while it is speaking a language you understand, you can interpret what it's saying by reading lips. +5 bonus to your passive Perception and passive Investigation scores.",
    abilityOptions: ["intelligence", "wisdom"],
    abilityIncrease: 1,
  },
  {
    name: "Resilient",
    description:
      "+1 to the chosen ability. You gain proficiency in saving throws using the chosen ability.",
    abilityOptions: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"],
    abilityIncrease: 1,
  },
  {
    name: "Lightly Armored",
    description:
      "+1 to Strength or Dexterity. You gain proficiency with light armor.",
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
    improvements: [{ target: "armorProficiency", amount: 1, key: "light" }],
  },
  {
    name: "Moderately Armored",
    description:
      "+1 to Strength or Dexterity. You gain proficiency with medium armor and shields.",
    prerequisite: "Proficiency with light armor",
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
    improvements: [
      { target: "armorProficiency", amount: 1, key: "medium" },
      { target: "armorProficiency", amount: 1, key: "shield" },
    ],
  },
  {
    name: "Heavily Armored",
    description:
      "+1 to Strength. You gain proficiency with heavy armor.",
    prerequisite: "Proficiency with medium armor",
    abilityOptions: ["strength"],
    abilityIncrease: 1,
    improvements: [{ target: "armorProficiency", amount: 1, key: "heavy" }],
  },
  {
    name: "Weapon Master",
    description:
      "+1 to Strength or Dexterity. You gain proficiency with four weapons of your choice.",
    abilityOptions: ["strength", "dexterity"],
    abilityIncrease: 1,
    improvements: [
      { target: "weaponProficiency", amount: 1, key: "Longswords" },
      { target: "weaponProficiency", amount: 1, key: "Battleaxes" },
      { target: "weaponProficiency", amount: 1, key: "Warhammers" },
      { target: "weaponProficiency", amount: 1, key: "Greatswords" },
    ],
  },
  {
    name: "Tavern Brawler",
    description:
      "+1 to Strength or Constitution. You are proficient with improvised weapons and your " +
      "unarmed strikes deal 1d4 bludgeoning damage. When you hit a creature with an unarmed " +
      "strike or an improvised weapon on your turn, you can use a bonus action to attempt " +
      "to grapple the target.",
    abilityOptions: ["strength", "constitution"],
    abilityIncrease: 1,
    improvements: [
      { target: "weaponProficiency", amount: 1, key: "Improvised Weapons" },
      { target: "unarmedDamageDie", amount: 4 },
    ],
  },
];

const BACKGROUNDS = [
  { name: "Sage",      skillProficiencies: ["arcana", "history"] },
  { name: "Soldier",   skillProficiencies: ["athletics", "intimidation"] },
  { name: "Charlatan", skillProficiencies: ["deception", "sleightOfHand"],
    toolProficiencies: ["Disguise Kit", "Forgery Kit"] },
  { name: "Acolyte",   skillProficiencies: ["insight", "religion"] },
  // Criminal: Thieves' Tools (fixed) + one gaming set (Dice Set by default).
  { name: "Criminal",  skillProficiencies: ["deception", "stealth"],
    toolProficiencies: ["Thieves' Tools", "Dice Set"] },
  { name: "Folk Hero", skillProficiencies: ["animalHandling", "survival"] },
  { name: "Noble",     skillProficiencies: ["history", "persuasion"] },
];

// A coin purse shorthand for an Item's `cost`/an InventoryItem's `cost` —
// both are the same {cp,sp,gp,pp} shape as Character.currency.
function coins(gp: number, sp = 0, cp = 0) {
  return { cp, sp, gp, pp: 0 };
}

// Matches the Prisma schema's ItemCategory/ArmorCategory enums.
type ItemCategoryName = "weapon" | "armor" | "consumable" | "gear";
type ArmorCategoryName = "light" | "medium" | "heavy" | "shield";

// Mirrors ItemWeaponDetail/ItemArmorDetail/ItemConsumableDetail's own
// fields (minus id/itemId) — these objects are used directly as both an
// Item's nested detail create AND, for catalog-derived inventory rows, the
// InventoryItem's own detail snapshot (see resolveInventoryRow below), so
// there's exactly one place each weapon/armor/consumable's stats are typed
// in. Dice are count/faces/modifier (matching frontend/src/lib/dice.ts's
// RollSpec), not a "1d6" string — see schema.prisma's comment on
// ItemWeaponDetail for why.
interface WeaponDetailInput {
  damageDiceCount: number;
  damageDiceFaces: number;
  damageModifier?: number;
  damageType: string;
  versatileDiceCount?: number;
  versatileDiceFaces?: number;
  finesse?: boolean;
  light?: boolean;
  heavy?: boolean;
  twoHanded?: boolean;
  reach?: boolean;
  thrown?: boolean;
  ammunition?: boolean;
  rangeNormal?: number;
  rangeLong?: number;
  weaponClass?: "simple" | "martial";
  weaponRange?: "melee" | "ranged";
}

interface ArmorDetailInput {
  armorCategory: ArmorCategoryName;
  baseArmorClass: number;
  dexModifierApplies?: boolean;
  dexModifierMax?: number;
  stealthDisadvantage?: boolean;
  strengthRequirement?: number;
}

interface ConsumableDetailInput {
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  effectDescription?: string;
}

interface CatalogItem {
  name: string;
  category: ItemCategoryName;
  weight?: number;
  cost?: ReturnType<typeof coins>;
  description?: string;
  weapon?: WeaponDetailInput;
  armor?: ArmorDetailInput;
  consumable?: ConsumableDetailInput;
}

// Nested-create fields for an Item's optional 1:1 detail relations.
function itemDetailCreateFields(item: CatalogItem) {
  return {
    weaponDetail: item.weapon ? { create: item.weapon } : undefined,
    armorDetail: item.armor ? { create: item.armor } : undefined,
    consumableDetail: item.consumable ? { create: item.consumable } : undefined,
  };
}

// Same, but for the `update` side of an upsert — a true 1:1 optional
// relation can nested-upsert directly, unlike the 1:many class/inventory
// relations elsewhere in this file that have to deleteMany+create instead.
function itemDetailUpsertFields(item: CatalogItem) {
  return {
    weaponDetail: item.weapon
      ? { upsert: { create: item.weapon, update: item.weapon } }
      : undefined,
    armorDetail: item.armor
      ? { upsert: { create: item.armor, update: item.armor } }
      : undefined,
    consumableDetail: item.consumable
      ? { upsert: { create: item.consumable, update: item.consumable } }
      : undefined,
  };
}

// --- Item catalog -------------------------------------------------------
// Baseline equipment list (served via GET /api/items, see
// src/routes/items.ts) covering all four ItemCategory values. Like
// RACES/CLASSES/BACKGROUNDS above, this seeds the catalog rows that
// InventoryItem rows below snapshot from — see schema.prisma's comment on
// Item/InventoryItem for why a snapshot rather than a live reference.
const ITEMS: CatalogItem[] = [
  // ── Simple melee weapons ──────────────────────────────────────────────────
  {
    name: "Club",
    category: "weapon",
    weight: 2,
    cost: coins(0, 1),
    weapon: { damageDiceCount: 1, damageDiceFaces: 4, damageType: "bludgeoning", light: true, weaponClass: "simple", weaponRange: "melee" },
  },
  {
    name: "Dagger",
    category: "weapon",
    weight: 1,
    cost: coins(2),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 4,
      damageType: "piercing",
      finesse: true,
      light: true,
      thrown: true,
      rangeNormal: 20,
      rangeLong: 60,
      weaponClass: "simple",
      weaponRange: "melee",
    },
  },
  {
    name: "Quarterstaff",
    category: "weapon",
    weight: 4,
    cost: coins(0, 2),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 6,
      damageType: "bludgeoning",
      versatileDiceCount: 1,
      versatileDiceFaces: 8,
      weaponClass: "simple",
      weaponRange: "melee",
    },
  },
  {
    name: "Mace",
    category: "weapon",
    weight: 4,
    cost: coins(5),
    weapon: { damageDiceCount: 1, damageDiceFaces: 6, damageType: "bludgeoning", weaponClass: "simple", weaponRange: "melee" },
  },
  {
    name: "Javelin",
    category: "weapon",
    weight: 2,
    cost: coins(0, 5),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 6,
      damageType: "piercing",
      thrown: true,
      rangeNormal: 30,
      rangeLong: 120,
      weaponClass: "simple",
      weaponRange: "melee",
    },
  },
  // ── Simple ranged weapons ─────────────────────────────────────────────────
  {
    name: "Light Crossbow",
    category: "weapon",
    weight: 5,
    cost: coins(25),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageType: "piercing",
      ammunition: true,
      twoHanded: true,
      rangeNormal: 80,
      rangeLong: 320,
      weaponClass: "simple",
      weaponRange: "ranged",
    },
  },
  {
    name: "Shortbow",
    category: "weapon",
    weight: 2,
    cost: coins(25),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 6,
      damageType: "piercing",
      ammunition: true,
      twoHanded: true,
      rangeNormal: 80,
      rangeLong: 320,
      weaponClass: "simple",
      weaponRange: "ranged",
    },
  },
  // ── Martial melee weapons ─────────────────────────────────────────────────
  {
    name: "Shortsword",
    category: "weapon",
    weight: 2,
    cost: coins(10),
    weapon: { damageDiceCount: 1, damageDiceFaces: 6, damageType: "piercing", finesse: true, light: true, weaponClass: "martial", weaponRange: "melee" },
  },
  {
    name: "Longsword",
    category: "weapon",
    weight: 3,
    cost: coins(15),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageType: "slashing",
      versatileDiceCount: 1,
      versatileDiceFaces: 10,
      weaponClass: "martial",
      weaponRange: "melee",
    },
  },
  {
    name: "Rapier",
    category: "weapon",
    weight: 2,
    cost: coins(25),
    weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "piercing", finesse: true, weaponClass: "martial", weaponRange: "melee" },
  },
  {
    name: "Warhammer",
    category: "weapon",
    weight: 2,
    cost: coins(15),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageType: "bludgeoning",
      versatileDiceCount: 1,
      versatileDiceFaces: 10,
      weaponClass: "martial",
      weaponRange: "melee",
    },
  },
  {
    name: "Handaxe",
    category: "weapon",
    weight: 2,
    cost: coins(5),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 6,
      damageType: "slashing",
      light: true,
      thrown: true,
      rangeNormal: 20,
      rangeLong: 60,
      weaponClass: "martial",
      weaponRange: "melee",
    },
  },
  {
    name: "Greataxe",
    category: "weapon",
    weight: 7,
    cost: coins(30),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 12,
      damageType: "slashing",
      heavy: true,
      twoHanded: true,
      weaponClass: "martial",
      weaponRange: "melee",
    },
  },
  // ── Martial ranged weapons ────────────────────────────────────────────────
  {
    name: "Longbow",
    category: "weapon",
    weight: 2,
    cost: coins(50),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageType: "piercing",
      ammunition: true,
      heavy: true,
      twoHanded: true,
      rangeNormal: 150,
      rangeLong: 600,
      weaponClass: "martial",
      weaponRange: "ranged",
    },
  },
  // ── Armor ─────────────────────────────────────────────────────────────────
  {
    name: "Leather Armor",
    category: "armor",
    weight: 10,
    cost: coins(10),
    armor: { armorCategory: "light", baseArmorClass: 11, dexModifierApplies: true },
  },
  {
    name: "Scale Mail",
    category: "armor",
    weight: 45,
    cost: coins(50),
    armor: { armorCategory: "medium", baseArmorClass: 14, dexModifierApplies: true, dexModifierMax: 2, stealthDisadvantage: true },
  },
  {
    name: "Chain Mail",
    category: "armor",
    weight: 55,
    cost: coins(75),
    armor: { armorCategory: "heavy", baseArmorClass: 16, stealthDisadvantage: true, strengthRequirement: 13 },
  },
  {
    name: "Shield",
    category: "armor",
    weight: 6,
    cost: coins(10),
    description: "Worn on one arm; grants +2 AC while wielded.",
    armor: { armorCategory: "shield", baseArmorClass: 2 },
  },
  {
    name: "Plate Armor",
    category: "armor",
    weight: 65,
    cost: coins(1500),
    armor: { armorCategory: "heavy", baseArmorClass: 18, stealthDisadvantage: true, strengthRequirement: 15 },
  },
  // ── Consumables ───────────────────────────────────────────────────────────
  {
    name: "Potion of Healing",
    category: "consumable",
    weight: 0.5,
    cost: coins(50),
    consumable: { effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 2, effectDescription: "Restores hit points" },
  },
  {
    name: "Caltrops",
    category: "consumable",
    weight: 2,
    cost: coins(1),
    description: "Covers a 5-ft square. A creature entering must succeed a DC 15 Dex save or take 1 piercing damage and stop moving for the rest of its turn.",
  },
  // ── Ammunition ───────────────────────────────────────────────────────────
  { name: "Arrows", category: "gear", weight: 0.05, cost: coins(0, 5, 0), description: "A quiver of 20 arrows. Price is per arrow." },
  { name: "Crossbow Bolts", category: "gear", weight: 0.075, cost: coins(0, 5, 0), description: "A case of 20 bolts. Price is per bolt." },
  // ── Spellcasting foci & tools ─────────────────────────────────────────────
  { name: "Spellbook", category: "gear", weight: 3, cost: coins(50) },
  { name: "Component Pouch", category: "gear", weight: 2, cost: coins(25), description: "A small watertight pouch holding what a spellcaster needs to cast spells with material components." },
  { name: "Pearl (arcane focus)", category: "gear", weight: 0.1, cost: coins(100), description: "Used by a spellcaster as an arcane focus in place of components." },
  { name: "Holy Symbol", category: "gear", weight: 1, cost: coins(5), description: "An amulet, reliquary, or other symbol of a deity. Clerics and paladins use this as a spellcasting focus." },
  { name: "Lute", category: "gear", weight: 2, cost: coins(35), description: "A musical instrument; bards use it as a spellcasting focus." },
  { name: "Thieves' Tools", category: "gear", weight: 1, cost: coins(25), description: "Lockpicks, a small file, mirror, scissors, and tweezers." },
  { name: "Ink and Quill", category: "gear", cost: coins(10) },
  { name: "Healer's Kit", category: "gear", weight: 3, cost: coins(5), description: "Has 10 uses. As an action, expend one use to stabilize a creature without a Wisdom (Medicine) check." },
  // ── Equipment packs (also available as single gear items for the shop) ────
  { name: "Dungeoneer's Pack", category: "gear", weight: 61.5, cost: coins(12), description: "Includes a backpack, a crowbar, a hammer, 10 pitons, 10 torches, a tinderbox, 10 days of rations, a waterskin, and 50 ft of hempen rope." },
  { name: "Explorer's Pack", category: "gear", weight: 59, cost: coins(10), description: "Includes a backpack, a bedroll, a mess kit, a tinderbox, 10 torches, 10 days of rations, a waterskin, and 50 ft of hempen rope." },
  { name: "Burglar's Pack", category: "gear", weight: 44.5, cost: coins(16), description: "Includes a backpack, ball bearings (1000), 10 ft of string, a bell, 5 candles, a crowbar, a hammer, 10 pitons, a hooded lantern, 2 flasks of oil, 5 days of rations, a tinderbox, a waterskin, and 50 ft of hempen rope." },
  { name: "Priest's Pack", category: "gear", weight: 24, cost: coins(19), description: "Includes a backpack, a blanket, 10 candles, a tinderbox, an alms box, 2 blocks of incense, a censer, vestments, 2 days of rations, and a waterskin." },
  { name: "Diplomat's Pack", category: "gear", weight: 36, cost: coins(39), description: "Includes a chest, 2 cases for maps and scrolls, a set of fine clothes, a bottle of ink, an ink pen, a lamp, 2 flasks of oil, 5 sheets of paper, a vial of perfume, sealing wax, and soap." },
  { name: "Entertainer's Pack", category: "gear", weight: 38, cost: coins(40), description: "Includes a backpack, a bedroll, 2 costumes, 5 candles, 5 days of rations, a waterskin, and a disguise kit." },
  { name: "Scholar's Pack", category: "gear", weight: 11, cost: coins(40), description: "Includes a backpack, a book of lore, a bottle of ink, an ink pen, 10 sheets of parchment, a little bag of sand, and a small knife." },
  // ── Pack expansion items (individual rows when a pack is chosen) ──────────
  { name: "Backpack", category: "gear", weight: 5, cost: coins(2) },
  { name: "Crowbar", category: "gear", weight: 5, cost: coins(2) },
  { name: "Hammer", category: "gear", weight: 3, cost: coins(1) },
  { name: "Piton", category: "gear", weight: 0.25, cost: coins(0, 5, 0) },
  { name: "Torch", category: "gear", weight: 1, cost: coins(0, 1, 0), description: "Burns for 1 hour; bright light in 20 ft, dim 20 ft beyond. Can be used as an improvised weapon (1 fire damage)." },
  { name: "Tinderbox", category: "gear", weight: 1, cost: coins(0, 5, 0), description: "Used to light fires; takes an action to light a torch or similar." },
  { name: "Rations", category: "gear", weight: 2, cost: coins(0, 5, 0), description: "Dry foods suitable for extended travel." },
  { name: "Waterskin", category: "gear", weight: 5, cost: coins(0, 2, 0), description: "Holds up to 4 pints of liquid. Weight includes 4 pints of water." },
  { name: "Hempen Rope (50 ft)", category: "gear", weight: 10, cost: coins(1) },
  { name: "Bedroll", category: "gear", weight: 7, cost: coins(1) },
  { name: "Mess Kit", category: "gear", weight: 1, cost: coins(0, 2, 0), description: "Tin box with a cup and simple cutlery." },
  { name: "Ball Bearings", category: "gear", weight: 2, cost: coins(1), description: "As an action, scatter up to 1000 ball bearings (included) from a pouch across a 10-ft square. Creatures moving through must succeed DC 10 Dex or fall prone." },
  { name: "String (10 ft)", category: "gear", cost: coins(0, 0, 1) },
  { name: "Bell", category: "gear", weight: 0.1, cost: coins(1) },
  { name: "Candle", category: "gear", weight: 0.01, cost: coins(0, 0, 1), description: "Dim light in 5 ft for 1 hour." },
  { name: "Hooded Lantern", category: "gear", weight: 2, cost: coins(5), description: "Bright light in 30 ft and dim light for 30 ft beyond, or dim light in a 5-ft cone (hood closed). Burns for 6 hours per flask of oil." },
  { name: "Oil Flask", category: "consumable", weight: 1, cost: coins(0, 1, 0), description: "Fuels a lantern for 6 hours. Can be splashed on a surface or creature (DC 10 Dex, sets alight for 1d4 fire per round)." },
  { name: "Blanket", category: "gear", weight: 3, cost: coins(0, 5, 0) },
  { name: "Alms Box", category: "gear", weight: 1, cost: coins(0, 5, 0) },
  { name: "Incense Block", category: "gear", weight: 0.1, cost: coins(0, 2, 0) },
  { name: "Censer", category: "gear", weight: 2, cost: coins(5) },
  { name: "Vestments", category: "gear", weight: 4, cost: coins(5) },
  { name: "Chest", category: "gear", weight: 25, cost: coins(5), description: "Holds 300 lb / 12 cubic feet." },
  { name: "Map Case", category: "gear", weight: 1, cost: coins(1), description: "Scroll or map case; holds 10 rolled documents." },
  { name: "Fine Clothes", category: "gear", weight: 6, cost: coins(15) },
  { name: "Lamp", category: "gear", weight: 1, cost: coins(0, 5, 0), description: "Bright light in 15 ft, dim light 30 ft beyond. Burns for 6 hours per flask of oil." },
  { name: "Paper Sheet", category: "gear", weight: 0, cost: coins(0, 2, 0) },
  { name: "Perfume Vial", category: "gear", weight: 0, cost: coins(5) },
  { name: "Sealing Wax", category: "gear", weight: 0, cost: coins(0, 5, 0) },
  { name: "Soap", category: "gear", weight: 0, cost: coins(0, 0, 2) },
  { name: "Costume Clothes", category: "gear", weight: 4, cost: coins(5) },
  { name: "Disguise Kit", category: "gear", weight: 3, cost: coins(25), description: "Cosmetics, hair dye, small props, and a few costumes for creating disguises." },
  { name: "Book of Lore", category: "gear", weight: 5, cost: coins(25), description: "A book containing knowledge in a particular field." },
  { name: "Parchment Sheet", category: "gear", weight: 0, cost: coins(0, 1, 0) },
  { name: "Knife", category: "gear", weight: 0.5, cost: coins(0, 2, 0) },
  // ── New items for missing PHB classes ─────────────────────────────────────
  {
    name: "Scimitar",
    category: "weapon",
    weight: 3,
    cost: coins(25),
    weapon: { damageDiceCount: 1, damageDiceFaces: 6, damageType: "slashing", finesse: true, light: true, weaponClass: "martial", weaponRange: "melee" },
  },
  {
    name: "Dart",
    category: "weapon",
    weight: 0.25,
    cost: coins(0, 0, 5),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 4,
      damageType: "piercing",
      finesse: true,
      thrown: true,
      rangeNormal: 20,
      rangeLong: 60,
      weaponClass: "simple",
      weaponRange: "ranged",
    },
  },
  {
    name: "Druidic Focus",
    category: "gear",
    weight: 0,
    cost: coins(1),
    description: "A sprig of mistletoe, a totem, a staff, or a wooden rod used by druids as a spellcasting focus in place of material components.",
  },
];

// ── Equipment packs ───────────────────────────────────────────────────────────
// Each pack matches a catalog Item by name (e.g. "Scholar's Pack") and lists
// the individual items it expands into at character creation. Seeded from the
// 5e Basic Rules; custom packs can be added without a code deploy.
interface PackContentSeed {
  itemName: string;
  quantity?: number;
}
interface PackSeed {
  name: string;
  description?: string;
  contents: PackContentSeed[];
}

const PACKS: PackSeed[] = [
  {
    name: "Dungeoneer's Pack",
    description: "Includes a backpack, crowbar, hammer, 10 pitons, 10 torches, a tinderbox, 10 days of rations, a waterskin, and 50 feet of hempen rope.",
    contents: [
      { itemName: "Backpack" },
      { itemName: "Crowbar" },
      { itemName: "Hammer" },
      { itemName: "Piton", quantity: 10 },
      { itemName: "Torch", quantity: 10 },
      { itemName: "Tinderbox" },
      { itemName: "Rations", quantity: 10 },
      { itemName: "Waterskin" },
      { itemName: "Hempen Rope (50 ft)" },
    ],
  },
  {
    name: "Explorer's Pack",
    description: "Includes a backpack, a bedroll, a mess kit, a tinderbox, 10 torches, 10 days of rations, a waterskin, and 50 feet of hempen rope.",
    contents: [
      { itemName: "Backpack" },
      { itemName: "Bedroll" },
      { itemName: "Mess Kit" },
      { itemName: "Tinderbox" },
      { itemName: "Torch", quantity: 10 },
      { itemName: "Rations", quantity: 10 },
      { itemName: "Waterskin" },
      { itemName: "Hempen Rope (50 ft)" },
    ],
  },
  {
    name: "Burglar's Pack",
    description: "Includes a backpack, a bag of 1000 ball bearings, 10 feet of string, a bell, 5 candles, a crowbar, a hammer, 10 pitons, a hooded lantern, 2 flasks of oil, 5 days of rations, a tinderbox, a waterskin, and 50 feet of hempen rope.",
    contents: [
      { itemName: "Backpack" },
      { itemName: "Ball Bearings" },
      { itemName: "String (10 ft)" },
      { itemName: "Bell" },
      { itemName: "Candle", quantity: 5 },
      { itemName: "Crowbar" },
      { itemName: "Hammer" },
      { itemName: "Piton", quantity: 10 },
      { itemName: "Hooded Lantern" },
      { itemName: "Oil Flask", quantity: 2 },
      { itemName: "Rations", quantity: 5 },
      { itemName: "Tinderbox" },
      { itemName: "Waterskin" },
      { itemName: "Hempen Rope (50 ft)" },
    ],
  },
  {
    name: "Priest's Pack",
    description: "Includes a backpack, a blanket, 10 candles, a tinderbox, an alms box, 2 blocks of incense, a censer, vestments, 2 days of rations, and a waterskin.",
    contents: [
      { itemName: "Backpack" },
      { itemName: "Blanket" },
      { itemName: "Candle", quantity: 10 },
      { itemName: "Tinderbox" },
      { itemName: "Alms Box" },
      { itemName: "Incense Block", quantity: 2 },
      { itemName: "Censer" },
      { itemName: "Vestments" },
      { itemName: "Rations", quantity: 2 },
      { itemName: "Waterskin" },
    ],
  },
  {
    name: "Diplomat's Pack",
    description: "Includes a chest, 2 map or scroll cases, fine clothes, a bottle of ink, an ink pen, a lamp, 2 flasks of oil, 5 sheets of paper, a vial of perfume, sealing wax, and soap.",
    contents: [
      { itemName: "Chest" },
      { itemName: "Map Case", quantity: 2 },
      { itemName: "Fine Clothes" },
      { itemName: "Ink and Quill" },
      { itemName: "Lamp" },
      { itemName: "Oil Flask", quantity: 2 },
      { itemName: "Paper Sheet", quantity: 5 },
      { itemName: "Perfume Vial" },
      { itemName: "Sealing Wax" },
      { itemName: "Soap" },
    ],
  },
  {
    name: "Entertainer's Pack",
    description: "Includes a backpack, a bedroll, 2 costumes, 5 candles, 5 days of rations, a waterskin, and a disguise kit.",
    contents: [
      { itemName: "Backpack" },
      { itemName: "Bedroll" },
      { itemName: "Costume Clothes", quantity: 2 },
      { itemName: "Candle", quantity: 5 },
      { itemName: "Rations", quantity: 5 },
      { itemName: "Waterskin" },
      { itemName: "Disguise Kit" },
    ],
  },
  {
    name: "Scholar's Pack",
    description: "Includes a backpack, a book of lore, a bottle of ink, an ink pen, 10 sheets of parchment, a little bag of sand, and a small knife.",
    contents: [
      { itemName: "Backpack" },
      { itemName: "Book of Lore" },
      { itemName: "Ink and Quill" },
      { itemName: "Parchment Sheet", quantity: 10 },
      { itemName: "Tinderbox" },
      { itemName: "Knife" },
    ],
  },
];

// ── Spell catalog ─────────────────────────────────────────────────────────────
// A curated SRD subset (cantrips–L3) seeded for the spell-catalog picker and
// auto-rolling feature. Structured effect fields (effectKind/effectDiceCount
// etc.) mirror ItemWeaponDetail / ItemConsumableDetail so the frontend can roll
// damage/healing at cast time using the same dice.ts engine.
type SpellSchoolSeed =
  | "abjuration" | "conjuration" | "divination" | "enchantment"
  | "evocation" | "illusion" | "necromancy" | "transmutation";

interface CatalogSpell {
  name: string;
  level: number;
  school: SpellSchoolSeed;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration?: boolean;
  ritual?: boolean;
  classes: string[];          // lowercase class names
  effectKind?: "damage" | "heal";
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;    // flat bonus (e.g. +3 in "3d4+3" for Magic Missile)
  damageType?: string;
  attackType?: "attack" | "save";
  saveAbility?: string;
  upcastDicePerLevel?: number;
  cantripScaling?: boolean;
}

const SPELLS: CatalogSpell[] = [
  // ── Cantrips ──────────────────────────────────────────────────────────────
  {
    name: "Fire Bolt",
    level: 0,
    school: "evocation",
    castingTime: "1 action",
    range: "120 ft",
    duration: "Instantaneous",
    description: "A mote of fire streaks toward a creature. Make a ranged spell attack. On a hit, deal 1d10 fire damage (scales to 2d10 at level 5, 3d10 at level 11, 4d10 at level 17).",
    classes: ["wizard", "sorcerer"],
    effectKind: "damage",
    effectDiceCount: 1,
    effectDiceFaces: 10,
    damageType: "fire",
    attackType: "attack",
    cantripScaling: true,
  },
  {
    name: "Sacred Flame",
    level: 0,
    school: "evocation",
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "Flame-like radiance descends on a creature. It must succeed on a Dexterity saving throw or take 1d8 radiant damage (scales to 2d8 at level 5, 3d8 at 11, 4d8 at 17). No cover bonus.",
    classes: ["cleric"],
    effectKind: "damage",
    effectDiceCount: 1,
    effectDiceFaces: 8,
    damageType: "radiant",
    attackType: "save",
    saveAbility: "dexterity",
    cantripScaling: true,
  },
  {
    name: "Vicious Mockery",
    level: 0,
    school: "enchantment",
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "Unleash a string of insults laden with magic. The target must succeed on a Wisdom save or take 1d4 psychic damage and have disadvantage on its next attack roll (scales to 2d4 at level 5, 3d4 at 11, 4d4 at 17).",
    classes: ["bard"],
    effectKind: "damage",
    effectDiceCount: 1,
    effectDiceFaces: 4,
    damageType: "psychic",
    attackType: "save",
    saveAbility: "wisdom",
    cantripScaling: true,
  },
  {
    name: "Toll the Dead",
    level: 0,
    school: "necromancy",
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "Point at a creature and the sound of a dolorous bell fills the air. It must succeed on a Constitution save or take 1d8 necrotic damage (1d12 if it's missing HP). Scales at level 5/11/17.",
    classes: ["cleric", "wizard"],
    effectKind: "damage",
    effectDiceCount: 1,
    effectDiceFaces: 8,
    damageType: "necrotic",
    attackType: "save",
    saveAbility: "constitution",
    cantripScaling: true,
  },
  {
    name: "Mage Hand",
    level: 0,
    school: "conjuration",
    castingTime: "1 action",
    range: "30 ft",
    duration: "1 minute",
    description: "A spectral, floating hand appears at a point you choose within range. It can manipulate objects, open doors, or stow items, but can't attack or carry more than 10 pounds.",
    classes: ["wizard", "sorcerer", "bard"],
  },
  {
    name: "Prestidigitation",
    level: 0,
    school: "transmutation",
    castingTime: "1 action",
    range: "10 ft",
    duration: "Up to 1 hour",
    description: "Magical tricks: create a small sensory effect, light or snuff a flame, clean or soil an object, warm or chill food, create a mark, produce a trinket-like item, or activate/cancel a past prestidigitation effect.",
    classes: ["wizard", "sorcerer", "bard"],
  },
  {
    name: "Light",
    level: 0,
    school: "evocation",
    castingTime: "1 action",
    range: "Touch",
    duration: "1 hour",
    description: "Touch one object no larger than 10 feet in any dimension. Until the spell ends, it emits bright light in a 20-foot radius and dim light for an additional 20 feet.",
    classes: ["cleric", "bard", "wizard", "sorcerer"],
  },
  // ── Level 1 ───────────────────────────────────────────────────────────────
  {
    name: "Magic Missile",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "120 ft",
    duration: "Instantaneous",
    description: "Three glowing darts of magical force hit automatically (1d4+1 each = 3d4+3 total). At higher levels: +1 dart per slot level above 1st.",
    classes: ["wizard", "sorcerer"],
    effectKind: "damage",
    effectDiceCount: 3,
    effectDiceFaces: 4,
    effectModifier: 3,
    damageType: "force",
    upcastDicePerLevel: 1,   // +1 dart (1d4+1) per level; effectModifier also increases by 1
  },
  {
    name: "Cure Wounds",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "Touch",
    duration: "Instantaneous",
    description: "Touch a living creature and restore 1d8 + spellcasting modifier HP. At higher levels: +1d8 per slot level above 1st.",
    classes: ["cleric", "bard", "druid"],
    effectKind: "heal",
    effectDiceCount: 1,
    effectDiceFaces: 8,
    upcastDicePerLevel: 1,
  },
  {
    name: "Healing Word",
    level: 1,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "Call out words of restoration to restore 1d4 + spellcasting modifier HP to a visible creature within range. At higher levels: +1d4 per slot level above 1st.",
    classes: ["cleric", "bard", "druid"],
    effectKind: "heal",
    effectDiceCount: 1,
    effectDiceFaces: 4,
    upcastDicePerLevel: 1,
  },
  {
    name: "Mage Armor",
    level: 1,
    school: "abjuration",
    castingTime: "1 action",
    range: "Touch",
    duration: "8 hours",
    description: "Touch a willing creature not wearing armor. Until the spell ends, the target's base AC becomes 13 + its Dexterity modifier. The spell ends if the target dons armor.",
    classes: ["wizard", "sorcerer"],
  },
  {
    name: "Shield",
    level: 1,
    school: "abjuration",
    castingTime: "1 reaction",
    range: "Self",
    duration: "1 round",
    description: "Reaction to an attack hitting you: +5 AC until the start of your next turn (potentially turning the hit into a miss), plus immunity to Magic Missile.",
    classes: ["wizard", "sorcerer"],
  },
  {
    name: "Thunderwave",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "Self (15-ft cube)",
    duration: "Instantaneous",
    description: "A wave of thunderous force sweeps out. Each creature in a 15-ft cube must succeed on a Constitution save or take 2d8 thunder damage and be pushed 10 feet. At higher levels: +1d8 per slot level above 1st.",
    classes: ["wizard", "druid", "bard", "sorcerer", "cleric"],
    effectKind: "damage",
    effectDiceCount: 2,
    effectDiceFaces: 8,
    damageType: "thunder",
    attackType: "save",
    saveAbility: "constitution",
    upcastDicePerLevel: 1,
  },
  {
    name: "Detect Magic",
    level: 1,
    school: "divination",
    castingTime: "1 action",
    range: "Self",
    duration: "Concentration, up to 10 minutes",
    description: "Sense the presence of magic within 30 feet. You can use your action to see a faint aura around visible magical creatures or objects and learn its school of magic, if any.",
    classes: ["wizard", "cleric", "druid", "bard"],
    concentration: true,
    ritual: true,
  },
  // ── Level 2 ───────────────────────────────────────────────────────────────
  {
    name: "Scorching Ray",
    level: 2,
    school: "evocation",
    castingTime: "1 action",
    range: "120 ft",
    duration: "Instantaneous",
    description: "Create three rays of fire; make a separate ranged spell attack for each. On a hit, each ray deals 2d6 fire damage (total 6d6 if all hit). At higher levels: +1 ray per slot level above 2nd.",
    classes: ["wizard", "sorcerer"],
    effectKind: "damage",
    effectDiceCount: 6,
    effectDiceFaces: 6,
    damageType: "fire",
    attackType: "attack",
    upcastDicePerLevel: 2,   // +1 ray (+2d6) per slot level above 2nd
  },
  {
    name: "Misty Step",
    level: 2,
    school: "conjuration",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Instantaneous",
    description: "Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space you can see.",
    classes: ["wizard", "sorcerer", "bard"],
  },
  {
    name: "Shatter",
    level: 2,
    school: "evocation",
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "A sudden loud ringing noise causes creatures and objects in a 10-ft-radius sphere to take 3d8 thunder damage on a failed Constitution save, half on a success. Inorganic material has disadvantage. At higher levels: +1d8 per slot above 2nd.",
    classes: ["bard", "sorcerer", "wizard", "cleric"],
    effectKind: "damage",
    effectDiceCount: 3,
    effectDiceFaces: 8,
    damageType: "thunder",
    attackType: "save",
    saveAbility: "constitution",
    upcastDicePerLevel: 1,
  },
  {
    name: "Hold Person",
    level: 2,
    school: "enchantment",
    castingTime: "1 action",
    range: "60 ft",
    duration: "Concentration, up to 1 minute",
    description: "Choose a humanoid within range. It must succeed on a Wisdom saving throw or be paralyzed for the duration. At the end of each of its turns, it can repeat the save.",
    classes: ["bard", "cleric", "druid", "wizard"],
    concentration: true,
    attackType: "save",
    saveAbility: "wisdom",
  },
  // ── Level 3 ───────────────────────────────────────────────────────────────
  {
    name: "Fireball",
    level: 3,
    school: "evocation",
    castingTime: "1 action",
    range: "150 ft",
    duration: "Instantaneous",
    description: "A bright streak flashes to a point you choose, then blossoms into an explosion. Each creature in a 20-ft-radius sphere must make a Dexterity save. On failure, 8d6 fire damage; half on success. At higher levels: +1d6 per slot level above 3rd.",
    classes: ["wizard", "sorcerer"],
    effectKind: "damage",
    effectDiceCount: 8,
    effectDiceFaces: 6,
    damageType: "fire",
    attackType: "save",
    saveAbility: "dexterity",
    upcastDicePerLevel: 1,
  },
  {
    name: "Lightning Bolt",
    level: 3,
    school: "evocation",
    castingTime: "1 action",
    range: "Self (100-ft line)",
    duration: "Instantaneous",
    description: "A stroke of lightning blasts out in a 100-ft line. Each creature in the line makes a Dexterity save. On failure, 8d6 lightning damage; half on success. At higher levels: +1d6 per slot level above 3rd.",
    classes: ["wizard", "sorcerer"],
    effectKind: "damage",
    effectDiceCount: 8,
    effectDiceFaces: 6,
    damageType: "lightning",
    attackType: "save",
    saveAbility: "dexterity",
    upcastDicePerLevel: 1,
  },
  {
    name: "Counterspell",
    level: 3,
    school: "abjuration",
    castingTime: "1 reaction",
    range: "60 ft",
    duration: "Instantaneous",
    description: "Attempt to interrupt a creature in the process of casting a spell. If the spell is 3rd level or lower, it fails automatically. If it's 4th level or higher, make an ability check (DC = 10 + spell's level).",
    classes: ["wizard", "sorcerer", "bard", "cleric"],
  },
  {
    name: "Mass Healing Word",
    level: 3,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "As you call out words of restoration, up to six creatures you choose within range each regain 1d4 + spellcasting modifier HP. At higher levels: +1d4 per slot level above 3rd.",
    classes: ["cleric", "bard"],
    effectKind: "heal",
    effectDiceCount: 1,
    effectDiceFaces: 4,
    upcastDicePerLevel: 1,
  },
];

// Per-character inventory row, specified as shorthand below and resolved
// against the catalog in main(): `catalogName` pulls the row's stats from
// the matching Item (the common, "don't hand-author your inventory" case),
// while an explicit `category` makes the row fully homebrew (itemId stays
// null) — e.g. a unique magic item with no baseline catalog entry. Either
// way `quantity`/`equipped`/`notes` are this row's own values, and a
// catalog row's fields can still be overridden (e.g. a `name` override for
// "Club +1") since InventoryItem only snapshots from the catalog, it
// doesn't keep reading it live.
type SeedInventoryRow =
  | { catalogName: string; name?: string; quantity?: number; equipped?: boolean; notes?: string }
  | (CatalogItem & { quantity?: number; equipped?: boolean; notes?: string });

// Equivalent of frontend/src/mock/characters.ts's three fixtures, ported
// here deliberately — backend and frontend are separate packages with no
// shared workspace, and this is fixture/seed data, not shared business
// logic. experiencePoints is chosen as each character's target level's
// exact lower threshold (level 5 -> 6500, level 6 -> 14000, level 7 ->
// 23000) so the seeded levels match what the frontend mock currently
// hardcodes.
//
// race/class/subclass/background here are seed-only identifiers used below
// to look up catalog rows and build each character's nested selections —
// they are not Character columns (see schema.prisma).
const SEED_CHARACTERS = [
  {
    id: "1",
    name: "Brielle Stormwind",
    race: "Half-Elf",
    class: "Wizard",
    subclass: "School of Evocation",
    background: "Sage",
    alignment: "Neutral Good",
    experiencePoints: 23000,

    armorClass: 13,
    initiativeBonus: 2,
    speed: 30,

    hitPoints: { current: 38, max: 46, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 7, die: "d6", spent: 0 },

    abilityScores: {
      strength: 8,
      dexterity: 14,
      constitution: 13,
      intelligence: 18,
      wisdom: 12,
      charisma: 10,
    },
    savingThrowProficiencies: ["intelligence", "wisdom"],
    skills: [
      { name: "arcana", ability: "intelligence", proficient: true, expertise: true },
      { name: "history", ability: "intelligence", proficient: true },
      { name: "investigation", ability: "intelligence", proficient: true },
      { name: "insight", ability: "wisdom", proficient: true },
      { name: "perception", ability: "wisdom", proficient: false },
      { name: "acrobatics", ability: "dexterity", proficient: false },
      { name: "animalHandling", ability: "wisdom", proficient: false },
      { name: "athletics", ability: "strength", proficient: false },
      { name: "deception", ability: "charisma", proficient: false },
      { name: "intimidation", ability: "charisma", proficient: false },
      { name: "medicine", ability: "wisdom", proficient: false },
      { name: "nature", ability: "intelligence", proficient: false },
      { name: "performance", ability: "charisma", proficient: false },
      { name: "persuasion", ability: "charisma", proficient: true },
      { name: "religion", ability: "intelligence", proficient: false },
      { name: "sleightOfHand", ability: "dexterity", proficient: false },
      { name: "stealth", ability: "dexterity", proficient: false },
      { name: "survival", ability: "wisdom", proficient: false },
    ],

    inventory: [
      { catalogName: "Quarterstaff", quantity: 1, equipped: true },
      { catalogName: "Spellbook", quantity: 1 },
      { catalogName: "Component Pouch", quantity: 1, equipped: true },
      {
        name: "Ring of Protection",
        category: "gear",
        quantity: 1,
        equipped: true,
        description: "+1 bonus to AC and saving throws.",
      },
      { catalogName: "Potion of Healing", quantity: 3 },
      { catalogName: "Scholar's Pack", quantity: 1 },
      { catalogName: "Ink and Quill", quantity: 1 },
      { catalogName: "Pearl (arcane focus)", quantity: 1 },
    ] satisfies SeedInventoryRow[],
    currency: { cp: 12, sp: 30, gp: 145, pp: 2 },

    // New compact format: only mutable state (slotsUsed + spells) is stored.
    // Slot totals, spellSaveDC, spellAttackBonus, and ability are derived at
    // read time from class/level/abilityScores in serializeCharacter.
    spellcasting: {
      slotsUsed: { "1": 1, "3": 2 },
      spells: [
        {
          id: "s1",
          name: "Fire Bolt",
          level: 0,
          school: "evocation",
          prepared: true,
          castingTime: "1 action",
          range: "120 ft",
          duration: "Instantaneous",
          description: "A mote of fire streaks toward a creature. Make a ranged spell attack. On a hit, deal 1d10 fire damage (scales to 2d10 at level 5, 3d10 at level 11, 4d10 at level 17).",
          effectKind: "damage",
          effectDiceCount: 1,
          effectDiceFaces: 10,
          damageType: "fire",
          attackType: "attack",
          cantripScaling: true,
        },
        {
          id: "s2",
          name: "Mage Armor",
          level: 1,
          school: "abjuration",
          prepared: true,
          castingTime: "1 action",
          range: "Touch",
          duration: "8 hours",
          description: "Touch a willing creature not wearing armor. Until the spell ends, the target's base AC becomes 13 + its Dexterity modifier.",
        },
        {
          id: "s3",
          name: "Misty Step",
          level: 2,
          school: "conjuration",
          prepared: true,
          castingTime: "1 bonus action",
          range: "Self",
          duration: "Instantaneous",
          description: "Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space you can see.",
        },
        {
          id: "s4",
          name: "Fireball",
          level: 3,
          school: "evocation",
          prepared: true,
          castingTime: "1 action",
          range: "150 ft",
          duration: "Instantaneous",
          description: "A bright streak flashes to a point you choose, then blossoms into an explosion. Each creature in a 20-ft-radius sphere must make a Dexterity save. On failure, 8d6 fire damage; half on success.",
          effectKind: "damage",
          effectDiceCount: 8,
          effectDiceFaces: 6,
          damageType: "fire",
          attackType: "save",
          saveAbility: "dexterity",
          upcastDicePerLevel: 1,
        },
        {
          id: "s5",
          name: "Counterspell",
          level: 3,
          school: "abjuration",
          prepared: false,
          castingTime: "1 reaction",
          range: "60 ft",
          duration: "Instantaneous",
          description: "Attempt to interrupt a creature in the process of casting a spell. If 3rd level or lower, it fails automatically. If higher, make an ability check (DC = 10 + spell's level).",
        },
        {
          id: "s6",
          name: "Polymorph",
          level: 4,
          school: "transmutation",
          prepared: false,
          castingTime: "1 action",
          range: "60 ft",
          duration: "Concentration, up to 1 hour",
          description: "Transform a creature into a beast (you choose its form) with CR equal to or less than the target's CR (or level). The target's stats and capabilities are replaced by the beast's.",
          concentration: true,
        },
      ],
    },

    journal: [
      {
        id: "j1",
        title: "The Sunken Library",
        date: "Hammer 12",
        body: "Recovered three waterlogged tomes from the flooded archive beneath Saltmere. One appears to be a treatise on tidal magic — worth deciphering once we're back at the Conclave.",
      },
      {
        id: "j2",
        title: "A Debt Repaid",
        date: "Alturiak 3",
        body: "Helped the Hollowmere militia drive off a band of raiders. Their captain owes us a favor — could be useful when we pass through again.",
      },
    ],
  },
  {
    id: "2",
    name: "Tordek Ironfist",
    race: "Mountain Dwarf",
    class: "Fighter",
    subclass: "Battle Master",
    background: "Soldier",
    alignment: "Lawful Good",
    experiencePoints: 6500,

    armorClass: 18,
    initiativeBonus: 0,
    speed: 25,

    hitPoints: { current: 44, max: 51, temp: 5, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 5, die: "d10", spent: 0 },

    abilityScores: {
      strength: 17,
      dexterity: 10,
      constitution: 16,
      intelligence: 9,
      wisdom: 13,
      charisma: 8,
    },
    savingThrowProficiencies: ["strength", "constitution"],
    skills: [
      { name: "athletics", ability: "strength", proficient: true },
      { name: "intimidation", ability: "charisma", proficient: true },
      { name: "perception", ability: "wisdom", proficient: true },
      { name: "survival", ability: "wisdom", proficient: true },
      { name: "acrobatics", ability: "dexterity", proficient: false },
      { name: "animalHandling", ability: "wisdom", proficient: false },
      { name: "arcana", ability: "intelligence", proficient: false },
      { name: "deception", ability: "charisma", proficient: false },
      { name: "history", ability: "intelligence", proficient: false },
      { name: "insight", ability: "wisdom", proficient: false },
      { name: "investigation", ability: "intelligence", proficient: false },
      { name: "medicine", ability: "wisdom", proficient: false },
      { name: "nature", ability: "intelligence", proficient: false },
      { name: "performance", ability: "charisma", proficient: false },
      { name: "persuasion", ability: "charisma", proficient: false },
      { name: "religion", ability: "intelligence", proficient: false },
      { name: "sleightOfHand", ability: "dexterity", proficient: false },
      { name: "stealth", ability: "dexterity", proficient: false },
    ],

    inventory: [
      {
        catalogName: "Warhammer",
        quantity: 1,
        equipped: true,
        notes: "Family heirloom, passed down for three generations.",
      },
      { catalogName: "Shield", quantity: 1, equipped: true },
      { catalogName: "Plate Armor", quantity: 1, equipped: true },
      { catalogName: "Handaxe", quantity: 2 },
      { catalogName: "Healer's Kit", quantity: 1 },
    ] satisfies SeedInventoryRow[],
    currency: { cp: 0, sp: 15, gp: 62, pp: 0 },

    spellcasting: null,
    journal: [],
  },
  {
    id: "3",
    name: "Lyra Nightsong",
    race: "Wood Elf",
    class: "Rogue",
    subclass: "Arcane Trickster",
    background: "Charlatan",
    alignment: "Chaotic Neutral",
    experiencePoints: 14000,

    armorClass: 15,
    initiativeBonus: 4,
    speed: 35,

    hitPoints: { current: 28, max: 39, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 6, die: "d8", spent: 0 },

    abilityScores: {
      strength: 10,
      dexterity: 18,
      constitution: 12,
      intelligence: 14,
      wisdom: 11,
      charisma: 13,
    },
    savingThrowProficiencies: ["dexterity", "intelligence"],
    skills: [
      { name: "stealth", ability: "dexterity", proficient: true, expertise: true },
      { name: "sleightOfHand", ability: "dexterity", proficient: true },
      { name: "deception", ability: "charisma", proficient: true },
      { name: "investigation", ability: "intelligence", proficient: true },
      { name: "perception", ability: "wisdom", proficient: true },
      { name: "acrobatics", ability: "dexterity", proficient: false },
      { name: "animalHandling", ability: "wisdom", proficient: false },
      { name: "arcana", ability: "intelligence", proficient: false },
      { name: "athletics", ability: "strength", proficient: false },
      { name: "history", ability: "intelligence", proficient: false },
      { name: "insight", ability: "wisdom", proficient: false },
      { name: "intimidation", ability: "charisma", proficient: false },
      { name: "medicine", ability: "wisdom", proficient: false },
      { name: "nature", ability: "intelligence", proficient: false },
      { name: "performance", ability: "charisma", proficient: false },
      { name: "persuasion", ability: "charisma", proficient: false },
      { name: "religion", ability: "intelligence", proficient: false },
      { name: "survival", ability: "wisdom", proficient: false },
    ],

    inventory: [
      { catalogName: "Shortsword", quantity: 2, equipped: true },
      { catalogName: "Shortbow", quantity: 1, equipped: true },
      { catalogName: "Thieves' Tools", quantity: 1 },
      {
        name: "Cloak of Elvenkind",
        category: "gear",
        quantity: 1,
        equipped: true,
        description:
          "Advantage on Stealth checks; creatures have disadvantage on checks to spot you.",
      },
    ] satisfies SeedInventoryRow[],
    currency: { cp: 40, sp: 8, gp: 210, pp: 1 },

    // Compact mutable-only format — slots/saveDC/attackBonus are now derived
    // at read time via deriveSpellcasting (subclass "Arcane Trickster" triggers
    // the third-caster progression). Level 6 → 1 level-1 slot used.
    spellcasting: {
      slotsUsed: { "1": 1 },
      spells: [
        {
          id: "s1",
          name: "Mage Hand",
          level: 0,
          school: "conjuration",
          prepared: true,
          castingTime: "1 action",
          range: "30 ft",
          duration: "1 minute",
          description: "A spectral hand manipulates objects at range.",
        },
        {
          id: "s2",
          name: "Disguise Self",
          level: 1,
          school: "illusion",
          prepared: true,
          castingTime: "1 action",
          range: "Self",
          duration: "1 hour",
          description: "Change your appearance until the spell ends.",
        },
      ],
    },

    journal: [],
  },
];

// Resolves one SeedInventoryRow into an InventoryItem create payload —
// either a snapshot of a catalog Item (`catalogName` branch) or a fully
// homebrew row (itemId: null). See the SeedInventoryRow comment above. The
// detail sub-object (if any) is reused directly from the same CatalogItem
// literal the Item catalog itself was seeded from — at seed time the
// inventory row's detail is identical to the catalog's, no override applied.
function resolveInventoryRow(
  row: SeedInventoryRow,
  position: number,
  catalogByName: Map<string, CatalogItem>,
  itemIdsByName: Map<string, string>
) {
  if ("catalogName" in row) {
    const catalogItem = catalogByName.get(row.catalogName);
    const itemId = itemIdsByName.get(row.catalogName);
    if (!catalogItem || !itemId) {
      throw new Error(`Unknown seed catalogName: ${row.catalogName}`);
    }
    return {
      itemId,
      name: row.name ?? catalogItem.name,
      category: catalogItem.category,
      weight: catalogItem.weight,
      cost: catalogItem.cost,
      description: catalogItem.description,
      quantity: row.quantity ?? 1,
      equipped: row.equipped ?? false,
      notes: row.notes,
      position,
      ...itemDetailCreateFields(catalogItem),
    };
  }

  return {
    itemId: null,
    name: row.name,
    category: row.category,
    weight: row.weight,
    cost: row.cost,
    description: row.description,
    quantity: row.quantity ?? 1,
    equipped: row.equipped ?? false,
    notes: row.notes,
    position,
    ...itemDetailCreateFields(row),
  };
}

async function main() {
  const raceIds = new Map<string, string>();
  for (const race of RACES) {
    const row = await prisma.race.upsert({ where: { name: race.name }, create: race, update: race });
    raceIds.set(row.name, row.id);
  }

  const classIds = new Map<string, string>();
  for (const cls of CLASSES) {
    const row = await prisma.characterClass.upsert({ where: { name: cls.name }, create: cls, update: cls });
    classIds.set(row.name, row.id);
  }

  // Seed subclasses — upsert by (classId, name) unique constraint.
  // Build a map keyed by "<ClassName>/<SubclassName>" for the SEED_CHARACTERS loop.
  const subclassIdsByClassAndName = new Map<string, string>();
  for (const sub of SUBCLASSES) {
    const classId = classIds.get(sub.className);
    if (!classId) throw new Error(`Seed error: unknown class "${sub.className}" in SUBCLASSES`);
    const row = await prisma.subclass.upsert({
      where: { classId_name: { classId, name: sub.name } },
      create: { classId, name: sub.name, description: sub.description },
      update: { description: sub.description },
    });
    subclassIdsByClassAndName.set(`${sub.className}/${sub.name}`, row.id);
  }

  // Seed action catalog — upsert by unique key.
  for (const action of ACTIONS) {
    await prisma.action.upsert({
      where: { key: action.key },
      create: {
        key: action.key,
        name: action.name,
        description: action.description,
        cost: action.cost,
        universal: action.universal ?? false,
        grantClass: action.grantClass ?? null,
        grantSubclass: action.grantSubclass ?? null,
        grantLevel: action.grantLevel ?? null,
        resourceKey: action.resourceKey ?? null,
        resourceAmount: action.resourceAmount ?? null,
      },
      update: {
        name: action.name,
        description: action.description,
        cost: action.cost,
        universal: action.universal ?? false,
        grantClass: action.grantClass ?? null,
        grantSubclass: action.grantSubclass ?? null,
        grantLevel: action.grantLevel ?? null,
        resourceKey: action.resourceKey ?? null,
        resourceAmount: action.resourceAmount ?? null,
      },
    });
  }

  // Seed maneuver catalog — upsert by unique name.
  for (const maneuver of MANEUVERS) {
    await prisma.maneuver.upsert({
      where: { name: maneuver.name },
      create: maneuver,
      update: { description: maneuver.description },
    });
  }

  // Seed feat catalog — upsert by unique name.
  for (const feat of FEATS) {
    await prisma.feat.upsert({
      where: { name: feat.name },
      create: feat,
      update: {
        description: feat.description,
        prerequisite: feat.prerequisite ?? null,
        abilityOptions: feat.abilityOptions ?? [],
        abilityIncrease: feat.abilityIncrease ?? 0,
        improvements: feat.improvements ?? [],
      },
    });
  }

  const backgroundIds = new Map<string, string>();
  for (const background of BACKGROUNDS) {
    const row = await prisma.background.upsert({
      where: { name: background.name },
      create: background,
      update: background,
    });
    backgroundIds.set(row.name, row.id);
  }

  // Seed spell catalog — upsert by unique name, same idempotent pattern as items.
  for (const spell of SPELLS) {
    await prisma.spell.upsert({
      where: { name: spell.name },
      create: spell,
      update: spell,
    });
  }

  const catalogByName = new Map<string, CatalogItem>(ITEMS.map((item) => [item.name, item]));
  const itemIdsByName = new Map<string, string>();
  for (const item of ITEMS) {
    const { name, category, weight, cost, description } = item;
    const row = await prisma.item.upsert({
      where: { name },
      create: { name, category, weight, cost, description, ...itemDetailCreateFields(item) },
      update: { name, category, weight, cost, description, ...itemDetailUpsertFields(item) },
    });
    itemIdsByName.set(row.name, row.id);
  }

  // Seed equipment packs. Each pack is upserted by name; contents are replaced
  // wholesale (deleteMany + create) since PackContent has no stable business key
  // to upsert against — same pattern as classEntries / inventoryItems above.
  for (const pack of PACKS) {
    const { id: packId } = await prisma.pack.upsert({
      where: { name: pack.name },
      create: { name: pack.name, description: pack.description },
      update: { name: pack.name, description: pack.description },
    });
    await prisma.packContent.deleteMany({ where: { packId } });
    await prisma.packContent.createMany({
      data: pack.contents.map((c) => ({
        packId,
        itemId: itemIdsByName.get(c.itemName)!,
        quantity: c.quantity ?? 1,
      })),
    });
  }

  for (const { race, class: className, subclass, background, inventory, ...character } of SEED_CHARACTERS) {
    const raceId = raceIds.get(race);
    const classId = classIds.get(className);
    const backgroundId = backgroundIds.get(background);
    // Resolve catalog subclassId from the seed character's subclass name (if any).
    const subclassId = subclass
      ? (subclassIdsByClassAndName.get(`${className}/${subclass}`) ?? null)
      : null;
    const inventoryItems = inventory.map((row, position) =>
      resolveInventoryRow(row, position, catalogByName, itemIdsByName)
    );

    await prisma.character.upsert({
      where: { id: character.id },
      create: {
        ...character,
        // Seed characters have no creation-fixed tool profs — they exist to
        // demonstrate features, not to be playable party members.
        toolProficiencies: (character as Record<string, unknown>).toolProficiencies ?? [],
        raceSelection: { create: { name: race, raceId } },
        backgroundSelection: { create: { name: background, backgroundId } },
        classEntries: { create: [{ name: className, subclass, subclassId, classId, position: 0 }] },
        inventoryItems: { create: inventoryItems },
      },
      update: {
        ...character,
        toolProficiencies: (character as Record<string, unknown>).toolProficiencies ?? [],
        raceSelection: {
          upsert: { create: { name: race, raceId }, update: { name: race, raceId } },
        },
        backgroundSelection: {
          upsert: { create: { name: background, backgroundId }, update: { name: background, backgroundId } },
        },
        // Class entries and inventory items both have no natural unique key
        // to upsert against, so re-seeding replaces them wholesale rather
        // than risking duplicates.
        classEntries: {
          deleteMany: {},
          create: [{ name: className, subclass, subclassId, classId, position: 0 }],
        },
        inventoryItems: {
          deleteMany: {},
          create: inventoryItems,
        },
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
