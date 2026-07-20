import { useState } from "react";
import { Link } from "react-router-dom";

import EntityPortrait from "@/features/entities/EntityPortrait";
import { typeCounts } from "@/lib/codexLedger";
import { ENTITY_TYPE_DOT_CLASS, ENTITY_TYPE_OPTIONS, matchEntities } from "@/lib/mentions";
import type { CampaignEntity, EntityType } from "@/types/character";

const chipBase =
  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600";
const chipOn = "bg-garnet-700 text-parchment-50";
const chipOff = "bg-parchment-200/60 text-parchment-700 hover:bg-parchment-200";

// Compact sibling list beside the reading pane (#842). Filter state is local on
// purpose: row navigation swaps only the pane, so this rail never unmounts.
export default function EntityPaneRail({
  campaignId,
  entities,
  currentEntityId,
}: {
  campaignId: string;
  entities: CampaignEntity[];
  currentEntityId?: string;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EntityType | "ALL">("ALL");
  const counts = typeCounts(entities);
  const rows = matchEntities(entities, query).filter(
    (e) => typeFilter === "ALL" || e.type === typeFilter,
  );

  return (
    <nav
      aria-label="Codex entries"
      className="hidden flex-col gap-3 lg:sticky lg:top-6 lg:flex lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto"
    >
      <input
        type="search"
        aria-label="Search entities"
        placeholder="Search entries…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none"
      />
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by type">
        <button
          type="button"
          aria-pressed={typeFilter === "ALL"}
          onClick={() => setTypeFilter("ALL")}
          className={`${chipBase} ${typeFilter === "ALL" ? chipOn : chipOff}`}
        >
          All
          <span className="tabular-nums opacity-70">{entities.length}</span>
        </button>
        {ENTITY_TYPE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={typeFilter === o.value}
            onClick={() => setTypeFilter(o.value)}
            className={`${chipBase} ${typeFilter === o.value ? chipOn : chipOff}`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${ENTITY_TYPE_DOT_CLASS[o.value]}`}
            />
            {o.label}
            <span className="tabular-nums opacity-70">{counts[o.value]}</span>
          </button>
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-parchment-200">
        {rows.map((e) => (
          <li key={e.id}>
            <Link
              to={`/campaigns/${campaignId}/entities/${e.id}`}
              aria-current={e.id === currentEntityId ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-control px-1.5 py-2 hover:bg-parchment-100 ${
                e.id === currentEntityId ? "bg-parchment-200/70" : ""
              }`}
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
              {e.stats && e.stats.mentionCount > 0 && (
                <span className="shrink-0 text-xs tabular-nums text-parchment-500">
                  {e.stats.mentionCount}
                </span>
              )}
            </Link>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="py-3 text-center text-xs text-parchment-500">No entries match.</li>
        )}
      </ul>
    </nav>
  );
}
