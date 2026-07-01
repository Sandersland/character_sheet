import type { InventoryItem } from "@/types/character";

interface ItemProseProps {
  item: InventoryItem;
}

// The disclosed prose body: description, consumable effect text, and notes.
export default function ItemProse({ item }: ItemProseProps) {
  return (
    <div className="flex flex-col gap-1 pl-0.5">
      {item.description && <p className="text-xs text-parchment-600">{item.description}</p>}
      {item.consumable?.effectDescription && (
        <p className="text-xs text-parchment-600">{item.consumable.effectDescription}</p>
      )}
      {item.notes && <p className="text-xs italic text-parchment-600">{item.notes}</p>}
    </div>
  );
}
