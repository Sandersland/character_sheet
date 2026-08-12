interface InventoryRowRemoveConfirmProps {
  itemName: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// The two-step Remove confirm bar shown under a row once the kebab's Remove
// item is chosen — kept as its own component, not inlined into InventoryRow,
// so InventoryRow's own cyclomatic/cognitive score stays under the fallow
// complexity gate (.fallowrc.jsonc).
export default function InventoryRowRemoveConfirm({
  itemName,
  pending,
  onConfirm,
  onCancel,
}: InventoryRowRemoveConfirmProps) {
  return (
    <div className="flex items-center justify-end gap-3 text-xs">
      <span className="text-parchment-700">Remove {itemName}?</span>
      <button
        type="button"
        disabled={pending}
        onClick={onConfirm}
        className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
      >
        Confirm
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onCancel}
        className="font-semibold text-parchment-600 hover:underline disabled:opacity-40"
      >
        Cancel
      </button>
    </div>
  );
}
