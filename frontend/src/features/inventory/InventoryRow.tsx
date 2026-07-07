import { ChevronDown } from "lucide-react";
import { useReducer } from "react";

import { hasItemProse, itemDetailParts } from "@/lib/itemDetails";
import { isEquippable } from "@/lib/items";
import type { InventoryItem, InventoryOperation } from "@/types/character";
import OverflowMenu from "@/components/ui/OverflowMenu";
import ActivateControl from "@/features/inventory/ActivateControl";
import AttuneToggle from "@/features/inventory/AttuneToggle";
import EquipToggle from "@/features/inventory/EquipToggle";
import InventoryEditForm from "@/features/inventory/InventoryEditForm";
import ItemProse from "@/features/inventory/ItemProse";
import ItemSummary from "@/features/inventory/ItemSummary";

interface InventoryRowProps {
  item: InventoryItem;
  mode: "view" | "edit";
  pending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  // True when 3 items are already attuned — gates a new attune (5e cap).
  atCap?: boolean;
  // Multi-select sell mode: a leading checkbox replaces the per-row actions.
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

// View-mode local UI state: prose disclosure + the two-step remove confirm.
interface RowState {
  expanded: boolean;
  confirming: boolean;
}
type RowAction = "toggleExpand" | "confirmRemove" | "cancelRemove";

function rowReducer(state: RowState, action: RowAction): RowState {
  switch (action) {
    case "toggleExpand":
      return { ...state, expanded: !state.expanded };
    case "confirmRemove":
      return { ...state, confirming: true };
    case "cancelRemove":
      return { ...state, confirming: false };
  }
}

// One inventory row: read-only display (Equip toggle + a kebab for Edit/Remove, prose disclosed on expand) or an inline edit form.
export default function InventoryRow({
  item,
  mode,
  pending,
  onEdit,
  onCancel,
  onSubmit,
  atCap = false,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: InventoryRowProps) {
  const [state, dispatch] = useReducer(rowReducer, { expanded: false, confirming: false });

  if (mode === "edit") {
    return <InventoryEditForm item={item} pending={pending} onCancel={onCancel} onSubmit={onSubmit} />;
  }

  const details = itemDetailParts(item);
  const hasProse = hasItemProse(item);

  return (
    <li className="flex flex-col gap-1.5 py-2">
      <div className="flex items-start justify-between gap-3">
        <ItemSummary
          item={item}
          details={details}
          selectMode={selectMode}
          selected={selected}
          onToggleSelect={onToggleSelect}
        />
        {!selectMode && (
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {hasProse && (
            <button
              type="button"
              aria-expanded={state.expanded}
              aria-label={state.expanded ? "Hide details" : "Show details"}
              onClick={() => dispatch("toggleExpand")}
              className="flex h-7 w-7 items-center justify-center rounded-control text-parchment-500 transition-colors hover:bg-parchment-200 hover:text-parchment-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
            >
              <ChevronDown
                aria-hidden="true"
                className={`h-4 w-4 transition-transform ${state.expanded ? "rotate-180" : ""}`}
              />
            </button>
          )}
          {isEquippable(item.category) && (
            <EquipToggle item={item} pending={pending} onSubmit={onSubmit} />
          )}
          {item.requiresAttunement && (
            <AttuneToggle item={item} pending={pending} atCap={atCap} onSubmit={onSubmit} />
          )}
          <OverflowMenu
            label={`Actions for ${item.name}`}
            items={[
              { label: "Edit", onSelect: onEdit },
              {
                label: "Remove",
                onSelect: () => dispatch("confirmRemove"),
                danger: true,
                separatorBefore: true,
              },
            ]}
          />
        </div>
        )}
      </div>

      {!selectMode && state.confirming && (
        <div className="flex items-center justify-end gap-3 text-xs">
          <span className="text-parchment-700">Remove {item.name}?</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => onSubmit([{ type: "remove", inventoryItemId: item.id }])}
            className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => dispatch("cancelRemove")}
            className="font-semibold text-parchment-600 hover:underline disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      )}

      {!selectMode && item.activated && (
        <ActivateControl item={item} pending={pending} onSubmit={onSubmit} />
      )}

      {!selectMode && state.expanded && hasProse && <ItemProse item={item} />}
    </li>
  );
}
