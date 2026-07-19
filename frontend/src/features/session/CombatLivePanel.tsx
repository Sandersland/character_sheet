/**
 * The live Combat tab (#960, unified #1086): when a session is live AND this
 * character is in it, the Combat tab renders THIS instead of the idle panel. It
 * fills the SAME CombatColumn as idle — turn slot = the live turn tracker, HP slot
 * = a compact HP card, conditions slot = CombatUtilityStrip (conditions ·
 * exhaustion · rest), log = a one-line row — so switching idle↔live moves only the
 * turn + HP slots and nothing else shifts. No abilities/skills rail, no persistent
 * log card: the log opens on demand in a right Drawer (desktop) or BottomSheet
 * (mobile).
 *
 * Consumes the #959 workspace providers: turn state via `useTurnStateContext()`
 * (never its own `useTurnState`), live session via `useLiveSession()`, and the
 * workspace `RollProvider` (threaded with the live `sessionId`). It owns only the
 * open-log UI state; the End/Leave lifecycle lives in the workspace + sheet header
 * (#979). The turn economy lives in the provider, so it survives a swipe away
 * (this panel stays mounted, hidden) and a remount.
 *
 * `active` = the Combat tab is the visible tab. The log overlay renders ONLY while
 * active, so a hidden panel's open drawer never floats over another tab.
 */

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
import { useLiveSession } from "@/features/session/LiveSessionProvider";
import { useTurnStateContext } from "@/features/session/TurnStateProvider";
import type { Character, Session } from "@/types/character";

interface CombatLivePanelProps {
  character: Character;
  /** The live joined session (participants included) — parent-guaranteed non-null. */
  session: Session;
  /** Character update handler — already bumps the session-log counter (the lifted
   *  `useCombatLifecycle.handleCharacterUpdate`, #979). */
  onUpdate: (c: Character) => void;
  /** The Combat tab is the visible tab — gates the log overlay render. */
  active: boolean;
}

export default function CombatLivePanel({ character, session, onUpdate, active }: CombatLivePanelProps) {
  const turnState = useTurnStateContext();
  const live = useLiveSession();
  const [showLog, setShowLog] = useState(false);
  const isBelowMd = useIsBelowMd();

  // The panel is mounted only while live+joined, so turnState is non-null in
  // practice; guard the render (never the hooks above) for safety.
  if (!turnState) return null;

  const openLog = () => setShowLog(true);

  return (
    <div className="px-0 pt-4 md:px-6 md:pt-6">
      <CombatColumn
        character={character}
        turnSlot={
          <LiveTurnBody
            character={character}
            session={session}
            turnState={turnState}
            onUpdate={onUpdate}
            onLogChanged={live.bumpLog}
            overlaysActive={active}
            onOpenLog={openLog}
          />
        }
        // Mobile keeps HP in the sheet header (#1085); desktop's canonical HP
        // affordance is this compact card (the DesktopUtilityLine stopgap is gone).
        hpSlot={isBelowMd ? null : <LiveHpCard character={character} onUpdate={onUpdate} />}
        conditionsSlot={<CombatUtilityStrip character={character} onUpdate={onUpdate} />}
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

      {/* Overlay gated on `active` (mounted-hidden panel invariant, #960): an open
          drawer must never float over another tab. */}
      {active && showLog &&
        (isBelowMd ? (
          <BottomSheet title="Session Log" onClose={() => setShowLog(false)}>
            <SessionLog characterId={character.id} sessionId={session.id} refreshKey={live.logRefresh} />
          </BottomSheet>
        ) : (
          <Drawer title="Session Log" onClose={() => setShowLog(false)}>
            <SessionLog characterId={character.id} sessionId={session.id} refreshKey={live.logRefresh} />
          </Drawer>
        ))}
    </div>
  );
}

// The desktop live HP card (#1086): the meter wrapped in ManageHpButton, whose
// dynamic accessible name carries the HP numbers. One canonical HP affordance for
// desktop live play — the header dropped HP (#1085) and DesktopUtilityLine no
// longer carries it.
function LiveHpCard({ character, onUpdate }: { character: Character; onUpdate: (c: Character) => void }) {
  const { hitPoints, hitDice } = character;
  return (
    <ManageHpButton
      character={character}
      onUpdate={onUpdate}
      className="flex w-full items-center gap-4 rounded-card border border-parchment-200 bg-parchment-50 px-4 py-3 text-left shadow-card transition-colors hover:bg-parchment-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
    >
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
