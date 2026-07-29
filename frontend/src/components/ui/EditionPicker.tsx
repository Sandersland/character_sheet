import { useId } from "react";

import type { RulesEdition } from "@character-sheet/shared-types";

import { useRovingRadioGroup } from "@/hooks/useRovingRadioGroup";
import type { EditionOption } from "@/types/character";

interface EditionPickerProps {
  /** The served rows (#1436). Rendered in the order given — that is now the whole
   *  contract; this component holds no order of its own and no copy tables. */
  rows: EditionOption[];
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

/**
 * Radio-card picker for the supported rules editions (#1286). Reuses the #1111
 * roving-tabIndex hook (see SubclassStep/FeatFlow) rather than a fourth
 * hand-rolled implementation (#1324 tracks consolidating all of them).
 *
 * Every passed row displays — one carrying `unavailableReason` still shows,
 * muted and inert, so an existing campaign on that edition still reads as a real
 * option on the roadmap (#1371) — but only the rows without a reason are roved
 * over or fired for. A caller whose rows haven't arrived must render nothing at
 * all rather than an empty or fallback-valued picker: the value written here is
 * irreversible (see CampaignsPage and CreationEntryGate).
 */
export default function EditionPicker({ rows, value, onChange, label = "Rules edition" }: EditionPickerProps) {
  const reasonIdPrefix = useId();
  const selectable = rows.filter((row) => !row.unavailableReason);
  const checkedIndex = selectable.findIndex((row) => row.key === value);
  const { itemRef, tabIndexFor, keyDownFor } = useRovingRadioGroup(selectable.length, checkedIndex, (index) =>
    onChange(selectable[index].key),
  );

  return (
    <div role="radiogroup" aria-label={label} className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => {
        const selected = row.key === value;
        if (row.unavailableReason) {
          // Per-row id: one shared useId would collide the moment a second
          // edition is gated, and duplicate ids break aria-describedby silently.
          const reasonId = `${reasonIdPrefix}-${row.key}`;
          return (
            <button
              key={row.key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled="true"
              aria-label={row.label}
              aria-describedby={reasonId}
              tabIndex={-1}
              title={row.unavailableReason}
              className={`${CARD_BASE} ${CARD_UNAVAILABLE}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-display text-base font-semibold text-parchment-500">{row.label}</span>
                <span className="rounded-full bg-parchment-200 px-2 py-0.5 text-xs font-semibold text-parchment-600">
                  Not available yet
                </span>
              </span>
              <span className="text-sm text-parchment-500">{row.description}</span>
              <span id={reasonId} className="sr-only">
                {row.unavailableReason}
              </span>
            </button>
          );
        }

        // Keyed rather than indexOf(row) for the same reason as checkedIndex
        // above: `key` is what makes a row unique, so neither lookup depends on
        // object identity. (indexOf would also work — `selectable` is filtered
        // from this same `rows` array — but two different strategies within 40
        // lines invites "fixing" the one that looks wrong.)
        const rovingIndex = selectable.findIndex((candidate) => candidate.key === row.key);
        return (
          <button
            key={row.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={row.label}
            tabIndex={tabIndexFor(rovingIndex)}
            ref={itemRef(rovingIndex)}
            onClick={() => onChange(row.key)}
            onKeyDown={keyDownFor(rovingIndex)}
            className={`${CARD_BASE} ${selected ? CARD_SELECTED : CARD_IDLE}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-display text-base font-semibold text-parchment-900">{row.label}</span>
              <span
                aria-hidden
                className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
                  selected ? "border-garnet-600 bg-garnet-600" : "border-parchment-400"
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
