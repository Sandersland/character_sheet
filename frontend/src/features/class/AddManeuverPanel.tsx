import { useEffect, useRef, useState } from "react";

import { fetchManeuvers } from "@/api/client";
import Spinner from "@/components/ui/Spinner";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { CatalogManeuver, LearnManeuverOperation } from "@/types/character";

interface Props {
  knownIds: string[];
  choiceCount: number;
  knownCount: number;
  busy: boolean;
  onLearn: (op: LearnManeuverOperation) => void;
}

export default function AddManeuverPanel({
  knownIds,
  choiceCount,
  knownCount,
  busy,
  onLearn,
}: Props) {
  const { character } = useCurrentCharacter();
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogManeuver[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const hasFetched = useRef(false);
  const showSpinner = useDelayedFlag(open && catalog === null && !catalogError);

  const atCap = knownCount >= choiceCount;

  // character.rulesEdition is write-once; it's in the deps only to satisfy the lint
  // rule — hasFetched latches this fetch to the first expand regardless.
  useEffect(() => {
    if (!open || hasFetched.current) return;
    hasFetched.current = true;
    let mounted = true;
    fetchManeuvers(character.rulesEdition)
      .then((maneuvers) => { if (mounted) setCatalog(maneuvers); })
      .catch(() => { if (mounted) setCatalogError("Couldn't load maneuver catalog."); });
    return () => { mounted = false; };
  }, [open, character.rulesEdition]);

  const knownIdSet = new Set(knownIds);
  const filteredCatalog = (catalog ?? []).filter((m) => {
    if (knownIdSet.has(m.id)) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
    }
    return true;
  });

  if (!open) {
    return (
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={atCap || busy}
          onClick={() => setOpen(true)}
          className="self-start rounded-control border border-dashed border-gold-400 px-3 py-1.5 text-xs font-semibold text-gold-800 hover:border-gold-600 hover:bg-gold-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Learn maneuver
        </button>
        <span className="text-[11px] text-parchment-600">
          {knownCount} of {choiceCount} known
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-card border border-gold-200 bg-gold-50 p-4">
      
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gold-900">
          Learn a Maneuver
          <span className="ml-2 text-xs font-normal text-parchment-600">
            {knownCount} of {choiceCount} known
          </span>
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-parchment-600 hover:text-parchment-700"
          aria-label="Close maneuver panel"
        >
          ✕
        </button>
      </div>

      
      <input
        type="search"
        placeholder="Filter maneuvers…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
      />

      
      {catalogError && (
        <p className="text-xs text-garnet-700">{catalogError}</p>
      )}
      {catalog === null && !catalogError && showSpinner && <Spinner />}
      {catalog !== null && filteredCatalog.length === 0 && (
        <p className="py-2 text-center text-xs text-parchment-600">
          {search ? "No maneuvers match your search." : "All maneuvers already known."}
        </p>
      )}

      {filteredCatalog.length > 0 && (
        <ul className="max-h-72 overflow-y-auto">
          {filteredCatalog.map((maneuver) => (
            <li
              key={maneuver.id}
              className="flex items-start justify-between gap-3 border-b border-gold-100 py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-parchment-900">
                  {maneuver.name}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-parchment-600">
                  {maneuver.description}
                </p>
              </div>
              <button
                type="button"
                disabled={busy || atCap}
                onClick={() => onLearn({ type: "learnManeuver", maneuverId: maneuver.id })}
                className="shrink-0 rounded bg-gold-400 px-2.5 py-1 text-xs font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
                title={atCap ? `Already at maximum (${choiceCount})` : `Learn ${maneuver.name}`}
              >
                Learn
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
