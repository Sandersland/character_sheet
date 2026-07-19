import Badge from "@/components/ui/Badge";
import ParticipantRecapCard from "@/features/session/ParticipantRecapCard";
import { RecapDomainGroups, RecapSecondaryFacts } from "@/features/session/RecapFacts";
import { ItemBadgeList, StatTile } from "@/features/session/RecapPrimitives";
import { formatDuration, formatTimeRange, type SummarizedParticipant } from "@/lib/sessionRecap";
import type { CampaignRecap } from "@/types/character";

// The party-wide aggregate: time window, headline tiles, secondary facts,
// per-domain recap groups, and (multiplayer only) per-participant cards.
export default function CampaignRecapSection({
  recap,
  participants,
}: {
  recap: CampaignRecap;
  participants: SummarizedParticipant[];
}) {
  const hasWindow = Boolean(recap.startedAt && recap.endedAt);
  const showParticipants = recap.participantCount > 1 && participants.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-parchment-600">
        {hasWindow && <span>{formatTimeRange(recap.startedAt!, recap.endedAt!)}</span>}
        <span className="flex items-center gap-2">
          <Badge tone="neutral">{formatDuration(recap.durationMs)}</Badge>
          <Badge tone="arcane">
            {recap.participantCount} player{recap.participantCount === 1 ? "" : "s"}
          </Badge>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="XP gained" value={recap.xpGained.toLocaleString()} tone="text-arcane-700" />
        <StatTile label="Spells cast" value={recap.spellsCast} tone="text-arcane-700" />
        <StatTile label="Attack rolls" value={recap.attackRolls} tone="text-garnet-700" />
        <StatTile label="Damage rolls" value={recap.damageRolls} tone="text-garnet-700" />
      </div>

      <RecapSecondaryFacts levelsGained={recap.levelsGained} combatRounds={recap.combatRounds} />

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
          Items acquired
        </p>
        {recap.itemsAcquired.length === 0 ? (
          <p className="text-sm text-parchment-600">No items gained this session.</p>
        ) : (
          <ItemBadgeList items={recap.itemsAcquired} />
        )}
      </div>

      <RecapDomainGroups recap={recap} />

      {/* Participants — multiplayer only (#278). */}
      {showParticipants && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
            Participants
          </p>
          <div className="flex flex-col gap-2">
            {participants.map((p) => (
              <ParticipantRecapCard key={p.characterId} summary={p.summary} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
