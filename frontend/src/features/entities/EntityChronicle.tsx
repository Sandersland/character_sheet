import { useState } from "react";
import { Link } from "react-router-dom";

import EmptyState from "@/components/ui/EmptyState";
import { GiQuillInk } from "@/components/ui/icons";
import MentionText from "@/features/journal/MentionText";
import { chronicleGroups, splitChronicle, type ChronicleGroup } from "@/lib/entityBacklinks";
import { formatJournalDate } from "@/lib/formatJournalDate";
import type { CampaignEntity, EntityBacklink } from "@/types/character";

function groupHeading(group: ChronicleGroup): string {
  if (!group.sessionId) return "Outside a session";
  const label = group.sessionOrdinal ? `Session ${group.sessionOrdinal}` : "Session";
  return group.sessionTitle ? `${label} — ${group.sessionTitle}` : label;
}

// Sheets are owner-only views: only the viewer's own character gets a link (#842).
function ownsCharacter(
  characters: { id: string; ownerId: string }[],
  characterId: string,
  viewerId?: string,
): boolean {
  return !!viewerId && characters.some((c) => c.id === characterId && c.ownerId === viewerId);
}

function ChronicleEntry({
  link,
  entityId,
  byId,
  campaignId,
  characters,
  viewerId,
}: {
  link: EntityBacklink;
  entityId?: string;
  byId: Map<string, CampaignEntity>;
  campaignId?: string;
  characters: { id: string; ownerId: string }[];
  viewerId?: string;
}) {
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className="absolute -left-6 top-1.5 h-2 w-2 rounded-full bg-garnet-300"
      />
      <MentionText
        body={link.entry.body}
        entities={byId}
        campaignId={campaignId}
        className="whitespace-pre-wrap text-sm text-parchment-800"
      />
      <p className="mt-0.5 text-xs text-parchment-500">
        {ownsCharacter(characters, link.entry.characterId, viewerId) ? (
          <Link
            to={`/characters/${link.entry.characterId}`}
            className="font-semibold text-garnet-700 hover:underline"
          >
            {link.characterName}
          </Link>
        ) : (
          <span className="font-semibold text-parchment-700">{link.characterName}</span>
        )}{" "}
        · {formatJournalDate(link.entry.date)}
        {link.identity.id !== entityId && (
          <span className="italic">
            {" "}
            · as{" "}
            <Link
              to={`/campaigns/${campaignId}/entities/${link.identity.id}`}
              className="text-garnet-700 hover:underline"
            >
              {link.identity.name}
            </Link>
          </span>
        )}
      </p>
    </li>
  );
}

// Session-grouped timeline of the notes that @-tag this entity (#842); the
// latest three session groups show, the rest sit behind an expander.
export default function EntityChronicle({
  backlinks,
  entityId,
  byId,
  campaignId,
  characters,
  viewerId,
}: {
  backlinks: EntityBacklink[];
  entityId?: string;
  byId: Map<string, CampaignEntity>;
  campaignId?: string;
  characters: { id: string; ownerId: string }[];
  viewerId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const groups = chronicleGroups(backlinks);
  const { visible, hidden } = splitChronicle(groups);
  const shown = expanded ? groups : visible;

  return (
    <section aria-labelledby="entity-chronicle-heading" className="flex flex-col gap-3">
      <h2
        id="entity-chronicle-heading"
        className="font-display text-lg font-semibold text-parchment-900"
      >
        Chronicle
      </h2>
      {backlinks.length === 0 ? (
        <EmptyState
          icon={<GiQuillInk />}
          title="No mentions yet"
          description="Notes that tag this entity will appear here."
          size="sm"
        />
      ) : (
        <div className="flex flex-col gap-5">
          {shown.map((group) => (
            <div key={group.key} className="flex flex-col gap-2">
              <p className="text-xs font-semibold tracking-wide text-parchment-500">
                <span className="uppercase">{groupHeading(group)}</span>
                {group.sessionId && <> · {formatJournalDate(group.date)}</>}
              </p>
              <ol className="flex flex-col gap-4 border-l border-parchment-200 pl-5">
                {group.items.map((link) => (
                  <ChronicleEntry
                    key={link.entry.id}
                    link={link}
                    entityId={entityId}
                    byId={byId}
                    campaignId={campaignId}
                    characters={characters}
                    viewerId={viewerId}
                  />
                ))}
              </ol>
            </div>
          ))}
          {hidden.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="self-start text-xs font-semibold text-garnet-700 hover:underline"
            >
              {expanded ? "Show recent sessions only" : `Show earlier sessions (${hidden.length})`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
