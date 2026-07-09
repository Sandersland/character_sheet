interface SellModeActionsProps {
  configuringSell: boolean;
  selectedCount: number;
  selectedGp: number;
  pending: boolean;
  onStartConfiguring: () => void;
  onExitSelect: () => void;
}

// Title accessory while multi-select sell is active: the selection tally + Sell/Cancel.
export default function SellModeActions({
  configuringSell,
  selectedCount,
  selectedGp,
  pending,
  onStartConfiguring,
  onExitSelect,
}: SellModeActionsProps) {
  if (configuringSell) {
    return (
      <span className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
        Review sale
      </span>
    );
  }
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-parchment-600">
        {selectedCount} selected · ~{selectedGp} gp
      </span>
      <button
        type="button"
        disabled={pending || selectedCount === 0}
        onClick={onStartConfiguring}
        className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
      >
        Sell
      </button>
      <button
        type="button"
        onClick={onExitSelect}
        className="font-semibold text-parchment-600 hover:underline"
      >
        Cancel
      </button>
    </div>
  );
}
