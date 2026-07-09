import Badge from "@/components/ui/Badge";
import {
  AdvancementsList,
  ItemBadgeList,
  RecapGroup,
  SlotsSpentRow,
} from "@/features/session/RecapPrimitives";
import type { CampaignRecap } from "@/types/character";

// Levels-gained + combat-rounds callouts (each shown only when nonzero).
export function RecapSecondaryFacts({
  levelsGained,
  combatRounds,
}: {
  levelsGained: number;
  combatRounds: number;
}) {
  return (
    <ul className="flex flex-col gap-2 text-sm text-parchment-900">
      {levelsGained > 0 && (
        <li className="flex items-center gap-2">
          <Badge tone="vitality">level up</Badge>
          <span>
            Gained {levelsGained} level{levelsGained === 1 ? "" : "s"}
          </span>
        </li>
      )}
      {combatRounds > 0 && (
        <li className="flex items-center gap-2">
          <Badge tone="garnet">combat</Badge>
          <span>
            {combatRounds} combat round{combatRounds === 1 ? "" : "s"}
          </span>
        </li>
      )}
    </ul>
  );
}

// The party-wide optional recap groups: sold, loot, slots spent, feats/ASIs.
// Legacy stored blobs predate some fields — coalesce before reading length.
export function RecapDomainGroups({ recap }: { recap: CampaignRecap }) {
  return (
    <>
      {(recap.itemsSold ?? []).length > 0 && (
        <RecapGroup label="Items sold">
          <ItemBadgeList items={recap.itemsSold} />
        </RecapGroup>
      )}
      {(recap.loot ?? []).length > 0 && (
        <RecapGroup label="Loot">
          <ItemBadgeList items={recap.loot} />
        </RecapGroup>
      )}
      {Object.keys(recap.slotsSpent ?? {}).length > 0 && (
        <RecapGroup label="Slots spent">
          <SlotsSpentRow slotsSpent={recap.slotsSpent} />
        </RecapGroup>
      )}
      {(recap.featsOrAsis ?? []).length > 0 && (
        <RecapGroup label="Feats & ASIs">
          <AdvancementsList advancements={recap.featsOrAsis} />
        </RecapGroup>
      )}
    </>
  );
}
