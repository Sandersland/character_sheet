import type { ReactNode } from "react";

import Card from "@/components/ui/Card";
import AddItemFab from "@/features/inventory/AddItemFab";
import InventoryMobileHeader, { type MetersProps } from "@/features/inventory/InventoryMobileHeader";
import type { FilterKey } from "@/lib/inventorySections";

interface InventoryListMobileProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter: FilterKey;
  onFilterChange: (filter: FilterKey) => void;
  view: "bag" | "worn";
  onViewChange: (view: "bag" | "worn") => void;
  metersProps: MetersProps;
  hasItems: boolean;
  configuringSell: boolean;
  addPanel: ReactNode;
  error: string | null;
  body: ReactNode;
  currency: ReactNode;
  onAdd: () => void;
}

// The mobile (<md) inventory layout (#1029): full-bleed card, a one-row toolbar,
// slim encumbrance, dense rows that open a detail sheet, and an add-item FAB —
// the desktop header Sell/Add actions drop out here.
export default function InventoryListMobile({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  view,
  onViewChange,
  metersProps,
  hasItems,
  configuringSell,
  addPanel,
  error,
  body,
  currency,
  onAdd,
}: InventoryListMobileProps) {
  const showFab = hasItems && !configuringSell;
  return (
    <Card title="Inventory" className="p-0">
      <div className="flex flex-col pb-4">
        <InventoryMobileHeader
          search={search}
          onSearchChange={onSearchChange}
          filter={filter}
          onFilterChange={onFilterChange}
          view={view}
          onViewChange={onViewChange}
          metersProps={metersProps}
          hasItems={hasItems}
          configuringSell={configuringSell}
        />

        {addPanel && <div className="px-4 pt-3">{addPanel}</div>}
        {error && <p className="px-4 pt-3 text-xs font-semibold text-garnet-700">{error}</p>}

        {body}

        <div className="px-4 pt-4">{currency}</div>
      </div>

      {showFab && <AddItemFab onClick={onAdd} />}
    </Card>
  );
}
