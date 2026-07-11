import { useState } from "react";

import { toggledSet } from "@/lib/toggleSet";

export interface SellSelection {
  selectMode: boolean;
  selectedIds: Set<string>;
  configuringSell: boolean;
  enterSelectMode: () => void;
  exitSelectMode: () => void;
  toggleSelect: (id: string) => void;
  startConfiguring: () => void;
  stopConfiguring: () => void;
}

// Multi-select "sell items" flow: which rows are picked and whether the sell
// panel is open. exitSelectMode clears the whole flow on every ending path.
export function useSellSelection(): SellSelection {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [configuringSell, setConfiguringSell] = useState(false);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => toggledSet(prev, id));
  }

  function enterSelectMode() {
    setSelectedIds(new Set());
    setSelectMode(true);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setConfiguringSell(false);
  }

  return {
    selectMode,
    selectedIds,
    configuringSell,
    enterSelectMode,
    exitSelectMode,
    toggleSelect,
    startConfiguring: () => setConfiguringSell(true),
    stopConfiguring: () => setConfiguringSell(false),
  };
}
