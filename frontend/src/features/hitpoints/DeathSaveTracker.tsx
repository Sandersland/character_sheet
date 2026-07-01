interface DeathSaves {
  successes: number;
  failures: number;
}

function DeathSavePips({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "success" | "failure";
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-xs text-parchment-600">{label}:</span>
      <div className="flex gap-1.5">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            aria-hidden="true"
            className={`h-4 w-4 rounded-full border ${
              i < count
                ? tone === "success"
                  ? "border-arcane-600 bg-arcane-500"
                  : "border-garnet-700 bg-garnet-600"
                : "border-parchment-400 bg-parchment-100"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function DeathSaveTracker({
  deathSaves,
  pending,
  onRollDeathSave,
  onStabilize,
}: {
  deathSaves: DeathSaves;
  pending: boolean;
  onRollDeathSave: () => void;
  onStabilize: () => void;
}) {
  return (
    <div className="rounded-card border border-garnet-300 bg-garnet-50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-garnet-800">
        {deathSaves.failures >= 3
          ? "Character Dead"
          : deathSaves.successes === 0 && deathSaves.failures === 0 && !pending
            ? "Unconscious — Roll Death Saves"
            : "Death Saves"}
      </p>
      <div className="flex flex-col gap-1.5">
        <DeathSavePips label="Successes" count={deathSaves.successes} tone="success" />
        <DeathSavePips label="Failures" count={deathSaves.failures} tone="failure" />
      </div>
      {deathSaves.failures < 3 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onRollDeathSave}
            className="rounded-control bg-garnet-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:cursor-not-allowed disabled:bg-parchment-200 disabled:text-parchment-400 disabled:hover:bg-parchment-200"
          >
            Roll death save (d20)
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onStabilize}
            className="text-sm font-semibold text-garnet-700 hover:underline disabled:opacity-50"
          >
            Stabilize
          </button>
        </div>
      )}
    </div>
  );
}
