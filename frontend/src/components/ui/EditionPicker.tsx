import { useId } from "react";

import type { RulesEdition } from "@character-sheet/shared-types";

import { useRovingRadioGroup } from "@/hooks/useRovingRadioGroup";
import { EDITION_DESCRIPTIONS, EDITION_LABELS, EDITION_UNAVAILABLE, RULES_EDITIONS } from "@/lib/editionCopy";

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
// No pointer-events-none: it would also suppress the `title` tooltip, and — with
// no stylesheet loaded in jsdom — that failure is invisible to every test (#1371).
const CARD_UNAVAILABLE = "border-parchment-200 bg-parchment-100 cursor-not-allowed";

// Editions not in EDITION_UNAVAILABLE — the only ones the roving group may land
// on or fire onChange for (#1371).
const selectable = RULES_EDITIONS.filter((edition) => !EDITION_UNAVAILABLE[edition]);

/**
 * Radio-card picker for the two supported rules editions (#1286). Reuses the
 * #1111 roving-tabIndex hook (see SubclassStep/FeatFlow) rather than a fourth
 * hand-rolled implementation (#1324 tracks consolidating all of them). Renders
 * every edition in RULES_EDITIONS (an unavailable one still displays, muted and
 * inert, so an existing campaign on that edition still reads as a real option
 * on the roadmap — see EDITION_UNAVAILABLE), but only rove/onChange over the
 * selectable subset (#1371).
 */
export default function EditionPicker({ value, onChange, label = "Rules edition" }: EditionPickerProps) {
  const reasonId = useId();
  const checkedIndex = selectable.indexOf(value);
  const { itemRef, tabIndexFor, keyDownFor } = useRovingRadioGroup(selectable.length, checkedIndex, (index) =>
    onChange(selectable[index]),
  );

  return (
    <div role="radiogroup" aria-label={label} className="grid gap-3 sm:grid-cols-2">
      {RULES_EDITIONS.map((edition) => {
        const selected = edition === value;
        const reason = EDITION_UNAVAILABLE[edition];
        if (reason) {
          return (
            <button
              key={edition}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled="true"
              aria-label={EDITION_LABELS[edition]}
              aria-describedby={reasonId}
              tabIndex={-1}
              title={reason}
              className={`${CARD_BASE} ${CARD_UNAVAILABLE}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-display text-base font-semibold text-parchment-500">
                  {EDITION_LABELS[edition]}
                </span>
                <span className="rounded-full bg-parchment-200 px-2 py-0.5 text-xs font-semibold text-parchment-600">
                  Not available yet
                </span>
              </span>
              <span className="text-sm text-parchment-500">{EDITION_DESCRIPTIONS[edition]}</span>
              <span id={reasonId} className="sr-only">
                {reason}
              </span>
            </button>
          );
        }

        const rovingIndex = selectable.indexOf(edition);
        return (
          <button
            key={edition}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={EDITION_LABELS[edition]}
            tabIndex={tabIndexFor(rovingIndex)}
            ref={itemRef(rovingIndex)}
            onClick={() => onChange(edition)}
            onKeyDown={keyDownFor(rovingIndex)}
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
