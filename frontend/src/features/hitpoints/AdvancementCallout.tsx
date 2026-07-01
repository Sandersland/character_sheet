export default function AdvancementCallout({
  onGoToAdvancements,
}: {
  onGoToAdvancements: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-arcane-300 bg-arcane-50 px-3 py-2">
      <span className="text-sm font-semibold text-arcane-800">
        New advancement slot! Choose an ASI or feat.
      </span>
      <button
        type="button"
        onClick={onGoToAdvancements}
        className="rounded-control bg-arcane-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-arcane-800"
      >
        Go to Advancements
      </button>
    </div>
  );
}
