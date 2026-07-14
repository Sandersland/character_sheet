import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { formatJournalDate, formatRelativeDay } from "@/lib/formatJournalDate";
import { mostMentioned, needsChronicling, type StatsEntity } from "@/lib/codexLedger";
import { ENTITY_TYPE_DOT_CLASS, ENTITY_TYPE_TONE } from "@/lib/mentions";
import type { CampaignEntity, CodexActivityItem, EntityType } from "@/types/character";

interface CodexActivityRailProps {
  campaignId: string;
  statsEntities: CampaignEntity[];
  activity: CodexActivityItem[];
}

interface ChipEntity {
  id: string;
  name: string;
  type: EntityType;
}

function EntityChipLink({ campaignId, entity }: { campaignId: string; entity: ChipEntity }) {
  return (
    <Link
      to={`/campaigns/${campaignId}/entities/${entity.id}`}
      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
    >
      <Badge tone={ENTITY_TYPE_TONE[entity.type]} className="ring-1 ring-parchment-900/10">
        @{entity.name}
      </Badge>
    </Link>
  );
}

function cardHeading(text: string) {
  return <h3 className="font-display text-base font-semibold text-parchment-900">{text}</h3>;
}

function ActivityTime({ date }: { date: string }) {
  return (
    <time dateTime={date} title={formatJournalDate(date)} className="mt-0.5 block text-xs text-parchment-500">
      {formatRelativeDay(date)}
    </time>
  );
}

function RecentlyChronicled({
  campaignId,
  activity,
}: {
  campaignId: string;
  activity: CodexActivityItem[];
}) {
  return (
    <Card className="p-4">
      {cardHeading("Recently chronicled")}
      {activity.length === 0 ? (
        <p className="mt-2 text-sm text-parchment-600">
          Nothing chronicled yet — @-mention entities in journal notes and the latest activity
          appears here.
        </p>
      ) : (
        <ol className="mt-3">
          {activity.map((item, i) => (
            <li key={`${item.entity.id}-${item.date}-${i}`} className="group flex gap-2.5">
              <span aria-hidden="true" className="flex flex-col items-center">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ENTITY_TYPE_DOT_CLASS[item.entity.type]}`}
                />
                {i < activity.length - 1 && <span className="mt-1 w-px grow bg-parchment-200" />}
              </span>
              <div className="min-w-0 pb-4 text-sm leading-relaxed text-parchment-700 group-last:pb-0">
                {item.kind === "mention" ? (
                  <>
                    <span className="font-medium italic">{item.characterName}</span> tagged{" "}
                    <EntityChipLink campaignId={campaignId} entity={item.entity} />{" "}
                    {item.sessionOrdinal != null
                      ? `in a Session ${item.sessionOrdinal} note`
                      : "in a note"}
                  </>
                ) : (
                  <>
                    <EntityChipLink campaignId={campaignId} entity={item.entity} /> was added to
                    the codex
                  </>
                )}
                <ActivityTime date={item.date} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function needsSentence(count: number): string {
  return count === 1
    ? "1 entry has been mentioned but has no description yet."
    : `${count} entries have been mentioned but have no description yet.`;
}

// Gold surface built directly (not Card): Card's own bg-parchment-50 vs a
// className override is a stylesheet-order coin flip.
export function NeedsChroniclingCard({
  campaignId,
  entities,
}: {
  campaignId: string;
  entities: StatsEntity[];
}) {
  if (entities.length === 0) return null;
  return (
    <section className="rounded-card border border-gold-200 bg-gold-50 p-4 shadow-card">
      <h3 className="font-display text-base font-semibold text-gold-800">Needs chronicling</h3>
      <p className="mt-1 text-sm text-gold-800">{needsSentence(entities.length)}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {entities.slice(0, 6).map((e) => (
          <EntityChipLink key={e.id} campaignId={campaignId} entity={e} />
        ))}
      </div>
      <Link
        to={`/campaigns/${campaignId}/entities/${entities[0].id}?edit=1`}
        className="mt-3 inline-block text-sm font-semibold text-gold-800 hover:text-gold-700"
      >
        Add what you know →
      </Link>
    </section>
  );
}

// Mobile/lg complement of the xl rail: one-line gold banner above the ledger.
export function NeedsChroniclingBanner({
  campaignId,
  statsEntities,
}: {
  campaignId: string;
  statsEntities: CampaignEntity[];
}) {
  const needs = needsChronicling(statsEntities);
  if (needs.length === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-card border border-gold-200 bg-gold-50 px-3 py-2 shadow-card xl:hidden">
      <p className="text-sm text-gold-800">{needsSentence(needs.length)}</p>
      <Link
        to={`/campaigns/${campaignId}/entities/${needs[0].id}?edit=1`}
        className="text-sm font-semibold text-gold-800 hover:text-gold-700"
      >
        Add what you know →
      </Link>
    </div>
  );
}

function MostMentioned({ campaignId, top }: { campaignId: string; top: StatsEntity[] }) {
  if (top.length === 0) return null;
  return (
    <Card className="p-4">
      {cardHeading("Most mentioned")}
      <ol className="mt-2.5 space-y-2">
        {top.map((e, i) => (
          <li key={e.id} className="flex min-w-0 items-center gap-2 text-sm">
            <span className="w-4 shrink-0 text-right font-semibold tabular-nums text-parchment-500">
              {i + 1}
            </span>
            <EntityChipLink campaignId={campaignId} entity={e} />
            <span className="ml-auto shrink-0 text-xs font-medium tabular-nums text-parchment-600">
              ×{e.stats.mentionCount}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// Codex activity rail (#841): fully controlled — CampaignCodex owns the data
// via useCodexActivity. Desktop-only; the mobile complement is the banner.
export default function CodexActivityRail({
  campaignId,
  statsEntities,
  activity,
}: CodexActivityRailProps) {
  const needs = needsChronicling(statsEntities);
  const top = mostMentioned(statsEntities);
  return (
    <aside
      aria-label="Codex activity"
      className="hidden xl:sticky xl:top-6 xl:flex xl:flex-col xl:gap-4 xl:self-start"
    >
      <RecentlyChronicled campaignId={campaignId} activity={activity} />
      <NeedsChroniclingCard campaignId={campaignId} entities={needs} />
      <MostMentioned campaignId={campaignId} top={top} />
    </aside>
  );
}
