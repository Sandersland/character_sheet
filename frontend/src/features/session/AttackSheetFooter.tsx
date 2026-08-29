interface AttackSheetFooterProps {
  preRoll: boolean;
  attacksRemain: boolean;
  onCancel: () => void;
  onClose: () => void;
  refundLabel?: string;
}

export default function AttackSheetFooter({
  preRoll,
  attacksRemain,
  onCancel,
  onClose,
  refundLabel = "Cancel — refund action",
}: AttackSheetFooterProps) {
  const label = preRoll ? refundLabel : attacksRemain ? "Close" : "Done";
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
