// ── Channel Divinity catalog (Cleric + Paladin, #419) ───────────────────────
// CD options as GrantedAbility rows with source "channelDivinity". Every option
// spends 1 Channel Divinity charge (costBase 1, costPoolKey "channelDivinity").
// The class/subclass/level gate + the option's "kind" (announce / buff /
// advantage / invisible / reminder) live in lib/channel-divinity.ts, not here —
// the row carries only description, cost, save ability, and buff target. Sacred
// Weapon's buff modifier is derived from Charisma at cast time (left null here).
// Descriptions are absorbed from the SUBCLASS_FEATURE_LIST lines.
export interface ChannelDivinitySeed {
  name: string;
  description: string;
  saveAbility?: string;
  effectKind?: "buff";
  buffTarget?: string;
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
  {
    name: "Channel Divinity: Cloak of Shadows",
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
  {
    name: "Channel Divinity: Turn the Unholy",
    description:
      "As an action, present your holy symbol and speak a prayer. Each fiend or undead within 30 ft that can see or hear you must make a Wisdom save or be turned for 1 minute.",
    saveAbility: "wisdom",
  },
  {
    name: "Channel Divinity: Nature's Wrath",
    description:
      "As an action, invoke spectral vines to restrain a creature within 10 ft. It must succeed on a Strength or Dexterity save (its choice) or be restrained; it repeats the save at the end of each of its turns.",
    saveAbility: "dexterity",
  },
  {
    name: "Channel Divinity: Turn the Faithless",
    description:
      "As an action, present your holy symbol and speak a prayer. Each fey or fiend within 30 ft that can see or hear you must make a Wisdom save or be turned for 1 minute. Turned creatures reveal their true form if disguised.",
    saveAbility: "wisdom",
  },
  {
    name: "Channel Divinity: Abjure Enemy",
    description:
      "As an action, choose one creature within 60 ft that can hear you. It must make a Wisdom save (fiends and undead have disadvantage) or be frightened until the end of your next turn, with its speed reduced to 0; on a success its speed is halved.",
    saveAbility: "wisdom",
  },
  {
    name: "Channel Divinity: Vow of Enmity",
    description:
      "As a bonus action, utter a vow of enmity against a creature within 10 ft. Gain advantage on attack rolls against it for 1 minute or until it drops to 0 HP or falls unconscious.",
  },
];
