import type { Character, Currency, InventoryItem, InventoryOperation } from "@/types/character";
import EmptyState from "@/components/ui/EmptyState";
import { GiKnapsack } from "@/components/ui/icons";
import InventoryContent from "@/features/inventory/InventoryContent";
import SellPanel from "@/features/inventory/SellPanel";
import { type SellLine } from "@/lib/bulkSell";
import { type InventorySection } from "@/lib/inventorySections";

interface InventoryBodyProps {
  character: Character;
  configuringSell: boolean;
  selectedItems: InventoryItem[];
  pending: boolean;
  hasItems: boolean;
  view: "bag" | "worn";
  sections: InventorySection[];
  editingId: string | null;
  atCap: boolean;
  selectMode: boolean;
  selectedIds: Set<string>;
  onConfirmSell: (lines: SellLine[], prices: Record<string, Currency>) => void;
  onCancelSell: () => void;
  onAddItem: () => void;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onToggleSelect: (id: string) => void;
}

// Picks the inventory content region: sell panel, empty state, or the pack view.
export default function InventoryBody({
  configuringSell,
  selectedItems,
  pending,
  hasItems,
  onConfirmSell,
  onCancelSell,
  onAddItem,
  ...content
}: InventoryBodyProps) {
  if (configuringSell) {
    return (
      <SellPanel items={selectedItems} pending={pending} onConfirm={onConfirmSell} onCancel={onCancelSell} />
    );
  }

  if (!hasItems) {
    // Empty state wins over the view: if the last item is removed while on the
    // Worn tab (the Segmented toggle is hidden when !hasItems), fall back to the
    // Add-item CTA rather than stranding the user on an empty doll.
    return (
      <EmptyState
        icon={<GiKnapsack />}
        title="Your pack is empty"
        description="Add gear, weapons, and treasure to track what you're carrying."
        action={{ label: "+ Add item", onClick: onAddItem }}
      />
    );
  }

  return <InventoryContent pending={pending} {...content} />;
}
