/**
 * AdvancementSection — orchestrator for Ability Score Improvements and Feats.
 *
 * Owns busy + error state, fires API calls through the client module, and
 * propagates the updated Character via onUpdate. Renders:
 *   - Summary header showing slots used/total
 *   - List of taken advancements (each with a Remove button)
 *   - AdvancementPanel inline picker when slots remain
 *
 * Mirrors ClassFeaturesSection / SpellsSection in structure.
 */

import { useState } from "react";

import { applyAdvancementTransactions } from "@/api/client";
import { abilityAbbr } from "@/lib/abilities";
import { entryDetail } from "@/lib/advancement";
import type { AdvancementEntry, AdvancementOperation, Character } from "@/types/character";
import AdvancementPanel from "@/features/advancement/AdvancementPanel";

interface Props {
  character: Character;
  onUpdate: (updated: Character) => void;
}

/** Pretty-print a single AdvancementEntry for the list view. */
function entryLabel(entry: AdvancementEntry): string {
  if (entry.kind === "feat") {
    return entry.featName ?? "Custom feat";
  }
  // ASI — e.g. "STR +2" or "DEX +1, CON +1"
  return Object.entries(entry.abilityDeltas)
    .map(([ab, d]) => `${abilityAbbr(ab)} +${d}`)
    .join(", ");
}

export default function AdvancementSection({ character, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { advancementSlots } = character;
  // Fighting Style feats (#1137) occupy their own slot partition and render in the
  // class-features section — exclude them from the ASI/feat list here.
  const advancements = character.advancements.filter((a) => a.slot !== "fightingStyle");
  const slotsRemaining = advancementSlots.total - advancementSlots.used;

  async function send(ops: AdvancementOperation[]) {
    setBusy(true);
    setError(null);
    try {
      const updated = await applyAdvancementTransactions(character.id, ops);
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(op: AdvancementOperation) {
    send([op]);
  }

  function handleRemove(entryId: string) {
    send([{ type: "removeAdvancement", entryId }]);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Error banner */}
      {error && (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {error}
        </p>
      )}

      {/* Slot summary */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {Array.from({ length: advancementSlots.total }, (_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className={`h-3 w-3 rounded-full border ${
                i < advancementSlots.used
                  ? "border-gold-600 bg-gold-500"
                  : "border-parchment-400 bg-parchment-100"
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-parchment-600">
          {advancementSlots.used}/{advancementSlots.total} used
        </span>
        {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      {/* Taken advancements list */}
      {advancements.length > 0 && (
        <ul className="flex flex-col gap-3">
          {advancements.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-3 rounded-card border border-parchment-200 bg-parchment-50 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-parchment-600">
                    Lv {entry.level}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide ${
                      entry.origin ? "text-vitality-700" : entry.kind === "feat" ? "text-arcane-700" : "text-gold-800"
                    }`}
                  >
                    {/* Origin feats (background grants, #1130) are slot-exempt and not removable. */}
                    {entry.origin ? "Origin" : entry.kind === "feat" ? "Feat" : "ASI"}
                  </span>
                </div>
                <p className="mt-0.5 text-sm font-semibold text-parchment-900">
                  {entryLabel(entry)}
                </p>
                {entryDetail(entry) && (
                  <p className="mt-0.5 text-xs leading-relaxed text-parchment-600">
                    {entryDetail(entry)}
                  </p>
                )}
              </div>
              {!entry.origin && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleRemove(entry.id)}
                  title="Remove this advancement"
                  aria-label={`Remove: ${entryLabel(entry)}`}
                  className="shrink-0 rounded-control px-1.5 py-0.5 text-[10px] text-parchment-600 hover:text-garnet-600 disabled:opacity-40"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Empty state */}
      {advancements.length === 0 && advancementSlots.total > 0 && (
        <p className="text-sm text-parchment-600">
          No advancements taken yet. You have {advancementSlots.total} slot{advancementSlots.total > 1 ? "s" : ""} available.
        </p>
      )}

      {/* Inline picker */}
      <AdvancementPanel
        currentScores={character.abilityScores as unknown as Record<string, number>}
        slotsRemaining={slotsRemaining}
        busy={busy}
        characterLevel={character.level}
        skillNames={(character.skills as { name: string }[]).map((s) => s.name)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
