import { Link } from "react-router-dom";

import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { GiQuillInk } from "@/components/ui/icons";
import MentionText from "@/features/journal/MentionText";
import { groupBySession, groupByIdentity } from "@/lib/entityBacklinks";
import { formatJournalDate } from "@/lib/formatJournalDate";
import type { CampaignEntity, EntityBacklink } from "@/types/character";

function SessionGroups({
  links,
  byId,
  campaignId,
}: {
  links: EntityBacklink[];
  byId: Map<string, CampaignEntity>;
  campaignId?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {groupBySession(links).map((group) => (
        <div key={group.key} className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-parchment-500">
            {group.key === "none" ? "Outside a session" : "Session"}
          </p>
          <ul className="flex flex-col divide-y divide-parchment-200">
            {group.items.map((link) => (
              <li key={link.entry.id} className="py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    to={`/characters/${link.entry.characterId}`}
                    className="text-sm font-semibold text-garnet-700 hover:underline"
                  >
                    {link.characterName}
                  </Link>
                  <span className="whitespace-nowrap text-xs text-parchment-500">
                    {formatJournalDate(link.entry.date)}
                  </span>
                </div>
                <MentionText
                  body={link.entry.body}
                  entities={byId}
                  campaignId={campaignId}
                  className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-sm text-parchment-700"
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function EntityMentions({
  backlinks,
  byId,
  campaignId,
}: {
  backlinks: EntityBacklink[];
  byId: Map<string, CampaignEntity>;
  campaignId?: string;
}) {
  const identityGroups = groupByIdentity(backlinks);
  return (
    <Card title="Mentions" headingLevel={2} className="p-4">
      <div className="p-4">
        {backlinks.length === 0 ? (
          <EmptyState
            icon={<GiQuillInk />}
            title="No mentions yet"
            description="Notes that tag this entity will appear here."
          />
        ) : identityGroups.length > 1 ? (
          <div className="flex flex-col gap-5">
            {identityGroups.map((group) => (
              <div key={group.id} className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-parchment-700">
                  As{" "}
                  <Link
                    to={`/campaigns/${campaignId}/entities/${group.id}`}
                    className="text-garnet-700 hover:underline"
                  >
                    {group.name}
                  </Link>
                </p>
                <SessionGroups links={group.items} byId={byId} campaignId={campaignId} />
              </div>
            ))}
          </div>
        ) : (
          <SessionGroups links={backlinks} byId={byId} campaignId={campaignId} />
        )}
      </div>
    </Card>
  );
}
