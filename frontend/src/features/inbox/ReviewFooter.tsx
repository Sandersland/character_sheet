interface ReviewFooterProps {
  onDisregard: () => void;
  onCombine: () => void;
  disregarding: boolean;
  combining: boolean;
  /** Hard-disables Combine when the consequence preview failed to load. */
  combineDisabled?: boolean;
  loserCount: number;
}

// The Review-duplicates modal's confirm footer (#1946) — this feature's only
// confirm surface, so there is no second "are you sure" dialog behind it.
// Combine is atomic (#1942): loserCount is always the full cluster minus the
// survivor — it never shrinks after a failed attempt, since nothing landed.
export default function ReviewFooter({
  onDisregard,
  onCombine,
  disregarding,
  combining,
  combineDisabled = false,
  loserCount,
}: ReviewFooterProps) {
  const entryWord = loserCount === 1 ? "entry" : "entries";
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-garnet-700">This cannot be undone.</p>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onDisregard}
          disabled={disregarding || combining}
          className="text-sm font-semibold text-parchment-600 hover:underline disabled:opacity-40"
        >
          Disregard these
        </button>
        <button
          type="button"
          onClick={onCombine}
          disabled={combining || combineDisabled || loserCount === 0}
          className="rounded-control bg-garnet-surface px-4 py-2 text-sm font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-surface-hover disabled:opacity-50"
        >
          {combining ? "Combining…" : `Combine and delete ${loserCount} ${entryWord}`}
        </button>
      </div>
    </div>
  );
}
