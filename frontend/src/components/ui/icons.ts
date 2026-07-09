// Central icon barrel: lucide-react for UI chrome, react-icons/gi for D&D flavor.
import type { IconType } from "react-icons";
import {
  GiBiceps,
  GiAcrobatic,
  GiHeartBeats,
  GiBrain,
  GiOwl,
  GiPublicSpeaker,
  GiCrossedSwords,
  GiChestArmor,
  GiKnapsack,
  GiHealthPotion,
  GiSwordWound,
  GiShield,
  GiVisoredHelm,
  GiNecklaceDisplay,
  GiCape,
  GiGloves,
  GiWalkingBoot,
  GiBelt,
  GiRing,
  GiBracers,
} from "react-icons/gi";

import type { AbilityName, EquipSlot, ItemCategory } from "@/types/character";

export const ABILITY_ICONS: Record<AbilityName, IconType> = {
  strength: GiBiceps,
  dexterity: GiAcrobatic,
  constitution: GiHeartBeats,
  intelligence: GiBrain,
  wisdom: GiOwl,
  charisma: GiPublicSpeaker,
};

export const ITEM_CATEGORY_ICONS: Record<ItemCategory, IconType> = {
  weapon: GiCrossedSwords,
  armor: GiChestArmor,
  gear: GiKnapsack,
  consumable: GiHealthPotion,
};

// Paper-doll slot glyphs (#566) — game-icons.net via react-icons/gi. RING shares
// the ring glyph across both sub-slots. CC BY 3.0 attribution lives on /about.
export const EQUIP_SLOT_ICONS: Record<EquipSlot, IconType> = {
  MAIN_HAND: GiSwordWound,
  OFF_HAND: GiShield,
  BODY: GiChestArmor,
  HEAD: GiVisoredHelm,
  NECK: GiNecklaceDisplay,
  CLOAK: GiCape,
  HANDS: GiGloves,
  WRISTS: GiBracers,
  BELT: GiBelt,
  FEET: GiWalkingBoot,
  RING: GiRing,
};

export { GiQuillInk, GiKnapsack, GiSpellBook, GiHealthNormal, GiChestArmor } from "react-icons/gi";
export { Lock, Plus, Zap, VenetianMask, ChevronDown, Trash2 } from "lucide-react";
