// Generic Choose-N ceremony body (#896): one component drives every
// catalog-backed level-up pick — maneuvers, disciplines, tool proficiencies,
// and (single-select) fighting style — off the CHOICE_KIND_CONFIGS wiring.
// Enforces the plan's exact count; already-known options are hidden.

import { useEffect, useMemo, useRef, useState } from "react";

import Spinner from "@/components/ui/Spinner";
import { CHOICE_KIND_CONFIGS, type ChoiceOption } from "@/lib/levelUpChoices";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { LevelUpStep } from "@/types/character";

const SEARCH_THRESHOLD = 8;

export default function ChoiceStep({ step }: { step: LevelUpStep }) {
  const { character, draft, setDraft } = useLevelUpStepContext();
  const config = CHOICE_KIND_CONFIGS[step.kind];

  const [options, setOptions] = useState<ChoiceOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const fetched = useRef(false);
  const showSpinner = useDelayedFlag(options === null && !loadError);

  useEffect(() => {
    if (!config || fetched.current) return;
    fetched.current = true;
    let mounted = true;
    config
      .loadOptions()
      .then((opts) => { if (mounted) setOptions(opts); })
      .catch(() => { if (mounted) setLoadError(true); });
    return () => { mounted = false; };
  }, [config]);

  const known = useMemo(() => config?.fromCharacter(character) ?? new Set<string>(), [config, character]);
  const selectedIds = config?.selected(draft) ?? [];
  const count = step.count ?? 1;
  const single = config?.single ?? false;

  if (!config) return null;

  const available = (options ?? []).filter((o) => !known.has(o.id));
  const filtered = search
    ? available.filter((o) => {
        const q = search.toLowerCase();
        return o.name.toLowerCase().includes(q) || (o.description?.toLowerCase().includes(q) ?? false);
      })
    : available;

  const atCap = !single && selectedIds.length >= count;

  function toggle(id: string) {
    const isSelected = selectedIds.includes(id);
    let next: string[];
    if (single) {
      next = [id];
    } else if (isSelected) {
      next = selectedIds.filter((s) => s !== id);
    } else if (atCap) {
      return; // exact-count gate: an (N+1)th pick is blocked, not queued
    } else {
      next = [...selectedIds, id];
    }
    setDraft((prev) => ({ ...prev, ...config!.select(prev, next) }));
  }

  return (
    <div>
      <p className="text-center text-sm font-medium text-parchment-700">
        {single ? "Choose one" : `Choose ${count} — ${selectedIds.length} of ${count} chosen`}
      </p>

      {options !== null && available.length > SEARCH_THRESHOLD && (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter options"
          className="mt-3 w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
        />
      )}

      {loadError && (
        <p role="alert" className="mt-4 text-center text-sm text-garnet-700">
          Couldn't load the choices. Go back and try again.
        </p>
      )}
      {options === null && !loadError && showSpinner && <Spinner />}
      {options !== null && available.length === 0 && (
        <p className="mt-4 text-center text-sm text-parchment-600">
          Nothing left to choose — you already know them all.
        </p>
      )}
      {options !== null && available.length > 0 && filtered.length === 0 && (
        <p className="mt-4 text-center text-sm text-parchment-600">No options match your search.</p>
      )}

      {filtered.length > 0 && (
        <ul className="mt-3 space-y-2">
          {filtered.map((option) => {
            const isSelected = selectedIds.includes(option.id);
            const disabled = !isSelected && atCap;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  disabled={disabled}
                  onClick={() => toggle(option.id)}
                  className={`w-full rounded-card border px-4 py-3 text-left transition-colors ${
                    isSelected
                      ? "border-garnet-600 bg-garnet-50 ring-2 ring-garnet-300"
                      : "border-parchment-300 bg-parchment-50 hover:border-garnet-400 hover:bg-parchment-100"
                  } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-parchment-300 disabled:hover:bg-parchment-50`}
                >
                  <span className="block text-sm font-semibold text-parchment-900">{option.name}</span>
                  {option.description && (
                    <span className="mt-0.5 block text-xs leading-relaxed text-parchment-600">
                      {option.description}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
