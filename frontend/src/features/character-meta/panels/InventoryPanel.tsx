import InventoryList from "@/features/inventory/InventoryList";

/**
 * Inventory tab — the item list, purse, and equipment. Slice #922 relocates the
 * existing InventoryList unchanged; the loadout-list paper doll lands in #925.
 * Takes no props (InventoryList reads the character itself) — still assignable
 * to the SheetPanelProps-typed panel registry (fewer params is fine).
 */
export default function InventoryPanel() {
  return (
    <div className="flex flex-col gap-6">
      <InventoryList />
    </div>
  );
}
