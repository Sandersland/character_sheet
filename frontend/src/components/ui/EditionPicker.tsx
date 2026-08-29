import type { RulesEdition } from "@character-sheet/shared-types";

import { useRovingRadioGroup } from "@/hooks/useRovingRadioGroup";
import type { EditionOption } from "@/types/character";

interface EditionPickerProps {
  // Rendered in the order given; this component holds no order or copy of its own.
  rows: EditionOption[];
  value: RulesEdition;
  onChange: (edition: RulesEdition) => void;
  label?: string;
}

const CARD_BASE =
  "flex flex-col gap-1 rounded border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-garnet-400";
const CARD_SELECTED = "border-garnet-600 bg-parchment-50 ring-2 ring-garnet-50";
const CARD_IDLE = "border-parchment-300 bg-parchment-50 hover:border-garnet-400";

// A caller whose rows haven't arrived must render nothing rather than an empty
// or fallback-valued picker: the value written here is irreversible (see
// CampaignsPage and CreationEntryGate).
export default function EditionPicker({ rows, value, onChange, label = "Rules edition" }: EditionPickerProps) {
  const checkedIndex = rows.findIndex((row) => row.key === value);
  const { itemRef, tabIndexFor, keyDownFor } = useRovingRadioGroup(rows.length, checkedIndex, (index) =>
    onChange(rows[index].key),
  );

  return (
    <div role="radiogroup" aria-label={label} className="grid gap-3 sm:grid-cols-2">
      {rows.map((row, index) => {
        const selected = row.key === value;
        return (
          <button
            key={row.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={row.label}
            tabIndex={tabIndexFor(index)}
            ref={itemRef(index)}
            onClick={() => onChange(row.key)}
            onKeyDown={keyDownFor(index)}
            className={`${CARD_BASE} ${selected ? CARD_SELECTED : CARD_IDLE}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-display text-base font-semibold text-parchment-900">{row.label}</span>
              <span
                aria-hidden
                className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
                  selected ? "border-garnet-600 bg-garnet-soft-surface" : "border-parchment-400"
                }`}
              />
            </span>
            <span className="text-sm text-parchment-600">{row.description}</span>
          </button>
        );
      })}
    </div>
  );
}
