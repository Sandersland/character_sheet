import { useState } from "react";

import EntityPortrait from "@/features/entities/EntityPortrait";
import { ENTITY_TYPE_LABELS, matchEntities } from "@/lib/mentions";
import type { CampaignEntity } from "@/types/character";

interface CombineSurvivorPickerProps {
  duplicateId: string;
  entities: CampaignEntity[];
  onPick: (survivor: CampaignEntity) => void;
}

// The "Combine into…" survivor list (#1943): a plain search-filtered list, not
// the full @-mention autocomplete (useMentionEditor) — that machinery is bound
// to a rich-text caret this modal doesn't have. matchEntities is the same
// name/alias matcher the autocomplete and the entity pane rail both use, so
// searching here behaves the same way it does everywhere else in the Codex.
export default function CombineSurvivorPicker({
  duplicateId,
  entities,
  onPick,
}: CombineSurvivorPickerProps) {
  const [query, setQuery] = useState("");
  const candidates = matchEntities(entities, query).filter((e) => e.id !== duplicateId);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        aria-label="Search entities"
        placeholder="Search entries…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none"
      />
      <ul className="flex max-h-72 flex-col divide-y divide-parchment-200 overflow-y-auto">
        {candidates.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onPick(e)}
              className="flex w-full items-center gap-2.5 rounded-control px-1.5 py-2 text-left hover:bg-parchment-100"
            >
              <EntityPortrait
                name={e.name}
                type={e.type}
                portraitUrl={e.portraitUrl}
                className="h-8 w-8 text-sm"
              />
              <span className="min-w-0 grow truncate text-sm font-semibold text-parchment-900">
                {e.name}
              </span>
              <span className="shrink-0 text-xs text-parchment-500">{ENTITY_TYPE_LABELS[e.type]}</span>
            </button>
          </li>
        ))}
        {candidates.length === 0 && (
          <li className="py-3 text-center text-xs text-parchment-500">No entities match.</li>
        )}
      </ul>
    </div>
  );
}
