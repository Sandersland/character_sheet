import type { ReactNode, RefObject } from "react";

import Select from "@/components/ui/Select";
import { Plus } from "@/components/ui/icons";
import { CODEX_SORT_OPTIONS, type CodexSort } from "@/lib/codexLedger";
import { ENTITY_TYPE_DOT_CLASS, ENTITY_TYPE_OPTIONS } from "@/lib/mentions";
import type { EntityType } from "@/types/character";

interface CodexRailProps {
  campaignName?: string;
  entryCount: number;
  query: string;
  onQueryChange: (query: string) => void;
  typeFilter: EntityType | "ALL";
  onTypeFilterChange: (filter: EntityType | "ALL") => void;
  counts: Record<EntityType, number>;
  sort: CodexSort;
  onSortChange: (sort: CodexSort) => void;
  creating: boolean;
  onToggleCreate: () => void;
  toggleRef: RefObject<HTMLButtonElement>;
  // The mobile FAB replaces the rail toggle below md.
  showCreateToggle: boolean;
  children?: ReactNode;
}

const filterBase =
  "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600 lg:w-full lg:rounded-control lg:px-2.5 lg:py-1.5";
const filterOn = "bg-garnet-700 text-parchment-50";
const filterOff =
  "bg-parchment-200/60 text-parchment-700 hover:bg-parchment-200 hover:text-parchment-900 lg:bg-transparent lg:hover:bg-parchment-100";

// The codex browse rail (#840): title block, search, type filter list with tone
// dots + counts, sort control, and the create toggle. Fully controlled — all
// state lives in CampaignCodex.
export default function CodexRail({
  campaignName,
  entryCount,
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  counts,
  sort,
  onSortChange,
  creating,
  onToggleCreate,
  toggleRef,
  showCreateToggle,
  children,
}: CodexRailProps) {
  return (
    <aside className="flex flex-col gap-3 lg:sticky lg:top-6 lg:gap-4 lg:self-start">
      <div className="hidden lg:block">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
          {campaignName ?? "Campaign"}
        </p>
        <h2 className="font-display text-2xl font-semibold text-parchment-900">Codex</h2>
        <p className="text-xs text-parchment-500">
          {entryCount} {entryCount === 1 ? "entry" : "entries"}
        </p>
      </div>
      {/* Below lg the search bar sticks under the viewport top while the list scrolls. */}
      <div className="sticky top-0 z-10 -my-1 bg-parchment-100 py-1 lg:static lg:my-0 lg:bg-transparent lg:py-0">
        <input
          type="search"
          aria-label="Search entities"
          placeholder="Search name, alias or description…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none"
        />
      </div>
      <div
        className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0"
        role="group"
        aria-label="Filter by type"
      >
        <button
          type="button"
          aria-pressed={typeFilter === "ALL"}
          onClick={() => onTypeFilterChange("ALL")}
          className={`${filterBase} ${typeFilter === "ALL" ? filterOn : filterOff}`}
        >
          <span className="grow">All entries</span>
          <span className="text-xs font-medium tabular-nums opacity-70">{entryCount}</span>
        </button>
        {ENTITY_TYPE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={typeFilter === o.value}
            onClick={() => onTypeFilterChange(o.value)}
            className={`${filterBase} ${typeFilter === o.value ? filterOn : filterOff}`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${ENTITY_TYPE_DOT_CLASS[o.value]}`}
            />
            <span className="grow">{o.label}</span>
            <span className="text-xs font-medium tabular-nums opacity-70">{counts[o.value]}</span>
          </button>
        ))}
      </div>
      <div className="hidden lg:block">
        <label
          className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-parchment-500"
          htmlFor="codex-sort"
        >
          Sort
        </label>
        <Select
          id="codex-sort"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as CodexSort)}
        >
          {CODEX_SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      {showCreateToggle && (
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={creating}
          onClick={onToggleCreate}
          className="inline-flex items-center justify-center gap-1.5 rounded-control bg-garnet-700 px-3 py-2 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          New entry
        </button>
      )}
      {children}
    </aside>
  );
}
