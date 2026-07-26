import type { RulesEdition } from "@character-sheet/shared-types";

import { useRovingRadioGroup } from "@/hooks/useRovingRadioGroup";
import { EDITION_DESCRIPTIONS, EDITION_LABELS, RULES_EDITIONS } from "@/lib/editionCopy";

interface EditionPickerProps {
  value: RulesEdition;
  onChange: (edition: RulesEdition) => void;
  /** Overrides the radiogroup's accessible name (defaults to "Rules edition"). */
  label?: string;
}

const CARD_BASE =
  "flex flex-col gap-1 rounded border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-garnet-400";
const CARD_SELECTED = "border-garnet-600 bg-parchment-50 ring-2 ring-garnet-50";
const CARD_IDLE = "border-parchment-300 bg-parchment-50 hover:border-garnet-400";

/**
 * Radio-card picker for the two supported rules editions (#1286). Reuses the
 * #1111 roving-tabIndex hook (see SubclassStep/FeatFlow) rather than a fourth
 * hand-rolled implementation (#1324 tracks consolidating all of them).
 */
export default function EditionPicker({ value, onChange, label = "Rules edition" }: EditionPickerProps) {
  const checkedIndex = RULES_EDITIONS.indexOf(value);
  const { itemRef, tabIndexFor, keyDownFor } = useRovingRadioGroup(RULES_EDITIONS.length, checkedIndex, (index) =>
    onChange(RULES_EDITIONS[index]),
  );

  return (
    <div role="radiogroup" aria-label={label} className="grid gap-3 sm:grid-cols-2">
      {RULES_EDITIONS.map((edition, i) => {
        const selected = edition === value;
        return (
          <button
            key={edition}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={EDITION_LABELS[edition]}
            tabIndex={tabIndexFor(i)}
            ref={itemRef(i)}
            onClick={() => onChange(edition)}
            onKeyDown={keyDownFor(i)}
            className={`${CARD_BASE} ${selected ? CARD_SELECTED : CARD_IDLE}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-display text-base font-semibold text-parchment-900">
                {EDITION_LABELS[edition]}
              </span>
              <span
                aria-hidden
                className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
                  selected ? "border-garnet-600 bg-garnet-600" : "border-parchment-400"
                }`}
              />
            </span>
            <span className="text-sm text-parchment-600">{EDITION_DESCRIPTIONS[edition]}</span>
          </button>
        );
      })}
    </div>
  );
}
