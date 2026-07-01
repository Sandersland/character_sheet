export default function LevelUpCallout({
  pendingLevelUps,
  pending,
  onLevelUp,
}: {
  pendingLevelUps: number;
  pending: boolean;
  onLevelUp: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-gold-300 bg-gold-50 px-3 py-2">
      <span className="text-sm font-semibold text-gold-800">
        {pendingLevelUps === 1
          ? "Level up available!"
          : `${pendingLevelUps} level-ups available!`}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={onLevelUp}
        className="rounded-control bg-gold-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-gold-800 disabled:cursor-not-allowed disabled:bg-parchment-200 disabled:text-parchment-400 disabled:hover:bg-parchment-200"
      >
        Level up
      </button>
    </div>
  );
}
