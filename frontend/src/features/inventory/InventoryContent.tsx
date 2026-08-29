import type { InventoryOperation } from "@/types/character";
import LoadoutList from "@/features/inventory/LoadoutList";
import InventorySections from "@/features/inventory/InventorySections";
import { type InventorySection } from "@/lib/inventorySections";
import type { WeaponBondProps } from "@/lib/weaponBond";

interface InventoryContentProps {
  view: "bag" | "worn";
  pending: boolean;
  sections: InventorySection[];
  editingId: string | null;
  atCap: boolean;
  selectMode: boolean;
  selectedIds: Set<string>;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  bond: WeaponBondProps;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onToggleSelect: (id: string) => void;
}

export default function InventoryContent({
  view,
  pending,
  sections,
  editingId,
  atCap,
  selectMode,
  selectedIds,
  onSubmit,
  bond,
  onEdit,
  onCancelEdit,
  onToggleSelect,
}: InventoryContentProps) {
  if (view === "worn") {
    return <LoadoutList pending={pending} onSubmit={onSubmit} />;
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
      bond={bond}
      onToggleSelect={onToggleSelect}
    />
  );
}
