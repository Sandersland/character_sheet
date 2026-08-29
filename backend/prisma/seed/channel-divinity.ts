// Every Channel Divinity option spends 1 Channel Divinity charge.
// Sacred Weapon's buff modifier is derived from Charisma at cast time (left null here).
import type { SeedEdition } from "./edition.js";

export interface ChannelDivinitySeed {
  name: string;
  description: string;
  saveAbility?: string;
  effectKind?: "buff";
  buffTarget?: string;
  // Omitted = shared (NULL column, valid in both editions, #1306); a diverging row forks (#1415).
  edition?: SeedEdition;
}

export const CHANNEL_DIVINITIES: ChannelDivinitySeed[] = [
  {
    name: "Channel Divinity: Turn Undead",
    description:
      "As an action, each undead within 30 ft that can see or hear you must make a Wisdom save or be turned for 1 minute. A turned creature must flee from you and can't willingly move within 30 ft of you; it can't take reactions and can only Dash or try to escape.",
    saveAbility: "wisdom",
  },
  {
    name: "Channel Divinity: Preserve Life",
    description:
      "As an action, evoke healing energy that restores a total of 5× your cleric level HP, divided as you choose among creatures within 30 ft. You can restore a creature to no more than half its HP maximum, and can't use this on undead or constructs.",
  },
  {
    name: "Channel Divinity: Invoke Duplicity",
    description:
      "As an action, create an illusory duplicate of yourself within 30 ft for 1 minute (concentration). Gain advantage on attack rolls against a creature within 5 ft of the duplicate, and you can cast spells as though from the duplicate's space.",
  },
  // SRD 5.2 drops this option, replaced by Trickster's Transposition (#1590).
  {
    name: "Channel Divinity: Cloak of Shadows",
    edition: "EDITION_2014",
    description:
      "As an action, become invisible until the end of your next turn. You gain no benefit while in an area of bright light.",
  },
  {
    name: "Channel Divinity: Sacred Weapon",
    description:
      "As an action, imbue one weapon with positive energy for 1 minute. Add your Charisma modifier to attack rolls with it (minimum +1), and it sheds bright light (20 ft) and becomes magical.",
    effectKind: "buff",
    buffTarget: "attackRoll",
  },
  // SRD 5.2 folds this into the base class's own Abjure Foes (L9), available regardless of oath (#1229).
  {
    name: "Channel Divinity: Turn the Unholy",
    edition: "EDITION_2014",
    description:
      "As an action, present your holy symbol and speak a prayer. Each fiend or undead within 30 ft that can see or hear you must make a Wisdom save or be turned for 1 minute.",
    saveAbility: "wisdom",
  },
  {
    name: "Channel Divinity: Nature's Wrath",
    edition: "EDITION_2014",
    description:
      "As an action, invoke spectral vines to restrain a creature within 10 ft. It must succeed on a Strength or Dexterity save (its choice) or be restrained; it repeats the save at the end of each of its turns.",
    saveAbility: "dexterity",
  },
  // SRD 5.2: save changes Dexterity -> Strength, range widens 10 -> 15 ft, effect becomes Restrained with a repeating save (#1229).
  {
    name: "Channel Divinity: Nature's Wrath",
    edition: "EDITION_2024",
    description:
      "As a Magic action, invoke spectral vines to restrain one or more creatures within 15 ft. Each must succeed on a Strength save or be restrained (AC 20, 20 HP, immune to poison/psychic) until freed or the vines are destroyed; a restrained target repeats the save at the end of each of its turns.",
    saveAbility: "strength",
  },
  // SRD 5.2 folds this into the base class's own Abjure Foes (L9) (#1229).
  {
    name: "Channel Divinity: Turn the Faithless",
    edition: "EDITION_2014",
    description:
      "As an action, present your holy symbol and speak a prayer. Each fey or fiend within 30 ft that can see or hear you must make a Wisdom save or be turned for 1 minute. Turned creatures reveal their true form if disguised.",
    saveAbility: "wisdom",
  },
  // SRD 5.2 folds this into the base class's own Abjure Foes (L9) (#1229).
  {
    name: "Channel Divinity: Abjure Enemy",
    edition: "EDITION_2014",
    description:
      "As an action, choose one creature within 60 ft that can hear you. It must make a Wisdom save (fiends and undead have disadvantage) or be frightened until the end of your next turn, with its speed reduced to 0; on a success its speed is halved.",
    saveAbility: "wisdom",
  },
  {
    name: "Channel Divinity: Vow of Enmity",
    description:
      "As a bonus action, utter a vow of enmity against a creature within 10 ft. Gain advantage on attack rolls against it for 1 minute or until it drops to 0 HP or falls unconscious.",
  },
  // 2024: Divine Sense moves from its own L1 resource pool to a base Channel Divinity option every Paladin has, regardless of oath (#1229).
  {
    name: "Channel Divinity: Divine Sense",
    edition: "EDITION_2024",
    description:
      "As a Bonus Action, expend a use of your Channel Divinity to sense celestials, fiends, and undead within 60 ft for 10 minutes or until you have the Incapacitated condition; you also learn the creature type of any consecrated or desecrated place or object in range (as with the Hallow spell).",
  },
  // DC is Charisma-derived, but the save ability rolled is Wisdom (#1229).
  {
    name: "Abjure Foes",
    edition: "EDITION_2024",
    description:
      "As a Magic action, expend a use of your Channel Divinity to frighten up to your Charisma modifier (minimum one) creatures within 60 ft. Each must succeed on a Wisdom save or have the Frightened condition for 1 minute or until it takes damage; while Frightened, a target may only move, take an action, or take a bonus action on its turn (not more than one).",
    saveAbility: "wisdom",
  },
];
