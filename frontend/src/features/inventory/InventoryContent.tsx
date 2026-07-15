import type { Character, InventoryOperation } from "@/types/character";
import LoadoutList from "@/features/inventory/LoadoutList";
import InventorySections from "@/features/inventory/InventorySections";
import { type InventorySection } from "@/lib/inventorySections";

interface InventoryContentProps {
  character: Character;
  view: "bag" | "worn";
  pending: boolean;
  sections: InventorySection[];
  editingId: string | null;
  atCap: boolean;
  selectMode: boolean;
  selectedIds: Set<string>;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onToggleSelect: (id: string) => void;
}

// The non-empty pack view: the Worn paper-doll or the Bag's sectioned rows.
export default function InventoryContent({
  character,
  view,
  pending,
  sections,
  editingId,
  atCap,
  selectMode,
  selectedIds,
  onSubmit,
  onEdit,
  onCancelEdit,
  onToggleSelect,
}: InventoryContentProps) {
  if (view === "worn") {
    return <LoadoutList character={character} pending={pending} onSubmit={onSubmit} />;
  }
  return (
    <InventorySections
      sections={sections}
      editingId={editingId}
      pending={pending}
      atCap={atCap}
      selectMode={selectMode}
      selectedIds={selectedIds}
      onEdit={onEdit}
      onCancelEdit={onCancelEdit}
      onSubmit={onSubmit}
      onToggleSelect={onToggleSelect}
    />
  );
}
