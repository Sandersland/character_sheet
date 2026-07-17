/**
 * ConditionsSheetBody — the interactive innards of the conditions surface:
 * active-condition chips with a remove control, the exhaustion stepper, and the
 * inline AddConditionPanel. Owns busy + error state and fires the API calls, so
 * the applyConditionTransactions logic stays single-sourced across all three
 * hosts: the desktop card (ConditionsStrip), the mobile sheet
 * (CompactConditionsBar, #769), and the live-Combat utility strip
 * (CombatUtilityStrip, #982).
 */

import { Minus, Plus, X } from "lucide-react";
import { useState } from "react";

import { applyConditionTransactions } from "@/api/client";
import EmptyState from "@/components/ui/EmptyState";
import { GiHealthNormal } from "@/components/ui/icons";
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
  /** Open the add-condition picker expanded — set when a host launches this body
   *  straight into "add" mode (the live-Combat "+ Add" trigger, #982). */
  defaultAddOpen?: boolean;
}

export default function ConditionsSheetBody({ character, onUpdate, defaultAddOpen }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { active, exhaustion } = character.conditions;
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
    <div>
      {busy && (
        <p className="mb-2 text-right text-[11px] text-parchment-600" aria-live="polite">
          Saving…
        </p>
      )}

      {/* Active condition chips */}
      {active.length === 0 ? (
        <EmptyState icon={<GiHealthNormal />} title="No active conditions" size="sm" />
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
                  className="flex h-4 w-4 items-center justify-center rounded-full text-garnet-700 hover:bg-garnet-200 hover:text-garnet-900 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Remove ${conditionLabel(entry.key)}`}
                  title={`Remove ${conditionLabel(entry.key)}`}
                >
                  <X aria-hidden="true" className="h-3 w-3" />
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
            className="flex h-6 w-6 items-center justify-center rounded-control border border-parchment-300 bg-parchment-50 text-sm font-semibold text-parchment-700 hover:bg-parchment-100 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Decrease exhaustion"
          >
            <Minus aria-hidden="true" className="h-3.5 w-3.5" />
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
            className="flex h-6 w-6 items-center justify-center rounded-control border border-parchment-300 bg-parchment-50 text-sm font-semibold text-parchment-700 hover:bg-parchment-100 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Increase exhaustion"
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
        {exhaustion > 0 && (
          <span className="text-[11px] text-parchment-600">{exhaustionEffect(exhaustion)}</span>
        )}
      </div>

      {/* Inline add-condition panel */}
      <div className="mt-3">
        <AddConditionPanel
          activeKeys={activeKeys}
          busy={busy}
          onApply={handleApply}
          defaultOpen={defaultAddOpen}
        />
      </div>

      {error && <p className="mt-2 text-xs text-garnet-700">{error}</p>}
    </div>
  );
}
