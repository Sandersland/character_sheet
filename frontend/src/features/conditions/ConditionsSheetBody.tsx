/**
 * ConditionsSheetBody — the interactive innards of the conditions surface:
 * active-condition chips with a remove control, the exhaustion stepper, and the
 * inline AddConditionPanel. Owns busy + error state and fires the API calls, so
 * the applyConditionTransactions logic stays single-sourced across both
 * hosts: the desktop card (ConditionsStrip) and the live-Combat utility strip
 * (CombatUtilityStrip, #982).
 */

import { Minus, Plus, X } from "lucide-react";

import { applyConditionTransactions } from "@/api/client";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import { useReferenceData } from "@/hooks/useReferenceData";
import EmptyState from "@/components/ui/EmptyState";
import { GiHealthNormal } from "@/components/ui/icons";
import { CONDITION_OPTIONS, conditionLabel, EXHAUSTION_MAX } from "@/lib/conditions";
import type { ConditionEntry, ConditionKey, ConditionOperation, ConditionOption, ReferenceData } from "@/types/character";
import AddConditionPanel from "@/features/conditions/AddConditionPanel";

interface Props {
  /** Open the add-condition picker expanded — set when a host launches this body
   *  straight into "add" mode (the live-Combat "+ Add" trigger, #982). */
  defaultAddOpen?: boolean;
}

/** A condition choice with rules text absent — the shape AddConditionPanel and
 *  the chip strip fall back to before /reference resolves (#1322). */
type ConditionChoice = ConditionOption | { key: ConditionKey; label: string };

// Rules text for the viewing character's edition (#1322) — falls back to the
// edition-invariant key+label list while /reference is still loading (or
// failed): a missing sentence degrades, a wrong-edition sentence lies. Pulled
// out of the component so its nullish-coalescing/map logic doesn't add to the
// component's own complexity count.
function resolveConditionChoices(reference: ReferenceData | null): {
  options: readonly ConditionChoice[];
  descriptions: Map<ConditionKey, string>;
} {
  if (!reference) return { options: CONDITION_OPTIONS, descriptions: new Map() };
  return {
    options: reference.conditions,
    descriptions: new Map(reference.conditions.map((c) => [c.key, c.description])),
  };
}

// A chip's tooltip: the condition's rules text (if resolved yet) plus an
// applied source, each on its own line — omitting either that's absent rather
// than rendering an empty line.
function chipTooltip(description: string | undefined, source: string | null | undefined): string {
  return [description, source ? `Source: ${source}` : null].filter(Boolean).join("\n");
}

interface ActiveConditionChipsProps {
  active: ConditionEntry[];
  descriptions: Map<ConditionKey, string>;
  busy: boolean;
  onRemove: (key: ConditionKey) => void;
}

function ActiveConditionChips({ active, descriptions, busy, onRemove }: ActiveConditionChipsProps) {
  if (active.length === 0) {
    return <EmptyState icon={<GiHealthNormal />} title="No active conditions" size="sm" />;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {active.map((entry) => (
        <li key={entry.key}>
          <span
            className="inline-flex items-center gap-1.5 rounded-control border border-garnet-200 bg-garnet-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-garnet-800"
            title={chipTooltip(descriptions.get(entry.key), entry.source)}
          >
            {conditionLabel(entry.key)}
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemove(entry.key)}
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
  );
}

export default function ConditionsSheetBody({ defaultAddOpen }: Props) {
  const { character } = useCurrentCharacter();
  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (ops: ConditionOperation[]) => applyConditionTransactions(character.id, ops),
    toCharacter: (c) => c,
    fallbackMessage: "Something went wrong.",
  });
  const busy = mutation.isPending;
  const error = mutation.error;

  const { reference } = useReferenceData(character.rulesEdition);
  const { options: conditionOptions, descriptions } = resolveConditionChoices(reference);

  const { active, exhaustion } = character.conditions;
  const activeKeys = active.map((c) => c.key);

  async function send(ops: ConditionOperation[]) {
    try {
      await mutation.mutateAsync(ops);
    } catch {
      // mutation.error already carries the message.
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
      <ActiveConditionChips active={active} descriptions={descriptions} busy={busy} onRemove={handleRemove} />

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
          <span className="text-[11px] text-parchment-600">{character.exhaustionEffectText}</span>
        )}
      </div>

      {/* Inline add-condition panel */}
      <div className="mt-3">
        <AddConditionPanel
          activeKeys={activeKeys}
          busy={busy}
          onApply={handleApply}
          defaultOpen={defaultAddOpen}
          options={conditionOptions}
        />
      </div>

      {error && <p className="mt-2 text-xs text-garnet-700">{error}</p>}
    </div>
  );
}
