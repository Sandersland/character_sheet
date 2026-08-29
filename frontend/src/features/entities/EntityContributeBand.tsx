export default function EntityContributeBand({
  name,
  onEdit,
}: {
  name: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-parchment-300 bg-parchment-50 px-4 py-3">
      <p className="text-sm text-parchment-700">
        Know something about <span className="font-semibold">{name}</span>?
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="rounded-control bg-garnet-surface px-3 py-1.5 text-xs font-semibold text-garnet-on-surface hover:bg-garnet-surface-hover"
      >
        Add to this entry
      </button>
    </div>
  );
}
