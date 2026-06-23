/**
 * ConditionsStrip — the character's active status-condition chips plus an
 * exhaustion stepper and an inline "add condition" panel. Owns busy + error
 * state, fires API calls through the client module, and propagates the updated
 * Character via onUpdate — same pattern as ClassFeaturesSection / SpellsSection.
 *
 * Mounted near VitalsStrip on both the character sheet and the session page,
 * since conditions are central to live play.
 */

import { useState } from "react";

import { applyConditionTransactions } from "@/api/client";
import {
  CONDITION_DESCRIPTIONS,
  conditionLabel,
  EXHAUSTION_MAX,
  exhaustionEffect,
} from "@/lib/conditions";
import type { Character, ConditionKey, ConditionOperation } from "@/types/character";
import AddConditionPanel from "@/features/conditions/AddConditionPanel";

interface Props {
  character: Character;
  onUpdate: (updated: Character) => void;
}

export default function ConditionsStrip({ character, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conditions = character.conditions ?? { active: [], exhaustion: 0 };
  const { active, exhaustion } = conditions;
  const activeKeys = active.map((c) => c.key);

  async function send(ops: ConditionOperation[]) {
    setBusy(true);
    setError(null);
    try {
      const updated = await applyConditionTransactions(character.id, ops);
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function handleApply(op: ConditionOperation) {
    void send([op]);
  }

  function handleRemove(key: ConditionKey) {
    void send([{ type: "removeCondition", key }]);
  }

  function handleExhaustion(level: number) {
    const clamped = Math.min(EXHAUSTION_MAX, Math.max(0, level));
    if (clamped === exhaustion) return;
    void send([{ type: "setExhaustion", level: clamped }]);
  }

  return (
    <section
      className="rounded-card border border-parchment-200 bg-parchment-50 p-4 shadow-card"
      aria-label="Conditions"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
          Conditions
        </h2>
        {busy && <span className="text-[11px] text-parchment-400">Saving…</span>}
      </div>

      {/* Active condition chips */}
      {active.length === 0 ? (
        <p className="text-xs text-parchment-400">No active conditions.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {active.map((entry) => (
            <li key={entry.key}>
              <span
                className="inline-flex items-center gap-1.5 rounded-control border border-garnet-200 bg-garnet-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-garnet-800"
                title={
                  CONDITION_DESCRIPTIONS[entry.key] +
                  (entry.source ? `\nSource: ${entry.source}` : "")
                }
              >
                {conditionLabel(entry.key)}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleRemove(entry.key)}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-garnet-500 hover:bg-garnet-200 hover:text-garnet-900 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Remove ${conditionLabel(entry.key)}`}
                  title={`Remove ${conditionLabel(entry.key)}`}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Exhaustion stepper (0–6) */}
      <div className="mt-4 flex items-center gap-3 border-t border-parchment-200 pt-3">
        <span className="text-xs font-semibold text-parchment-700">Exhaustion</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy || exhaustion <= 0}
            onClick={() => handleExhaustion(exhaustion - 1)}
            className="flex h-6 w-6 items-center justify-center rounded-control border border-parchment-300 bg-white text-sm font-semibold text-parchment-700 hover:bg-parchment-100 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Decrease exhaustion"
          >
            −
          </button>
          <span
            className="min-w-[1.5rem] text-center font-display text-lg font-semibold leading-none text-parchment-900"
            aria-live="polite"
          >
            {exhaustion}
          </span>
          <button
            type="button"
            disabled={busy || exhaustion >= EXHAUSTION_MAX}
            onClick={() => handleExhaustion(exhaustion + 1)}
            className="flex h-6 w-6 items-center justify-center rounded-control border border-parchment-300 bg-white text-sm font-semibold text-parchment-700 hover:bg-parchment-100 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Increase exhaustion"
          >
            +
          </button>
        </div>
        {exhaustion > 0 && (
          <span className="text-[11px] text-parchment-500">{exhaustionEffect(exhaustion)}</span>
        )}
      </div>

      {/* Inline add-condition panel */}
      <div className="mt-3">
        <AddConditionPanel activeKeys={activeKeys} busy={busy} onApply={handleApply} />
      </div>

      {error && <p className="mt-2 text-xs text-garnet-700">{error}</p>}
    </section>
  );
}
