// Attack-sheet footer: Cancel (pre-roll, refunds the action) before any attack
// is rolled, Done afterwards. The "N attacks · no target AC tracked" kicker lives
// in the sheet header (TurnResolutionSheets), not here (#778).

interface AttackSheetFooterProps {
  preRoll: boolean;
  /** Attacks still unspent — the sheet closes to a live Resume, so "Close" (#802). */
  attacksRemain: boolean;
  onCancel: () => void;
  onClose: () => void;
}

export default function AttackSheetFooter({
  preRoll,
  attacksRemain,
  onCancel,
  onClose,
}: AttackSheetFooterProps) {
  const label = preRoll ? "Cancel — refund action" : attacksRemain ? "Close" : "Done";
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <button
        type="button"
        onClick={preRoll ? onCancel : onClose}
        className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
      >
        {label}
      </button>
    </div>
  );
}
