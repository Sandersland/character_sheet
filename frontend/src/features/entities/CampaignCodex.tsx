import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { GiSpellBook } from "@/components/ui/icons";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import {
  ENTITY_TYPE_LABELS,
  ENTITY_TYPE_OPTIONS,
  ENTITY_TYPE_TONE,
  matchEntities,
} from "@/lib/mentions";
import type { EntityType } from "@/types/character";

interface CampaignCodexProps {
  campaignId: string;
}

const chipBase =
  "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600";
const chipOn = "bg-garnet-700 text-parchment-50";
const chipOff = "bg-parchment-100 text-parchment-600 hover:bg-parchment-200 hover:text-parchment-800";

// Codex tab: browse/search/filter the campaign's entity registry. Rows link to
// EntityDetailPage, which owns edit/delete.
export default function CampaignCodex({ campaignId }: CampaignCodexProps) {
  const { entities } = useCampaignEntities(campaignId);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EntityType | "ALL">("ALL");

  const visible = useMemo(
    () =>
      matchEntities(entities, query)
        .filter((e) => typeFilter === "ALL" || e.type === typeFilter)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [entities, query, typeFilter],
  );

  return (
    <Card title="Codex" headingLevel={2} className="p-4">
      <div className="flex flex-col gap-3 p-4">
        {entities.length === 0 ? (
          <EmptyState
            icon={<GiSpellBook />}
            title="No entities yet"
            description="NPCs, locations, factions and more appear here once created or @-mentioned in a journal note."
          />
        ) : (
          <>
            <input
              type="search"
              aria-label="Search entities"
              placeholder="Search by name or alias…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none"
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
              <button
                type="button"
                aria-pressed={typeFilter === "ALL"}
                onClick={() => setTypeFilter("ALL")}
                className={`${chipBase} ${typeFilter === "ALL" ? chipOn : chipOff}`}
              >
                All
              </button>
              {ENTITY_TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={typeFilter === o.value}
                  onClick={() => setTypeFilter(o.value)}
                  className={`${chipBase} ${typeFilter === o.value ? chipOn : chipOff}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {visible.length === 0 ? (
              <p className="py-4 text-center text-sm text-parchment-600">
                No entities match your search.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-parchment-200">
                {visible.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/campaigns/${campaignId}/entities/${e.id}`}
                      className="flex flex-wrap items-center gap-2 rounded-control px-1 py-2 hover:bg-parchment-100"
                    >
                      <span className="text-sm font-semibold text-parchment-900">{e.name}</span>
                      <Badge tone={ENTITY_TYPE_TONE[e.type]}>{ENTITY_TYPE_LABELS[e.type]}</Badge>
                      {e.aliases.length > 0 && (
                        <span className="min-w-0 truncate text-xs text-parchment-500">
                          {e.aliases.join(", ")}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
