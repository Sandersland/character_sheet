import { useState } from "react";

import BottomSheet from "@/components/ui/BottomSheet";
import Drawer from "@/components/ui/Drawer";
import { ChevronRight } from "@/components/ui/icons";
import CombatColumn from "@/features/session/CombatColumn";
import CombatLogRow from "@/features/session/CombatLogRow";
import CombatUtilityStrip from "@/features/session/CombatUtilityStrip";
import LiveTurnBody from "@/features/session/LiveTurnBody";
import SessionLog from "@/features/session/SessionLog";
import HpMeter from "@/features/hitpoints/HpMeter";
import ManageHpButton from "@/features/hitpoints/ManageHpButton";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import { formatSessionDate } from "@/lib/sessionDate";
import { useLiveSession } from "@/features/session/LiveSessionProvider";
import { useTurnStateContext } from "@/features/session/TurnStateProvider";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { Session } from "@/types/character";

interface CombatLivePanelProps {
  session: Session;
  active: boolean;
}

export default function CombatLivePanel({ session, active }: CombatLivePanelProps) {
  const { character } = useCurrentCharacter();
  // Turn state must come from useTurnStateContext(), never a local useTurnState — keeps the #959 workspace provider as the single source.
  const turnState = useTurnStateContext();
  const live = useLiveSession();
  const [showLog, setShowLog] = useState(false);
  const isBelowMd = useIsBelowMd();

  if (!turnState) return null;

  const openLog = () => setShowLog(true);
  // Mirrors CombatLogRow's idle-row title-fallback rule — keep both in sync.
  const logSubtitle = session.title ?? formatSessionDate(session.startedAt);

  return (
    <div className="px-0 pt-4 md:px-6 md:pt-6">
      <CombatColumn
        turnSlot={
          <LiveTurnBody
            session={session}
            turnState={turnState}
            onLogChanged={live.bumpLog}
            overlaysActive={active}
            onOpenLog={openLog}
          />
        }
        hpSlot={isBelowMd ? null : <LiveHpCard />}
        conditionsSlot={<CombatUtilityStrip />}
        logRow={
          <CombatLogRow
            mode="live"
            characterId={character.id}
            sessionId={session.id}
            refreshKey={live.logRefresh}
            onOpen={openLog}
          />
        }
      />

      {active && showLog &&
        (isBelowMd ? (
          <BottomSheet title="Session Log" subtitle={logSubtitle} onClose={() => setShowLog(false)}>
            <SessionLog characterId={character.id} sessionId={session.id} refreshKey={live.logRefresh} />
          </BottomSheet>
        ) : (
          <Drawer title="Session Log" subtitle={logSubtitle} onClose={() => setShowLog(false)}>
            <SessionLog characterId={character.id} sessionId={session.id} refreshKey={live.logRefresh} />
          </Drawer>
        ))}
    </div>
  );
}

// ManageHpButton computes its own accessible name from the HP numbers, so this needs no aria-label.
function LiveHpCard() {
  const { character } = useCurrentCharacter();
  const { hitPoints, hitDice } = character;
  return (
    <ManageHpButton className="flex w-full items-center gap-4 rounded-card border border-parchment-200 bg-parchment-50 px-4 py-3 text-left shadow-card transition-colors hover:bg-parchment-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600">
      <span className="min-w-0 flex-1">
        <HpMeter
          current={hitPoints.current}
          max={hitPoints.max}
          temp={hitPoints.temp}
          availableDice={hitDice.total - hitDice.spent}
          hitDiceTotal={hitDice.total}
          die={hitDice.die}
        />
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-garnet-700">
        Manage
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </ManageHpButton>
  );
}
