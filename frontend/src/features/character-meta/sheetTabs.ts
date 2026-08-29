import type { ReactNode } from "react";

import type { Character, ReferenceData } from "@/types/character";

export type SheetTabId = "overview" | "class" | "combat" | "inventory" | "magic" | "story";

export interface SheetTab {
  id: SheetTabId;
  label: string;
  // Set per-render by the header, not baked into the tab list.
  badge?: ReactNode;
}

// Panels read the character itself via useCurrentCharacter() rather than a prop.
// isLive/onGoToCombat are unused by most panels; Magic's Cast door reads them to defer casting to the Combat tab during a live session.
export interface SheetPanelProps {
  reference: ReferenceData | null;
  isLive?: boolean;
  onGoToCombat?: () => void;
}

const ALL_TABS: SheetTab[] = [
  { id: "overview", label: "Overview" },
  { id: "class", label: "Class" },
  { id: "combat", label: "Combat" },
  { id: "inventory", label: "Inventory" },
  { id: "magic", label: "Magic" },
  { id: "story", label: "Story" },
];

export function getSheetTabs(character: Character): SheetTab[] {
  return ALL_TABS.filter((t) => (t.id === "magic" ? Boolean(character.spellcasting) : true));
}

export function resolveActiveTab(param: string | null, tabs: SheetTab[]): SheetTabId {
  const match = tabs.find((t) => t.id === param);
  // Guards the empty-tabs case, in case a caller skips the length check useSheetTabs applies.
  return match ? match.id : (tabs[0]?.id ?? "overview");
}
