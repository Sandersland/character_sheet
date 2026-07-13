import { useMemo, useRef, useState } from "react";

import EmptyState from "@/components/ui/EmptyState";
import { GiSpellBook } from "@/components/ui/icons";
import CodexLedger from "@/features/entities/CodexLedger";
import CodexRail from "@/features/entities/CodexRail";
import EntityCreateForm from "@/features/entities/EntityCreateForm";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import { groupByInitial, typeCounts, type CodexSort } from "@/lib/codexLedger";
import { matchEntitiesDetailed } from "@/lib/mentions";
import type { CampaignRole, EntityType } from "@/types/character";

interface CampaignCodexProps {
  campaignId: string;
  role?: CampaignRole;
  campaignName?: string;
}

// Codex browse shell (#840): orchestrates the filter rail + chronicle ledger.
// Rows link to EntityDetailPage, which owns edit/delete/reveal. Members see
// only revealed entities (server-filtered); the owner also sees HIDDEN ones.
export default function CampaignCodex({ campaignId, role, campaignName }: CampaignCodexProps) {
  const { entities } = useCampaignEntities(campaignId);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EntityType | "ALL">("ALL");
  const [sort, setSort] = useState<CodexSort>("alpha");
  const [creating, setCreating] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const isOwner = role === "OWNER";

  const matches = useMemo(
    () =>
      matchEntitiesDetailed(entities, query).filter(
        (m) => typeFilter === "ALL" || m.entity.type === typeFilter,
      ),
    [entities, query, typeFilter],
  );
  const groups = useMemo(() => groupByInitial(matches.map((m) => m.entity)), [matches]);
  const matchedInNotesIds = useMemo(
    () => new Set(matches.filter((m) => m.matchedInNotesOnly).map((m) => m.entity.id)),
    [matches],
  );
  const counts = useMemo(() => typeCounts(entities), [entities]);

  function closeForm() {
    setCreating(false);
    // The panel unmounts, so return keyboard focus to the toggle (same pattern as Popover).
    toggleRef.current?.focus();
  }

  // The lg grid keeps a seam for the activity column (#841): [rail | ledger | activity].
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <CodexRail
        campaignName={campaignName}
        entryCount={entities.length}
        query={query}
        onQueryChange={setQuery}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        counts={counts}
        sort={sort}
        onSortChange={setSort}
        creating={creating}
        onToggleCreate={() => (creating ? closeForm() : setCreating(true))}
        toggleRef={toggleRef}
      >
        {creating && (
          <EntityCreateForm campaignId={campaignId} isOwner={isOwner} onClose={closeForm} />
        )}
      </CodexRail>
      <div className="min-w-0">
        {entities.length === 0 ? (
          <EmptyState
            icon={<GiSpellBook />}
            title="No entities yet"
            description="NPCs, locations, factions and more appear here once created or @-mentioned in a journal note."
            action={{ label: "Create your first entry", onClick: () => setCreating(true) }}
          />
        ) : matches.length === 0 ? (
          <p className="py-4 text-center text-sm text-parchment-600">
            No entities match your search.
          </p>
        ) : (
          <CodexLedger
            campaignId={campaignId}
            groups={groups}
            matchedInNotesIds={matchedInNotesIds}
            role={role}
            sort={sort}
          />
        )}
      </div>
    </div>
  );
}
