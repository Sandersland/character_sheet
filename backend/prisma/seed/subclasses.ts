// --- Subclass catalog -------------------------------------------------------
// Class-keyed subclass catalog powering the character-creation dropdown and
// post-creation setSubclass transaction. Classes/subclasses with full
// mechanics support in srd.ts drive automation; others are included for
// creation UX completeness.
import { z } from "zod";

import type { SeedEdition } from "./edition.js";
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";

export interface SubclassSeed {
  className: string;    // must match an entry in CLASSES
  name: string;
  description: string;
  // Stable mechanics-identity join key (#1277) — see subclass-slug.ts's header.
  // Authored once per row at seed-authoring time (never derived at read time);
  // must equal the SubclassDefinition's own `slug` in lib/classes/<class>.ts.
  slug: SubclassSlug;
  // Omitted = shared (NULL column, valid in both editions, #1306). Path of
  // the Totem Warrior (Barbarian) is the first row to set this —
  // EDITION_2014 only, since SRD 5.2 replaces it with Path of the Wild Heart
  // rather than retabbing it (#1559) — so a 2024 character is no longer
  // offered a subclass with zero features in its edition. The Archfey and The
  // Great Old One (Warlock, #1233) are the same shape: their PHB'24 reworks
  // are non-SRD and unverifiable, so no 2024 rows are authored and both are
  // tagged EDITION_2014 here in the same commit.
  edition?: SeedEdition;
}

// Validated at seed time (prisma/seed/validate.ts) — a malformed row fails the
// seed with a row-indexed message instead of writing a broken catalog row.
// z.enum(SUBCLASS_SLUGS) rejects a typo'd slug the SAME way the SubclassSlug
// union rejects it at compile time (M1, #1277); the cross-row duplicate-slug
// check (M2) catches what no type can — two rows sharing one slug.
export const subclassSeedSchema = z.object({
  className: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  slug: z.enum(SUBCLASS_SLUGS),
  edition: z.enum(["EDITION_2014", "EDITION_2024"]).optional(),
});

