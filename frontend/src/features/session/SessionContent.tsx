/**
 * SessionContent — the live-play orchestrator, rendered once SessionPage has a
 * guaranteed non-null character + real sessionId (so useTurnState's lazy
 * localStorage initializer works and no fallback character object is needed).
 *
 * Thin render: async state + handlers live in useSessionLifecycle; the turn
 * state in useTurnState. Composes SessionHeaderRegion (which swaps in the #746
 * mobile turn shell), the turn hub, the reference tabs, and the overlay layer.
 */

import type { useNavigate } from "react-router-dom";

import { RollProvider } from "@/features/dice/RollContext";
import RollResultToast from "@/features/dice/RollResultToast";
import RollModeToggle from "@/features/dice/RollModeToggle";
import CompactHpBar from "@/features/hitpoints/CompactHpBar";
import ConditionsStrip from "@/features/conditions/ConditionsStrip";
import TurnHub from "@/features/session/TurnHub";
import SessionHeaderRegion from "@/features/session/SessionHeaderRegion";
import SessionReferenceTabs from "@/features/session/SessionReferenceTabs";
import SessionOverlays from "@/features/session/SessionOverlays";
import { useTurnState } from "@/features/session/useTurnState";
import { useSessionLifecycle } from "@/features/session/useSessionLifecycle";
import { partyHealAllies } from "@/lib/spellMeta";
import { useGlobalKeyboard } from "@/hooks/useGlobalKeyboard";
import type { Character, Session, ReferenceData } from "@/types/character";

interface SessionContentProps {
  character: Character;
  session: Session;
  reference: ReferenceData | null;
  setCharacter: (c: Character) => void;
  navigate: ReturnType<typeof useNavigate>;
}

export default function SessionContent({ character, session, reference, setCharacter, navigate }: SessionContentProps) {
  const life = useSessionLifecycle({ character, session, setCharacter, navigate });
  const turnState = useTurnState(character, session.id);

  // Cmd/Ctrl+J opens the quick-capture palette during live play.
  useGlobalKeyboard(life.openCapture);

  // Mobile turn shell (#746): during the player's active turn on a mobile
  // viewport, swap the full SessionTopBar for a compact header and hide the
  // reference tabs. Pure CSS md: toggles gated on this flag — no breakpoint hook.
  const isActiveTurn = turnState.phase === "active";

  return (
    <RollProvider characterId={character.id} sessionId={session.id} onRollLogged={life.bumpLog}>
      <div className="min-h-screen bg-parchment-100">
        <SessionHeaderRegion
          character={character}
          session={session}
          isActiveTurn={isActiveTurn}
          round={turnState.round}
          leavePending={life.leavePending}
          endPending={life.endPending}
          leaveError={life.leaveError}
          onCapture={life.openCapture}
          onLeave={life.handleLeave}
          onEndClick={life.openEndPrompt}
        />

        <main className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-6">
          {/* Compact HP strip — always visible, slim. */}
          <CompactHpBar character={character} />

          {/* Active conditions + exhaustion. */}
          <ConditionsStrip character={character} onUpdate={life.handleCharacterUpdate} />

          {/* Turn hub — primary surface; inline attack/item pickers live here. */}
          <TurnHub
            character={character}
            sessionId={session.id}
            turnState={turnState}
            onUpdate={life.handleCharacterUpdate}
            onLogChanged={life.bumpLog}
            allies={partyHealAllies(session, character.id)}
          />

          {/* Reference tabs — secondary content; hidden on mobile during the active turn. */}
          <div className={isActiveTurn ? "hidden md:block" : undefined}>
            <SessionReferenceTabs
              character={character}
              session={session}
              reference={reference}
              isOwner={life.isOwner}
              activeTab={life.activeTab}
              onTabChange={life.setActiveTab}
              logRefresh={life.logRefresh}
              onLogRefresh={life.bumpLog}
              onUpdate={life.handleCharacterUpdate}
            />
          </div>
        </main>

        <SessionOverlays
          character={character}
          session={session}
          showEndPrompt={life.endPromptOpen && !life.endedSession}
          endedSession={life.endedSession}
          endPending={life.endPending}
          endError={life.endError}
          captureOpen={life.captureOpen}
          onConfirmEnd={life.handleConfirmEnd}
          onCancelEnd={life.closeEndPrompt}
          onRecapClose={life.goToSheet}
          onCaptureClose={life.closeCapture}
          onUpdate={life.handleCharacterUpdate}
        />
      </div>
      <RollModeToggle />
      <RollResultToast />
    </RollProvider>
  );
}
