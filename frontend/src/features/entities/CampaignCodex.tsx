import { useMemo, useRef, useState } from "react";

import BottomSheet from "@/components/ui/BottomSheet";
import EmptyState from "@/components/ui/EmptyState";
import { GiSpellBook, Plus } from "@/components/ui/icons";
import CodexActivityRail, { NeedsChroniclingBanner } from "@/features/entities/CodexActivityRail";
import CodexLedger from "@/features/entities/CodexLedger";
import CodexRail from "@/features/entities/CodexRail";
import EntityCreateForm from "@/features/entities/EntityCreateForm";
import { useCodexActivity } from "@/features/entities/useCodexActivity";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import {
  buildLedgerGroups,
  mergeEntityStats,
  typeCounts,
  type CodexSort,
} from "@/lib/codexLedger";
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
  const { statsEntities, activity, loaded } = useCodexActivity(campaignId);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EntityType | "ALL">("ALL");
  const [sort, setSort] = useState<CodexSort>("alpha");
  const [creating, setCreating] = useState(false);
  // One ref serves both toggles — the rail button and FAB never coexist.
  const toggleRef = useRef<HTMLButtonElement>(null);
  const isOwner = role === "OWNER";
  const isMobile = useIsBelowMd();

  const matches = useMemo(
    () =>
      matchEntitiesDetailed(entities, query).filter(
        (m) => typeFilter === "ALL" || m.entity.type === typeFilter,
      ),
    [entities, query, typeFilter],
  );
  // Rows carry mention stats (#853) from the activity fetch when available.
  const groups = useMemo(
    () =>
      buildLedgerGroups(
        mergeEntityStats(
          matches.map((m) => m.entity),
          statsEntities,
        ),
        sort,
      ),
    [matches, statsEntities, sort],
  );
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

  // lg grid: [filter rail | ledger]; the activity rail (#841) joins at xl.
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[280px_minmax(0,1fr)_280px]">
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
        showCreateToggle={!isMobile}
      >
        {creating && !isMobile && (
          <EntityCreateForm campaignId={campaignId} isOwner={isOwner} onClose={closeForm} />
        )}
      </CodexRail>
      <div className="min-w-0">
        {loaded && <NeedsChroniclingBanner campaignId={campaignId} statsEntities={statsEntities} />}
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
      {loaded && (
        <CodexActivityRail
          campaignId={campaignId}
          statsEntities={statsEntities}
          activity={activity}
        />
      )}
      {isMobile && (
        <>
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={creating}
            onClick={() => (creating ? closeForm() : setCreating(true))}
            className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-1.5 rounded-full bg-garnet-700 px-4 py-3 text-sm font-semibold text-parchment-50 shadow-raised transition-colors hover:bg-garnet-800"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            New entry
          </button>
          {creating && (
            <BottomSheet title="New entry" onClose={closeForm}>
              <EntityCreateForm campaignId={campaignId} isOwner={isOwner} onClose={closeForm} />
            </BottomSheet>
          )}
        </>
      )}
    </div>
  );
}
