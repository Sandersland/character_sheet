import InventoryList from "@/features/inventory/InventoryList";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

/**
 * Inventory tab — the item list, purse, and equipment. Slice #922 relocates the
 * existing InventoryList unchanged; the loadout-list paper doll lands in #925.
 */
export default function InventoryPanel({ character, onUpdate }: SheetPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <InventoryList character={character} onUpdate={onUpdate} />
    </div>
  );
}
