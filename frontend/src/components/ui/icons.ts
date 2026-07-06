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
} from "react-icons/gi";

import type { AbilityName, ItemCategory } from "@/types/character";

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

export { GiQuillInk, GiKnapsack, GiSpellBook, GiHealthNormal } from "react-icons/gi";
export { Lock, Plus, Zap, VenetianMask, ChevronDown } from "lucide-react";
