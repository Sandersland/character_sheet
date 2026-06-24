/**
 * FightingStylePanel — inline expand-in-place picker for choosing the Fighter's
 * Fighting Style (L1 feature). Not a modal — follows the same "inline panel,
 * collapsed by default" pattern as AddConditionPanel. The style list is static
 * rules data (FIGHTING_STYLE_OPTIONS from lib/fightingStyles.ts), so there's
 * nothing to fetch. All display text resolves through the label data — a raw
 * style key is never rendered.
 */

import { useState } from "react";

import { FIGHTING_STYLE_OPTIONS, fightingStyleLabel } from "@/lib/fightingStyles";
import type { FightingStyleKey } from "@/types/character";

interface Props {
  /** The currently chosen style, or null/undefined if unchosen. */
  current: FightingStyleKey | null | undefined;
  busy: boolean;
  onChoose: (key: FightingStyleKey) => void;
}

export default function FightingStylePanel({ current, busy, onChoose }: Props) {
  const [open, setOpen] = useState(false);

  function handleChoose(key: FightingStyleKey) {
    onChoose(key);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="self-start rounded-control border border-dashed border-gold-400 px-3 py-1.5 text-xs font-semibold text-gold-700 hover:border-gold-600 hover:bg-gold-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {current ? `Change fighting style (${fightingStyleLabel(current)})` : "+ Choose a fighting style"}
      </button>
    );
  }

  return (
    <div className="mt-1 rounded-card border border-gold-200 bg-gold-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gold-900">Choose a Fighting Style</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-parchment-400 hover:text-parchment-700"
          aria-label="Close fighting style panel"
        >
          ✕
        </button>
      </div>

      <ul className="max-h-72 overflow-y-auto">
        {FIGHTING_STYLE_OPTIONS.map((style) => {
          const isCurrent = style.key === current;
          return (
            <li
              key={style.key}
              className="flex items-start justify-between gap-3 border-b border-gold-100 py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-parchment-900">{style.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-parchment-500">
                  {style.description}
                </p>
              </div>
              <button
                type="button"
                disabled={busy || isCurrent}
                onClick={() => handleChoose(style.key)}
                className="shrink-0 rounded bg-gold-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-40"
                title={`Choose ${style.label}`}
              >
                {isCurrent ? "Chosen" : "Choose"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
