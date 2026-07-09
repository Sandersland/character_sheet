import type { Currency } from "@/types/character";

interface CurrencyEditFormProps {
  currency: Currency;
  pending: boolean;
  error: boolean;
  onChange: (currency: Currency) => void;
  onSave: () => void;
  onCancel: () => void;
}

const inputClass =
  "rounded-control border border-parchment-300 bg-parchment-50 px-1.5 py-0.5 text-xs tabular-nums";

// The purse's denomination inputs + Save/Cancel; state lives in CurrencyEditor.
export default function CurrencyEditForm({
  currency,
  pending,
  error,
  onChange,
  onSave,
  onCancel,
}: CurrencyEditFormProps) {
  return (
    <div className="flex flex-col gap-2 border-t border-parchment-200 pt-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-parchment-600">
        {(["pp", "gp", "sp", "cp"] as const).map((denomination) => (
          <label key={denomination} className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              className={`${inputClass} w-14`}
              value={currency[denomination]}
              onChange={(e) => onChange({ ...currency, [denomination]: Number(e.target.value) })}
            />
            {denomination}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs">
        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="rounded-control bg-arcane-700 px-2.5 py-1 font-semibold text-parchment-50 transition-colors hover:bg-arcane-800 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
        >
          Cancel
        </button>
        {error && <span className="text-garnet-700">Couldn't save.</span>}
      </div>
    </div>
  );
}
