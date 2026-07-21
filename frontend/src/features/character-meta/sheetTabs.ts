import type { ReactNode } from "react";

import type { Character, ReferenceData } from "@/types/character";

export type SheetTabId = "overview" | "class" | "combat" | "inventory" | "magic" | "story";

export interface SheetTab {
  id: SheetTabId;
  label: string;
  /** Optional pill/dot rendered by the `Tabs` bar (e.g. the live-session pip on
   *  Combat, #964). Set per-render by the header, not baked into the tab list. */
  badge?: ReactNode;
}

/** Props every tab panel receives — the character, loaded reference data, and the
 *  optimistic-update setter threaded down from the sheet page. isLive/onGoToCombat
 *  are unused by most panels; Magic's Cast door reads them to defer casting to the
 *  Combat tab during a live session (#1162). */
export interface SheetPanelProps {
  character: Character;
  reference: ReferenceData | null;
  onUpdate: (c: Character) => void;
  isLive?: boolean;
  onGoToCombat?: () => void;
}

const ALL_TABS: SheetTab[] = [
  { id: "overview", label: "Overview" },
  // #1169: class features (roster/subclass/resources/feature text) got their own
  // tab — a level-7+ multiclass card was dwarfing the rest of Overview.
  { id: "class", label: "Class" },
  { id: "combat", label: "Combat" },
  { id: "inventory", label: "Inventory" },
  { id: "magic", label: "Magic" },
  { id: "story", label: "Story" },
];

/** The tabs available for this character. Magic is caster-only (no spellcasting →
 *  no Magic tab); the rest always apply. */
export function getSheetTabs(character: Character): SheetTab[] {
  return ALL_TABS.filter((t) => (t.id === "magic" ? Boolean(character.spellcasting) : true));
}

/** Resolve the active tab from the `?tab=` URL param, falling back to the first
 *  available tab when the param is missing or names an unavailable tab (e.g.
 *  `?tab=magic` on a non-caster, or a stale/typo value). */
export function resolveActiveTab(param: string | null, tabs: SheetTab[]): SheetTabId {
  const match = tabs.find((t) => t.id === param);
  // Fall back to the first available tab; guard the empty-tabs case (no crash if
  // a caller skips the length check the hook applies).
  return match ? match.id : (tabs[0]?.id ?? "overview");
}
