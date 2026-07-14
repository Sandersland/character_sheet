import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { monogram } from "@/lib/codexLedger";
import { formatJournalDate } from "@/lib/formatJournalDate";
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_MONOGRAM_CLASS } from "@/lib/mentions";
import type { CampaignEntity, CampaignRole, EntityBacklink } from "@/types/character";

function firstMentionedLabel(entity: CampaignEntity): string {
  const ref = entity.stats?.firstMentioned;
  if (!ref) return "Not yet";
  return ref.sessionOrdinal ? `Session ${ref.sessionOrdinal}` : formatJournalDate(ref.date);
}

function mentionsLabel(entity: CampaignEntity, backlinks: EntityBacklink[]): string {
  const count = entity.stats?.mentionCount ?? backlinks.length;
  const sessions = new Set(backlinks.map((l) => l.entry.sessionId).filter(Boolean)).size;
  return `${count} across ${sessions} ${sessions === 1 ? "session" : "sessions"}`;
}

function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-xs font-semibold text-parchment-500">{label}</dt>
      <dd className="text-right text-xs text-parchment-800">{children}</dd>
    </div>
  );
}

// The article's derived-facts panel (#842): portrait tile, fact rows, and the
// owner's quiet Hide/Delete links. No fact here is persisted — all computed.
export default function EntityInfobox({
  entity,
  role,
  backlinks,
  characters,
  viewerId,
  busy,
  onToggleVisibility,
  onDelete,
}: {
  entity: CampaignEntity;
  role?: CampaignRole;
  backlinks: EntityBacklink[];
  characters: { id: string; name: string; ownerId: string }[];
  viewerId?: string;
  busy: boolean;
  onToggleVisibility: () => void;
  onDelete: () => void;
}) {
  // Sheets are owner-only views today: link only the viewer's own character (#842).
  const linkedCharacter = entity.characterId
    ? characters.find((c) => c.id === entity.characterId)
    : undefined;
  const showSheetLink = !!linkedCharacter && !!viewerId && linkedCharacter.ownerId === viewerId;

  return (
    <aside
      aria-label="Entity facts"
      className="rounded-card border border-parchment-200 bg-parchment-50 p-4"
    >
      {/* Monogram portrait slot — swaps for an uploaded image when #844 lands. */}
      <div
        aria-hidden="true"
        className={`flex h-24 w-24 items-center justify-center rounded-card font-display text-4xl font-semibold ${ENTITY_TYPE_MONOGRAM_CLASS[entity.type]}`}
      >
        {monogram(entity.name)}
      </div>
      <dl className="mt-3 flex flex-col divide-y divide-parchment-200">
        <FactRow label="Type">{ENTITY_TYPE_LABELS[entity.type]}</FactRow>
        <FactRow label="First mentioned">{firstMentionedLabel(entity)}</FactRow>
        <FactRow label="Mentions">{mentionsLabel(entity, backlinks)}</FactRow>
        {entity.stats && entity.stats.chroniclers.length > 0 && (
          <FactRow label="Chronicled by">{entity.stats.chroniclers.join(", ")}</FactRow>
        )}
        <FactRow label="Visibility">
          {entity.visibility === "HIDDEN" ? "Hidden from players" : "Visible to all"}
        </FactRow>
        {showSheetLink && (
          <FactRow label="Character">
            <Link
              to={`/characters/${entity.characterId}`}
              className="font-semibold text-garnet-700 hover:underline"
            >
              Character sheet →
            </Link>
          </FactRow>
        )}
      </dl>
      {role === "OWNER" && (
        <div className="mt-3 flex items-center gap-4 border-t border-parchment-200 pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={onToggleVisibility}
            className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
          >
            {entity.visibility === "HIDDEN" ? "Reveal to players" : "Hide from players"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
          >
            Delete entity
          </button>
        </div>
      )}
    </aside>
  );
}
