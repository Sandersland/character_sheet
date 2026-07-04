/**
 * AddDisciplinePanel — inline expand-in-place picker for learning (or swapping)
 * an elemental discipline. Mirrors AddManeuverPanel; the catalog is supplied by
 * DisciplinesSection (shared with the known rows). Rows are gated by min monk
 * level and hide always-known / already-known disciplines.
 */

import { useState } from "react";

import Spinner from "@/components/ui/Spinner";
import type { CatalogDiscipline, DisciplineEntry } from "@/types/character";

interface Props {
  catalog: CatalogDiscipline[] | null;
  catalogError: string | null;
  knownIds: string[];
  choiceCount: number;
  knownCount: number;
  characterLevel: number;
  busy: boolean;
  swapEntry: DisciplineEntry | null;
  onLearn: (disciplineId: string) => void;
  onSwap: (disciplineId: string) => void;
  onCancelSwap: () => void;
}

export default function AddDisciplinePanel({
  catalog,
  catalogError,
  knownIds,
  choiceCount,
  knownCount,
  characterLevel,
  busy,
  swapEntry,
  onLearn,
  onSwap,
  onCancelSwap,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const swapping = swapEntry !== null;
  const atCap = knownCount >= choiceCount;

  const knownIdSet = new Set(knownIds);
  const learnable = (catalog ?? []).filter((d) => {
    if (d.alwaysKnown) return false;
    if (d.minLevel > characterLevel) return false;
    // When swapping, the outgoing discipline is already removed from knownIds
    // by the caller, so its slot is free to re-pick a different one.
    if (knownIdSet.has(d.id)) return false;
    if (search) {
      const q = search.toLowerCase();
      return d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q);
    }
    return true;
  });

  // Collapsed learn affordance (never collapsed while swapping).
  if (!swapping && !open) {
    return (
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={atCap || busy}
          onClick={() => setOpen(true)}
          className="self-start rounded-control border border-dashed border-gold-400 px-3 py-1.5 text-xs font-semibold text-gold-800 hover:border-gold-600 hover:bg-gold-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Learn discipline
        </button>
        <span className="text-[11px] text-parchment-600">
          {knownCount} of {choiceCount} known
        </span>
      </div>
    );
  }

  function handlePick(disciplineId: string) {
    if (swapping) onSwap(disciplineId);
    else onLearn(disciplineId);
  }

  function handleClose() {
    if (swapping) onCancelSwap();
    else setOpen(false);
  }

  return (
    <div className="mt-3 rounded-card border border-gold-200 bg-gold-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gold-900">
          {swapping ? `Swap out ${swapEntry.name}` : "Learn a Discipline"}
          <span className="ml-2 text-xs font-normal text-parchment-600">
            {knownCount} of {choiceCount} known
          </span>
        </h3>
        <button
          type="button"
          onClick={handleClose}
          className="text-parchment-600 hover:text-parchment-700"
          aria-label={swapping ? "Cancel swap" : "Close discipline panel"}
        >
          ✕
        </button>
      </div>

      <input
        type="search"
        placeholder="Filter disciplines…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
      />

      {catalogError && <p className="text-xs text-garnet-700">{catalogError}</p>}
      {catalog === null && !catalogError && <Spinner />}
      {catalog !== null && learnable.length === 0 && (
        <p className="py-2 text-center text-xs text-parchment-600">
          {search ? "No disciplines match your search." : "No more disciplines available at this level."}
        </p>
      )}

      {learnable.length > 0 && (
        <ul className="max-h-72 overflow-y-auto">
          {learnable.map((d) => (
            <li
              key={d.id}
              className="flex items-start justify-between gap-3 border-b border-gold-100 py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-parchment-900">
                  {d.name}
                  <span className="ml-1.5 text-[10px] text-parchment-500">L{d.minLevel}+</span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-parchment-600">
                  {d.description}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => handlePick(d.id)}
                className="shrink-0 rounded bg-gold-400 px-2.5 py-1 text-xs font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
                title={swapping ? `Swap in ${d.name}` : `Learn ${d.name}`}
              >
                {swapping ? "Swap in" : "Learn"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
