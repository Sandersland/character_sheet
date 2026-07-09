interface CreateActionsProps {
  isValid: boolean;
  submitting: boolean;
  submitError: boolean;
  missing: string[];
  onSave: () => void;
  onStartOver: () => void;
}

export default function CreateActions({
  isValid,
  submitting,
  submitError,
  missing,
  onSave,
  onStartOver,
}: CreateActionsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!isValid || submitting}
          onClick={onSave}
          title={isValid ? undefined : `Still needed before you can save: ${missing.join(", ")}`}
          className="rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save Character"}
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="rounded-control border border-parchment-300 px-3 py-2 text-sm font-semibold text-parchment-600 transition-colors hover:border-garnet-400 hover:text-garnet-700"
        >
          Start over
        </button>
        {submitError && (
          <p className="text-xs font-semibold text-garnet-700">
            Couldn't save — check the form and try again.
          </p>
        )}
      </div>

      {!isValid && (
        <div
          role="status"
          className="rounded-control border border-parchment-300 bg-parchment-50 px-3 py-2 text-sm text-parchment-700"
        >
          <p className="font-semibold text-parchment-800">Still needed before you can save:</p>
          <ul className="mt-1 list-disc pl-5">
            {missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
