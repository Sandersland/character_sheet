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
import RestButton from "@/features/hitpoints/RestButton";
import CompactConditionsBar from "@/features/conditions/CompactConditionsBar";
import ConditionsStrip from "@/features/conditions/ConditionsStrip";
import TurnHub from "@/features/session/TurnHub";
import SessionHeaderRegion from "@/features/session/SessionHeaderRegion";
import SessionReferenceTabs from "@/features/session/SessionReferenceTabs";
import SessionOverlays from "@/features/session/SessionOverlays";
import { useTurnState } from "@/features/session/useTurnState";
import { useSessionLifecycle } from "@/features/session/useSessionLifecycle";
import { partyHealAllies } from "@/lib/spellMeta";
import { useCaptureHotkey } from "@/hooks/useCaptureHotkey";
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

  // Cmd/Ctrl+J toggles the quick-capture dock during live play.
  useCaptureHotkey(life.toggleCapture);

  // Mobile turn shell (#746): during the player's active turn on a mobile
  // viewport, swap the full SessionTopBar for a compact header and hide the
  // reference tabs. Pure CSS md: toggles gated on this flag — no breakpoint hook.
  const isActiveTurn = turnState.phase === "active";

  return (
    <RollProvider characterId={character.id} sessionId={session.id} onRollLogged={life.bumpLog} rollModifiers={character.rollModifiers}>
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

        <main className="mx-auto flex max-w-4xl flex-col gap-4 px-6 pt-6 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-6">
          {/* Compact HP strip + rest button — always visible; tap opens the HP
              sheet (#768) / rest sheet (#814). */}
          <div className="flex items-stretch gap-2">
            <div className="min-w-0 flex-1">
              <CompactHpBar character={character} onUpdate={life.handleCharacterUpdate} />
            </div>
            <RestButton character={character} onUpdate={life.handleCharacterUpdate} />
          </div>

          {/* Active conditions + exhaustion. Compact strip on mobile (tap to
              open the sheet), full card at md+ (#769). */}
          <div className="md:hidden">
            <CompactConditionsBar character={character} onUpdate={life.handleCharacterUpdate} />
          </div>
          <div className="hidden md:block">
            <ConditionsStrip character={character} onUpdate={life.handleCharacterUpdate} />
          </div>

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
