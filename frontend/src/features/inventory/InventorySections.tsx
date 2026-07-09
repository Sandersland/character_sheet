import type { InventoryOperation } from "@/types/character";
import { ITEM_CATEGORY_ICONS } from "@/components/ui/icons";
import InventoryRow from "@/features/inventory/InventoryRow";
import { formatWeight, type InventorySection } from "@/lib/inventorySections";
import { itemCategoryLabel } from "@/lib/items";

interface InventorySectionsProps {
  sections: InventorySection[];
  editingId: string | null;
  pending: boolean;
  atCap: boolean;
  selectMode: boolean;
  selectedIds: Set<string>;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  onToggleSelect: (id: string) => void;
}

// The scrollable, category-sectioned list of inventory rows.
export default function InventorySections({
  sections,
  editingId,
  pending,
  atCap,
  selectMode,
  selectedIds,
  onEdit,
  onCancelEdit,
  onSubmit,
  onToggleSelect,
}: InventorySectionsProps) {
  if (sections.length === 0) {
    return <p className="py-8 text-center text-sm text-parchment-600">No items match your search.</p>;
  }
  return (
    <div className="max-h-96 overflow-y-auto">
      {sections.map((section) => {
        const CategoryIcon = ITEM_CATEGORY_ICONS[section.category];
        return (
          <section key={section.category} className="pt-3 first:pt-0">
            <h4 className="sticky top-0 z-10 inline-flex w-full items-center gap-1.5 border-b border-parchment-200 bg-parchment-50 py-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
              <CategoryIcon aria-hidden="true" className="text-sm" />
              {itemCategoryLabel(section.category)} · {section.items.length} ·{" "}
              {formatWeight(section.weight)} lb
            </h4>
            <ul className="flex flex-col divide-y divide-parchment-200">
              {section.items.map((item) => (
                <InventoryRow
                  key={item.id}
                  item={item}
                  mode={editingId === item.id ? "edit" : "view"}
                  pending={pending}
                  onEdit={() => onEdit(item.id)}
                  onCancel={onCancelEdit}
                  onSubmit={onSubmit}
                  atCap={atCap}
                  selectMode={selectMode}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={() => onToggleSelect(item.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
