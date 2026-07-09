import Badge from "@/components/ui/Badge";
import {
  AdvancementsList,
  ItemBadgeList,
  RecapGroup,
  SlotsSpentRow,
  StatTile,
} from "@/features/session/RecapPrimitives";
import { formatDuration } from "@/lib/sessionRecap";
import type { ParticipantSummary } from "@/types/character";

// One party member's contribution + time present in the shared session.
export default function ParticipantRecapCard({ summary }: { summary: ParticipantSummary }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-parchment-200 bg-parchment-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display text-sm font-semibold text-parchment-900">
          {summary.characterName}
        </span>
        <Badge tone="neutral">{formatDuration(summary.presentMs)} present</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="XP" value={summary.xpGained.toLocaleString()} tone="text-arcane-700" />
        <StatTile label="Spells" value={summary.spellsCast} tone="text-arcane-700" />
        <StatTile label="Attacks" value={summary.attackRolls} tone="text-garnet-700" />
        <StatTile label="Damage" value={summary.damageRolls} tone="text-garnet-700" />
      </div>
      {summary.itemsAcquired.length > 0 && (
        <RecapGroup label="Acquired">
          <ItemBadgeList items={summary.itemsAcquired} />
        </RecapGroup>
      )}
      {/* Coalesce: legacy participant summary blobs predate itemsSold. */}
      {(summary.itemsSold ?? []).length > 0 && (
        <RecapGroup label="Sold">
          <ItemBadgeList items={summary.itemsSold} />
        </RecapGroup>
      )}
      {/* DM-awarded loot (#382); coalesce for pre-#382 stored summaries. */}
      {(summary.loot ?? []).length > 0 && (
        <RecapGroup label="Loot">
          <ItemBadgeList items={summary.loot} />
        </RecapGroup>
      )}
      {Object.keys(summary.slotsSpent).length > 0 && (
        <RecapGroup label="Slots spent">
          <SlotsSpentRow slotsSpent={summary.slotsSpent} />
        </RecapGroup>
      )}
      {summary.featsOrAsis.length > 0 && (
        <RecapGroup label="Feats & ASIs">
          <AdvancementsList advancements={summary.featsOrAsis} />
        </RecapGroup>
      )}
    </div>
  );
}
