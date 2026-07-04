/**
 * DisciplinesSection — Way of the Four Elements block inside ClassFeaturesSection.
 * Fetches the discipline catalog once (shared by the known rows + picker), merges
 * always-known disciplines with the learned list, and wires cast/learn/forget/swap
 * up to the ClassFeaturesSection orchestrator. Mirrors the Maneuvers block.
 */

import { useEffect, useState } from "react";

import { fetchDisciplines } from "@/api/client";
import { kiRemaining } from "@/lib/disciplines";
import type {
  CastDisciplineOperation,
  CatalogDiscipline,
  Character,
  DisciplineEntry,
  ForgetDisciplineOperation,
  LearnDisciplineOperation,
  SwapDisciplineOperation,
} from "@/types/character";
import AddDisciplinePanel from "@/features/class/AddDisciplinePanel";
import DisciplineRow from "@/features/class/DisciplineRow";

interface Props {
  character: Character;
  choiceCount: number;
  saveDC?: number;
  disciplinesKnown: DisciplineEntry[];
  busy: boolean;
  onCast: (op: CastDisciplineOperation) => void;
  onLearn: (op: LearnDisciplineOperation) => void;
  onForget: (op: ForgetDisciplineOperation) => void;
  onSwap: (op: SwapDisciplineOperation) => void;
}

export default function DisciplinesSection({
  character,
  choiceCount,
  saveDC,
  disciplinesKnown,
  busy,
  onCast,
  onLearn,
  onForget,
  onSwap,
}: Props) {
  const [catalog, setCatalog] = useState<CatalogDiscipline[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [swapEntryId, setSwapEntryId] = useState<string | null>(null);

  // No hasFetched ref: under StrictMode the ref would suppress the second mount's
  // fetch while the first's cleanup has already nulled `mounted`, dropping the
  // result. The mounted flag alone is the StrictMode-safe pattern.
  useEffect(() => {
    let mounted = true;
    fetchDisciplines()
      .then((rows) => { if (mounted) setCatalog(rows); })
      .catch(() => { if (mounted) setCatalogError("Couldn't load discipline catalog."); });
    return () => { mounted = false; };
  }, []);

  const level = character.level;
  const catalogById = new Map((catalog ?? []).map((d) => [d.id, d]));
  const kiAvailable = kiRemaining(character.resources);

  // Always-known disciplines (Elemental Attunement) — free, uncapped, not forgettable.
  const alwaysKnownRows: DisciplineEntry[] = (catalog ?? [])
    .filter((d) => d.alwaysKnown && d.minLevel <= level)
    .map((d) => ({ id: d.id, disciplineId: d.id, name: d.name, description: d.description }));

  const swapEntry = disciplinesKnown.find((d) => d.id === swapEntryId) ?? null;

  // Slots already spent — while swapping, free the outgoing slot so it can be re-picked.
  const knownIds = disciplinesKnown
    .filter((d) => d.id !== swapEntryId)
    .flatMap((d) => (d.disciplineId ? [d.disciplineId] : []));

  function handleLearn(disciplineId: string) {
    onLearn({ type: "learnDiscipline", disciplineId });
  }

  function handleSwap(disciplineId: string) {
    if (!swapEntryId) return;
    onSwap({ type: "swapDiscipline", entryId: swapEntryId, disciplineId });
    setSwapEntryId(null);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Elemental Disciplines
        </h3>
        {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      {saveDC !== undefined && (
        <p className="mb-3 text-xs text-parchment-600">
          Ki Save DC:{" "}
          <span className="font-semibold text-parchment-900">{saveDC}</span>
          <span className="ml-2">Ki remaining: <span className="font-semibold text-gold-800">{kiAvailable}</span></span>
        </p>
      )}

      <ul className="mb-3 divide-y divide-parchment-200">
        {alwaysKnownRows.map((entry) => (
          <DisciplineRow
            key={entry.id}
            entry={entry}
            catalog={catalogById.get(entry.disciplineId ?? "")}
            characterLevel={level}
            kiAvailable={kiAvailable}
            saveDC={saveDC}
            forgettable={false}
            busy={busy}
            onCast={onCast}
            onForget={() => {}}
            onSwapStart={() => {}}
          />
        ))}
        {disciplinesKnown.map((entry) => (
          <DisciplineRow
            key={entry.id}
            entry={entry}
            catalog={entry.disciplineId ? catalogById.get(entry.disciplineId) : undefined}
            characterLevel={level}
            kiAvailable={kiAvailable}
            saveDC={saveDC}
            forgettable
            busy={busy}
            onCast={onCast}
            onForget={(entryId) => onForget({ type: "forgetDiscipline", entryId })}
            onSwapStart={(entryId) => setSwapEntryId(entryId)}
          />
        ))}
        {disciplinesKnown.length === 0 && alwaysKnownRows.length === 0 && (
          <li className="py-3 text-center text-sm text-parchment-600">
            No disciplines learned yet.
          </li>
        )}
      </ul>

      <AddDisciplinePanel
        catalog={catalog}
        catalogError={catalogError}
        knownIds={knownIds}
        choiceCount={choiceCount}
        knownCount={disciplinesKnown.length}
        characterLevel={level}
        busy={busy}
        swapEntry={swapEntry}
        onLearn={handleLearn}
        onSwap={handleSwap}
        onCancelSwap={() => setSwapEntryId(null)}
      />
    </div>
  );
}
