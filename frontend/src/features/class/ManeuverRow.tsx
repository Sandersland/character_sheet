/**
 * ManeuverRow — renders a single known maneuver with an expandable description
 * and a "Forget" action. Purely presentational: no API calls, receives all
 * callbacks from the ClassFeaturesSection orchestrator.
 */

import { useState } from "react";

import type { ManeuverEntry } from "@/types/character";

interface Props {
  entry: ManeuverEntry;
  busy: boolean;
  onForget: (entryId: string) => void;
}

export default function ManeuverRow({ entry, busy, onForget }: Props) {
  const [expanded, setExpanded] = useState(false);

  function handleForget() {
    if (!confirm(`Forget "${entry.name}"?`)) return;
    onForget(entry.id);
  }

  return (
    <li className="border-b border-parchment-200 py-2.5 last:border-0">
      <div className="flex items-start justify-between gap-3">
        {/* Name + toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-baseline gap-1.5 text-left"
          aria-expanded={expanded}
        >
          <span className="text-sm font-semibold text-parchment-900">
            {entry.name}
          </span>
          <span className="text-[10px] text-parchment-400" aria-hidden="true">
            {expanded ? "▲" : "▼"}
          </span>
        </button>

        {/* Forget */}
        <button
          type="button"
          disabled={busy}
          onClick={handleForget}
          className="shrink-0 rounded-control bg-garnet-50 px-2 py-0.5 text-[11px] font-semibold text-garnet-700 hover:bg-garnet-100 disabled:opacity-30"
          title={`Forget ${entry.name}`}
        >
          Forget
        </button>
      </div>

      {/* Expandable description */}
      {expanded && (
        <p className="mt-1.5 pr-2 text-xs leading-relaxed text-parchment-600">
          {entry.description}
        </p>
      )}
    </li>
  );
}
