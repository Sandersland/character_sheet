import Card from "@/components/ui/Card";
import { equipSlotLabel } from "@/lib/paperDoll";
import type { InventoryItem } from "@/types/character";

interface EquippedItemsCardProps {
  inventory: InventoryItem[];
}

// Read-only glance at what the character has equipped, by slot. Placement and
// equip/unequip live on the Inventory tab; this only reflects current standing.
export default function EquippedItemsCard({ inventory }: EquippedItemsCardProps) {
  const equipped = inventory.filter((item) => item.equippedSlot);

  return (
    <Card title="Equipped">
      {equipped.length === 0 ? (
        <p className="px-4 py-3 text-sm text-parchment-600">Nothing equipped.</p>
      ) : (
        <ul className="divide-y divide-parchment-200">
          {equipped.map((item) => (
            <li key={item.id} className="flex items-center gap-2 px-4 py-1.5 text-sm">
              <span className="font-medium text-parchment-900">{item.name}</span>
              <span className="ml-auto text-xs text-parchment-600">
                {equipSlotLabel(item.equippedSlot!)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
