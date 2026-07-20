// One selectable option row in a Choose-N step (#896). Presentational only —
// selection/disable logic lives in ChoiceStep.

import type { ChoiceOption } from "@/lib/levelUpChoices";

export default function ChoiceOptionCard({
  option,
  selected,
  disabled,
  onToggle,
}: {
  option: ChoiceOption;
  selected: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => onToggle(option.id)}
        className={`w-full rounded-card border px-4 py-3 text-left transition-colors ${
          selected
            ? "border-garnet-600 bg-garnet-50 ring-2 ring-garnet-300"
            : "border-parchment-300 bg-parchment-50 hover:border-garnet-400 hover:bg-parchment-100"
        } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-parchment-300 disabled:hover:bg-parchment-50`}
      >
        <span className="block text-sm font-semibold text-parchment-900">
          {option.name}
          {option.tag && <span className="ml-1.5 text-[10px] font-normal text-parchment-500">{option.tag}</span>}
        </span>
        {option.description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-parchment-600">
            {option.description}
          </span>
        )}
      </button>
    </li>
  );
}
