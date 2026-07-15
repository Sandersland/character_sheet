import { useSearchParams } from "react-router-dom";

import { getSheetTabs, resolveActiveTab, type SheetTab, type SheetTabId } from "./sheetTabs";
import type { Character } from "@/types/character";

interface SheetTabsState {
  tabs: SheetTab[];
  activeTab: SheetTabId;
  onTabChange: (id: SheetTabId) => void;
}

/**
 * Owns the sheet's tab state: which tabs this character has, the active one, and
 * how switching updates the URL. The active tab lives in the `?tab=` query param
 * so it's linkable, reload-safe, and back-button navigable (switching pushes a
 * history entry). Falls back to the first available tab for a missing/unavailable
 * value. Safe to call before the character has loaded (returns no tabs).
 */
export function useSheetTabs(character: Character | null | undefined): SheetTabsState {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = character ? getSheetTabs(character) : [];
  const activeTab = tabs.length ? resolveActiveTab(searchParams.get("tab"), tabs) : "overview";

  const onTabChange = (id: SheetTabId) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("tab", id);
      return params;
    });
  };

  return { tabs, activeTab, onTabChange };
}
