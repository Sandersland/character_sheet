import InventoryList from "@/features/inventory/InventoryList";

// Takes no props (InventoryList reads the character itself) — still assignable to the SheetPanelProps-typed panel registry.
export default function InventoryPanel() {
  return (
    <div className="flex flex-col gap-6">
      <InventoryList />
    </div>
  );
}