export const SUBCLASSES: SubclassSeed[] = [
  // ── Fighter ────────────────────────────────────────────────────────────────
  {
    className: "Fighter",
    name: "Battle Master",
    description:
      "Masters of tactical martial combat. You learn special maneuvers fueled by superiority dice (d8s). You know 3 maneuvers at level 3, gaining more at higher levels. Superiority dice refresh on a short or long rest.",
    slug: "fighter-battle-master",
  },
  {
    className: "Fighter",
    name: "Champion",
    description:
      "A paragon of physical might. Your critical hit range expands (19–20 at level 3, 18–20 at level 15), and you gain additional combat benefits including second wind improvements.",
    slug: "fighter-champion",
  },
  {
    className: "Fighter",
    name: "Eldritch Knight",
    description:
      "A warrior who weaves abjuration and evocation magic into combat. You gain spellcasting using Intelligence, following the third-caster progression (slots start at level 3).",
    slug: "fighter-eldritch-knight",
  },
  // ── Wizard ────────────────────────────────────────────────────────────────
  {
    className: "Wizard",
    name: "School of Evocation",
    description:
      "You focus your study on magic that creates powerful elemental effects. Sculpt Spells lets you protect allies from area-of-effect spells; Empowered Evocation adds your Intelligence modifier to evocation spell damage.",
    slug: "wizard-school-of-evocation",
  },
  {
    className: "Wizard",
    name: "School of Abjuration",
    description:
      "A specialist in protective and warding magic. You gain an Arcane Ward that absorbs damage, and can extend its protection to allies.",
    slug: "wizard-school-of-abjuration",
  },
  {
    className: "Wizard",
    name: "School of Illusion",
    description:
      "You study magic that dazzles the senses and tricks the mind. Improved Minor Illusion and Malleable Illusions let you push the boundaries of what can appear real.",
    slug: "wizard-school-of-illusion",
  },
  // ── Rogue ─────────────────────────────────────────────────────────────────
  {
    className: "Rogue",
    name: "Arcane Trickster",
    description:
      "You combine roguish skill with arcane magic, learning enchantment and illusion spells using Intelligence following the third-caster progression. Mage Hand becomes an extension of your cunning.",
    slug: "rogue-arcane-trickster",
  },
  {
    className: "Rogue",
    name: "Assassin",
    description:
      "Trained in the art of swift, lethal strikes. You gain proficiency with disguise and poisoner's kits, and deal massive damage to surprised targets with Assassinate.",
    slug: "rogue-assassin",
  },
  {
    className: "Rogue",
    name: "Thief",
    description:
      "A nimble expert at burglary and larceny. Fast Hands lets you use Cunning Action for Sleight of Hand, Thieves' Tools, or Use an Object; Second-Story Work eases climbing and jumps. At higher levels you become supremely stealthy, can use any magic item, and take two turns in the first round of combat.",
    slug: "rogue-thief",
  },
  // ── Cleric ────────────────────────────────────────────────────────────────
  {
    className: "Cleric",
    name: "Life Domain",
    description:
      "Devoted to the positive energy that sustains life. You gain heavy armor proficiency and powerful healing features including Disciple of Life (healing spells restore additional HP) and Blessed Healer.",
    slug: "cleric-life-domain",
  },
  {
    className: "Cleric",
    name: "Trickery Domain",
    description:
      "A champion of deception and infiltration. You gain access to domain spells like Charm Person and Disguise Self, and can grant allies the ability to attack with advantage using your Blessing of the Trickster.",
    slug: "cleric-trickery-domain",
  },
  // ── Barbarian ─────────────────────────────────────────────────────────────
  {
    className: "Barbarian",
    name: "Totem Warrior",
    description:
      "You forge a connection to a spirit animal. Totem choices include Bear (resistance while raging), Eagle (disengage/dash as bonus action), and Wolf (allies have advantage on melee attacks vs. nearby targets).",
    slug: "barbarian-totem-warrior",
    edition: "EDITION_2014",
  },
  {
    className: "Barbarian",
    name: "Berserker",
    description:
      "You channel a battle frenzy beyond normal rage. Frenzied Rage lets you make a bonus attack each turn, and Mindless Rage makes you immune to the charmed and frightened conditions while raging.",
    slug: "barbarian-berserker",
  },
  // ── Bard ─────────────────────────────────────────────────────────────────
  {
    className: "Bard",
    name: "College of Lore",
    description:
      "Devoted to knowledge and cunning. You gain proficiency in three additional skills, Cutting Words to impose penalties on enemy rolls, and bonus spells from any class at level 6.",
    slug: "bard-college-of-lore",
  },
  {
    className: "Bard",
    name: "College of Valor",
    description:
      "A bard who fights as well as they inspire. You gain medium armor and shield proficiency, Combat Inspiration (allies add your Bardic Inspiration die to damage rolls), and Extra Attack at level 6.",
    slug: "bard-college-of-valor",
  },
  // ── Druid ─────────────────────────────────────────────────────────────────
  {
    className: "Druid",
    name: "Circle of the Land",
    description:
      "You draw on the magic of the natural world, becoming a conduit for druidic power. You gain additional spells based on a chosen terrain type (arctic, coast, desert, forest, grassland, mountain, swamp, or Underdark), Natural Recovery to restore expended spell slots on a short rest, and spells always prepared from your circle.",
    slug: "druid-circle-of-the-land",
  },
  {
    className: "Druid",
    name: "Circle of the Moon",
    description:
      "You are at home in the wild, capable of transforming into more powerful beasts. Starting at level 2 you can Wild Shape into beasts with CR up to 1 (scaling to CR equal to a third of your druid level at level 6), and you can use Wild Shape as a bonus action. At higher levels you can transform into elementals.",
    slug: "druid-circle-of-the-moon",
  },
  // ── Monk ─────────────────────────────────────────────────────────────────
  {
    className: "Monk",
    name: "Warrior of the Open Hand",
    description:
      "You master techniques to push and trip opponents, cover yourself in a shroud of focus, and enter a trance state that heals your wounds. Open Hand Technique allows you to impose special effects on creatures hit by your Flurry of Blows — knocking them prone, pushing them 15 ft, or denying their reactions.",
    slug: "monk-warrior-of-the-open-hand",
  },
  {
    className: "Monk",
    name: "Warrior of Shadow",
    description:
      "You follow a tradition that values stealth and subtlety. You know Minor Illusion, cast Darkness for 1 focus, and see in the dark. You teleport between areas of shadow, and at higher levels can spend focus to teleport freely and, ultimately, cloak yourself in invisibility.",
    slug: "monk-warrior-of-shadow",
  },
  {
    className: "Monk",
    name: "Warrior of the Elements",
    description:
      "You wield the elements of air, earth, fire, and water. Manipulate Elements grants the Elementalism cantrip, and Elemental Attunement lets you spend 1 Focus Point to imbue yourself for 10 minutes — extending your Unarmed Strike reach and letting your strikes deal elemental damage that shoves foes. Elemental Burst (level 6) unleashes a 20-ft sphere for three Martial Arts dice, Stride of the Elements (level 11) grants flight and swimming while attuned, and Elemental Epitome (level 17) adds elemental resistance, a destructive stride, and empowered strikes.",
    slug: "monk-warrior-of-the-elements",
  },
  {
    className: "Monk",
    name: "Warrior of Mercy",
    description:
      "You wield your focus to wound or heal with a touch. Hand of Harm channels necrotic energy into your unarmed strikes, while Hand of Healing lets you mend a creature as a Magic action or in place of a Flurry of Blows strike. Physician's Touch adds lingering harm or cures grievous conditions, Flurry of Healing and Harm lets a flurry of blows do both at once, and Hand of Ultimate Mercy can restore the recently dead to life.",
    slug: "monk-warrior-of-mercy",
  },
  // ── Paladin ───────────────────────────────────────────────────────────────
  {
    className: "Paladin",
    name: "Oath of Devotion",
    description:
      "The Oath of Devotion binds you to the loftiest ideals of justice and order. Channel Divinity options include Sacred Weapon (add Cha modifier to attack rolls) and Turn the Unholy. You gain spells such as Protection from Evil and Good and Guardian of Faith, and eventually radiate an aura of courage.",
    slug: "paladin-oath-of-devotion",
  },
  {
    className: "Paladin",
    name: "Oath of the Ancients",
    description:
      "You swear to protect the light and the living world. Channel Divinity options are Nature's Wrath (restrain a creature) and Turn the Faithless. You gain spells such as Ensnaring Strike and Misty Step, and eventually gain resistance to spell damage from magical effects.",
    slug: "paladin-oath-of-the-ancients",
  },
  {
    className: "Paladin",
    name: "Oath of Vengeance",
    description:
      "You pursue the worst of the worst with righteous fury. Vow of Enmity grants advantage on attack rolls against one creature; Abjure Enemy holds a foe in fear. You gain spells such as Bane and Hold Person, and eventually can teleport to strike your quarry wherever they flee.",
    slug: "paladin-oath-of-vengeance",
  },
  // ── Ranger ───────────────────────────────────────────────────────────────
  {
    className: "Ranger",
    name: "Hunter",
    description:
      "You stalk prey with precision and power. Hunter's Prey options (Colossus Slayer, Giant Killer, Horde Breaker) let you customize your approach against different threats. Defensive Tactics at level 7 add further versatility, letting you shrug off opportunity attacks, gain multiattack defense, or escape being surrounded.",
    slug: "ranger-hunter",
  },
  {
    className: "Ranger",
    name: "Beast Master",
    description:
      "You forge an unbreakable bond with an animal companion that fights alongside you. Your companion acts on your turn and grows more powerful as you level — sharing your proficiency bonus, gaining additional attacks, and becoming harder to kill. The bond lets you communicate with it telepathically.",
    slug: "ranger-beast-master",
  },
  // ── Sorcerer ─────────────────────────────────────────────────────────────
  {
    className: "Sorcerer",
    name: "Draconic Bloodline",
    description:
      "Magic runs in your veins as the blood of a dragon ancestor. You gain natural armor (AC 13 + Dex modifier without armor), resistance to your dragon type's damage, bonus damage on spells of that type, and eventually sprout wings and radiate a draconic presence that can frighten or charm creatures around you.",
    slug: "sorcerer-draconic-bloodline",
  },
  {
    className: "Sorcerer",
    name: "Wild Magic",
    description:
      "Your innate magic stems from an untamed, chaotic source. Every time you cast a 1st level or higher spell there is a chance of a Wild Magic Surge — a random magical effect. Tides of Chaos grants advantage on one attack roll, ability check, or saving throw. Controlled Chaos and Spell Bombardment appear at higher levels.",
    slug: "sorcerer-wild-magic",
  },
  // ── Warlock ───────────────────────────────────────────────────────────────
  {
    className: "Warlock",
    name: "The Fiend",
    description:
      "You have made a pact with a powerful devil or demon of the Lower Planes. Dark One's Blessing grants temporary HP whenever you reduce a hostile creature to 0. You gain a bonus spell list including Burning Hands and Command, and eventually gain fire resistance, immunity to fire, and the ability to call up fiends to serve you.",
    slug: "warlock-the-fiend",
  },
  {
    className: "Warlock",
    name: "The Archfey",
    description:
      "Your patron is a lord or lady of the Feywild. Fey Presence (charm or frighten nearby creatures as an action) and Misty Escape (teleport and turn invisible as a reaction when hit) define your early power. At higher levels you become immune to charm, can beguile minds, and can blur the line between dream and reality.",
    slug: "warlock-the-archfey",
    edition: "EDITION_2014",
  },
  {
    className: "Warlock",
    name: "The Great Old One",
    description:
      "Your patron is an entity of unfathomable cosmic power. Awakened Mind lets you telepathically communicate with any creature you can see. You gain spells such as Dissonant Whispers and Detect Thoughts, and eventually can project your awareness across planes, speak into the minds of others, and create a lair in the Far Realm.",
    slug: "warlock-the-great-old-one",
    edition: "EDITION_2014",
  },
];
