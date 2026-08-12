import { useReducer } from "react";

import { hasItemProse, itemDetailParts } from "@/lib/itemDetails";
import type { InventoryItem, InventoryOperation } from "@/types/character";
import OverflowMenu from "@/components/ui/OverflowMenu";
import ActivateControl from "@/features/inventory/ActivateControl";
import InventoryEditForm from "@/features/inventory/InventoryEditForm";
import InventoryRowControls from "@/features/inventory/InventoryRowControls";
import InventoryRowExpandToggle from "@/features/inventory/InventoryRowExpandToggle";
import InventoryRowRemoveConfirm from "@/features/inventory/InventoryRowRemoveConfirm";
import ItemProse from "@/features/inventory/ItemProse";
import ItemSummary from "@/features/inventory/ItemSummary";
import { NULL_WEAPON_BOND_PROPS, type WeaponBondProps } from "@/lib/weaponBond";

interface InventoryRowProps {
  item: InventoryItem;
  mode: "view" | "edit";
  pending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  // True when 3 items are already attuned — gates a new attune (5e cap).
  atCap?: boolean;
  // Bundled Weapon Bond props (#1854) — see WeaponBondProps' own comment.
  // Defaults to an ineligible no-op so callers that never touch Weapon Bond
  // (most InventoryRow.test.tsx cases) don't have to pass it.
  bond?: WeaponBondProps;
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
  bond = NULL_WEAPON_BOND_PROPS,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: InventoryRowProps) {
  const [state, dispatch] = useReducer(rowReducer, { expanded: false, confirming: false });

  if (mode === "edit") {
    return <InventoryEditForm item={item} pending={pending} onCancel={onCancel} onSubmit={onSubmit} />;
  }

  const details = itemDetailParts(item);

  // Multi-select sell mode: the row is just a checkbox + summary — none of
  // the per-item controls/remove-confirm/activate/prose below apply, so this
  // returns early rather than gating each of them on `!selectMode` (#1854:
  // one branch here replaces four repeated `!selectMode &&` checks, keeping
  // the view-mode body's own cyclomatic/cognitive score under the fallow gate).
  if (selectMode) {
    return (
      <li className="flex flex-col gap-1.5 py-2">
        <div className="flex items-start justify-between gap-3">
          <ItemSummary item={item} details={details} selectMode selected={selected} onToggleSelect={onToggleSelect} />
        </div>
      </li>
    );
  }

  const hasProse = hasItemProse(item);

  return (
    <li className="flex flex-col gap-1.5 py-2">
      <div className="flex items-start justify-between gap-3">
        <ItemSummary item={item} details={details} selectMode={false} selected={false} />
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {hasProse && (
            <InventoryRowExpandToggle expanded={state.expanded} onToggle={() => dispatch("toggleExpand")} />
          )}
          <InventoryRowControls item={item} pending={pending} atCap={atCap} onSubmit={onSubmit} bond={bond} />
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
      </div>

      {state.confirming && (
        <InventoryRowRemoveConfirm
          itemName={item.name}
          pending={pending}
          onConfirm={() => onSubmit([{ type: "remove", inventoryItemId: item.id }])}
          onCancel={() => dispatch("cancelRemove")}
        />
      )}

      {item.activated && <ActivateControl item={item} pending={pending} onSubmit={onSubmit} />}

      {state.expanded && hasProse && <ItemProse item={item} />}
    </li>
  );
}
