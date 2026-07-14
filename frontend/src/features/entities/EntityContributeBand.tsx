// Invitation band (#842): every article ends with a prompt to add what you know.
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
        className="rounded-control bg-garnet-700 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-garnet-800"
      >
        Add to this entry
      </button>
    </div>
  );
}
