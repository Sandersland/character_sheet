import MentionText from "@/features/journal/MentionText";
import { formatJournalDate } from "@/lib/formatJournalDate";
import type { CampaignEntity, JournalEntry } from "@/types/character";

// Read-only note row: body inline (with @-mention chips) alongside its date.
// NOTE rows have no title, so there's nothing to collapse behind.
function JournalEntryRow({
  entry,
  entities,
  campaignId,
}: {
  entry: JournalEntry;
  entities: Map<string, CampaignEntity>;
  campaignId?: string | null;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <MentionText
        body={entry.body}
        entities={entities}
        campaignId={campaignId}
        className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-parchment-800"
      />
      <span className="whitespace-nowrap text-xs text-parchment-600">
        {formatJournalDate(entry.date)}
      </span>
    </li>
  );
}

export default function SessionJournalList({
  entries,
  entities,
  campaignId,
}: {
  entries: JournalEntry[];
  entities: Map<string, CampaignEntity>;
  campaignId?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-parchment-600">Journal</p>
      {entries.length === 0 ? (
        <p className="text-sm text-parchment-600">No journal entries for this session.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-parchment-200">
          {entries.map((entry) => (
            <JournalEntryRow
              key={entry.id}
              entry={entry}
              entities={entities}
              campaignId={campaignId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
