import type { InventoryItem, InventoryOperation } from "@/types/character";

interface EquipToggleProps {
  item: InventoryItem;
  pending: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
}

// The equip/unequip pill; equippability is gated by the parent row.
export default function EquipToggle({ item, pending, onSubmit }: EquipToggleProps) {
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={item.equipped}
      onClick={() =>
        onSubmit([{ type: "setEquipped", inventoryItemId: item.id, equipped: !item.equipped }])
      }
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        item.equipped
          ? "border-vitality-200 bg-vitality-50 text-vitality-800 hover:bg-vitality-100"
          : "border-parchment-300 bg-parchment-50 text-parchment-700 hover:bg-parchment-100"
      }`}
    >
      {item.equipped ? "Equipped" : "Equip"}
    </button>
  );
}
