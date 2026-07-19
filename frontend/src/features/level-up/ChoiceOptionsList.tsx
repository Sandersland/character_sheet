// The options region of a Choose-N step (#896): optional filter box, the
// loading/error/empty states, and the selectable rows. Presentational —
// ChoiceStep owns which options and selection state to feed it.

import Spinner from "@/components/ui/Spinner";
import ChoiceOptionCard from "@/features/level-up/ChoiceOptionCard";
import type { ChoiceOption } from "@/lib/levelUpChoices";

export default function ChoiceOptionsList({
  options,
  search,
  onSearch,
  showSearch,
  loadError,
  showSpinner,
  emptyText,
  isSelected,
  isDisabled,
  onToggle,
}: {
  options: ChoiceOption[];
  search: string;
  onSearch: (value: string) => void;
  showSearch: boolean;
  loadError: boolean;
  showSpinner: boolean;
  emptyText: string | null;
  isSelected: (id: string) => boolean;
  isDisabled: (id: string) => boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      {showSearch && (
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter options"
          className="mt-3 w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
        />
      )}

      {loadError && (
        <p role="alert" className="mt-4 text-center text-sm text-garnet-700">
          Couldn't load the choices. Go back and try again.
        </p>
      )}
      {showSpinner && <Spinner />}
      {emptyText && <p className="mt-4 text-center text-sm text-parchment-600">{emptyText}</p>}

      {options.length > 0 && (
        <ul className="mt-3 space-y-2">
          {options.map((option) => (
            <ChoiceOptionCard
              key={option.id}
              option={option}
              selected={isSelected(option.id)}
              disabled={isDisabled(option.id)}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </>
  );
}
