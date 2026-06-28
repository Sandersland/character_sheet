/**
 * AddConditionPanel — inline expand-in-place picker for applying a status
 * condition. Not a modal — follows the same "inline panel, collapsed by
 * default" pattern as AddManeuverPanel. The condition list is static rules data
 * (CONDITION_OPTIONS from lib/conditions.ts), so there's nothing to fetch.
 */

import { useState } from "react";

import { CONDITION_OPTIONS } from "@/lib/conditions";
import type { ApplyConditionOperation, ConditionKey } from "@/types/character";

interface Props {
  /** Keys already active — filtered out of the picker. */
  activeKeys: ConditionKey[];
  busy: boolean;
  onApply: (op: ApplyConditionOperation) => void;
}

export default function AddConditionPanel({ activeKeys, busy, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");

  function handleApply(key: ConditionKey) {
    const trimmed = source.trim();
    onApply({
      type: "applyCondition",
      key,
      ...(trimmed ? { source: trimmed } : {}),
    });
  }

  const activeSet = new Set(activeKeys);
  const available = CONDITION_OPTIONS.filter((c) => {
    if (activeSet.has(c.key)) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="self-start rounded-control border border-dashed border-gold-400 px-3 py-1.5 text-xs font-semibold text-gold-700 hover:border-gold-600 hover:bg-gold-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        + Add condition
      </button>
    );
  }

  return (
    <div className="mt-1 rounded-card border border-gold-200 bg-gold-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gold-900">Apply a Condition</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-parchment-600 hover:text-parchment-700"
          aria-label="Close condition panel"
        >
          ✕
        </button>
      </div>

      <input
        type="search"
        placeholder="Filter conditions…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-control border border-parchment-300 bg-white px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
      />

      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-semibold text-gold-900">Source</span>
        <input
          type="text"
          placeholder="Giant Spider"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="w-full rounded-control border border-parchment-300 bg-white px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
        />
      </label>

      {available.length === 0 ? (
        <p className="py-2 text-center text-xs text-parchment-600">
          {search ? "No conditions match your search." : "All conditions already applied."}
        </p>
      ) : (
        <ul className="max-h-72 overflow-y-auto">
          {available.map((condition) => (
            <li
              key={condition.key}
              className="flex items-start justify-between gap-3 border-b border-gold-100 py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-parchment-900">{condition.label}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-parchment-600">
                  {condition.description}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleApply(condition.key)}
                className="shrink-0 rounded bg-gold-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-40"
                title={`Apply ${condition.label}`}
              >
                Apply
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
