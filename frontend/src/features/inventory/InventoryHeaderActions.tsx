import SellModeActions from "@/features/inventory/SellModeActions";

interface InventoryHeaderActionsProps {
  selectMode: boolean;
  configuringSell: boolean;
  selectedCount: number;
  selectedGp: number;
  pending: boolean;
  hasItems: boolean;
  addOpen: boolean;
  onStartConfiguring: () => void;
  onExitSelect: () => void;
  onEnterSelect: () => void;
  onToggleAdd: () => void;
}

// The Card title accessory: the select-mode sell bar, or the default Sell/Add buttons.
export default function InventoryHeaderActions({
  selectMode,
  configuringSell,
  selectedCount,
  selectedGp,
  pending,
  hasItems,
  addOpen,
  onStartConfiguring,
  onExitSelect,
  onEnterSelect,
  onToggleAdd,
}: InventoryHeaderActionsProps) {
  if (selectMode) {
    return (
      <SellModeActions
        configuringSell={configuringSell}
        selectedCount={selectedCount}
        selectedGp={selectedGp}
        pending={pending}
        onStartConfiguring={onStartConfiguring}
        onExitSelect={onExitSelect}
      />
    );
  }

  return (
    <div className="flex items-center gap-2">
      {hasItems && (
        <>
          <button
            type="button"
            onClick={onEnterSelect}
            className="text-xs font-semibold text-garnet-700 hover:underline"
          >
            Sell items
          </button>
          <span className="text-parchment-300">·</span>
        </>
      )}
      <button
        type="button"
        onClick={onToggleAdd}
        className="text-xs font-semibold text-garnet-700 hover:underline"
      >
        {addOpen ? "Cancel" : "+ Add item"}
      </button>
    </div>
  );
}
