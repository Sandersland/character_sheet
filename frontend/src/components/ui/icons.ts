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

// game-icons.net via react-icons/gi; CC BY 3.0 attribution lives on /about.
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

export { GiQuillInk, GiKnapsack, GiSpellBook, GiHealthNormal, GiHealthPotion, GiVisoredHelm, GiRank3 } from "react-icons/gi";
export { GiCrossedSwords, GiSparkles, GiCycle } from "react-icons/gi";
// fallow-ignore-next-line unused-export -- public re-export kept available for the attack sheet; no current importer yet
export { GiSwordWound } from "react-icons/gi";
// GiOpenBook/GiPublicSpeaker are the 2024-only Study/Influence tiles.
export {
  GiRun,
  GiDodging,
  GiSprint,
  GiThreeFriends,
  GiHoodedFigure,
  GiMagnifyingGlass,
  GiSandsOfTime,
  GiGrab,
  GiPush,
  GiOpenBook,
  GiPublicSpeaker,
} from "react-icons/gi";
export {
  ArrowUp,
  Lock,
  Unlock,
  Plus,
  Zap,
  VenetianMask,
  // Deliberately distinct from VenetianMask, which reads as identity-merge (a secret) rather than combine (a mistake).
  Combine,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  MoreHorizontal,
  Trash2,
  TriangleAlert,
  ScrollText,
  Eye,
  Bell,
  Copy,
} from "lucide-react";
