/**
 * The live turn tracker, re-homed into the sheet workspace (#960): when a
 * session is live AND this character is in it, the Combat tab renders THIS
 * instead of the static combat panel. Same turn machinery as the old `/session`
 * page — start combat → your turn → action economy → end turn — just here, so
 * "swipe Combat → Overview → roll → swipe back" works.
 *
 * Consumes the #959 workspace providers: turn state via `useTurnStateContext()`
 * (never its own `useTurnState` — a second instance would diverge), live session
 * via `useLiveSession()`, and the workspace `RollProvider` (already threaded
 * with the live `sessionId`). It owns only UI state (the open picker) + the
 * End/Leave lifecycle; the turn economy lives in the provider, so it survives a
 * swipe away (this panel stays mounted, hidden) and even a remount.
 *
 * `active` = the Combat tab is the visible tab. Overlay pickers (BottomSheet,
 * portaled to document.body) render ONLY while active, so a hidden panel's open
 * sheet never floats over Overview; the End prompt is likewise active-gated.
 */

import { useState } from "react";

import Card from "@/components/ui/Card";
import LiveTurnBody from "@/features/session/LiveTurnBody";
import SessionHeaderRegion from "@/features/session/SessionHeaderRegion";
import SessionLog from "@/features/session/SessionLog";
import EndSessionPrompt from "@/features/session/EndSessionPrompt";
import { useLiveSession } from "@/features/session/LiveSessionProvider";
import { useTurnStateContext } from "@/features/session/TurnStateProvider";
import { useCombatLifecycle } from "@/features/session/useCombatLifecycle";
import type { Character, Session } from "@/types/character";

interface CombatLivePanelProps {
  character: Character;
  /** The live joined session (participants included) — parent-guaranteed non-null. */
  session: Session;
  onUpdate: (c: Character) => void;
  /** The Combat tab is the visible tab — gates overlay/prompt render. */
  active: boolean;
  /** Open the workspace quick-capture dock (the header's Note action). */
  onCapture: () => void;
}

export default function CombatLivePanel({
  character,
  session,
  onUpdate,
  active,
  onCapture,
}: CombatLivePanelProps) {
  const turnState = useTurnStateContext();
  const live = useLiveSession();
  const life = useCombatLifecycle({ character, session, onUpdate, live });
  // #962: a small Turn/Log sub-nav — the session Log is the only secondary
  // surface that stays under Combat (Inventory/Class/Spells moved to the sheet's
  // own tabs; Loot is dropped from the UI).
  const [view, setView] = useState<"turn" | "log">("turn");

  // The panel is mounted only while live+joined, so turnState is non-null in
  // practice; guard the render (never the hooks above) for safety.
  if (!turnState) return null;

  const isActiveTurn = turnState.phase === "active";

  return (
    <div className="bg-parchment-100">
      <SessionHeaderRegion
        character={character}
        session={session}
        isActiveTurn={isActiveTurn}
        round={turnState.round}
        leavePending={life.leavePending}
        endPending={life.endPending}
        leaveError={life.leaveError}
        onCapture={onCapture}
        onLeave={life.handleLeave}
        onEndClick={life.openEndPrompt}
      />

      {/* A section, not a <main> — this renders inside CharacterSheetBody's
          <main> landmark (the sheet's Combat tab), so a nested main is invalid. */}
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 pt-6">
        <TurnLogSubNav view={view} onChange={setView} />
        {/* Both views stay mounted so the turn economy + open picker survive a
            Turn↔Log flip; hide the inactive one (LiveTurnBody's overlays are also
            gated off when Log is showing). */}
        <div hidden={view !== "turn"}>
          <LiveTurnBody
            character={character}
            session={session}
            turnState={turnState}
            onUpdate={life.handleCharacterUpdate}
            onLogChanged={live.bumpLog}
            overlaysActive={active && view === "turn"}
          />
        </div>
        {view === "log" && (
          <Card title="Session Log" className="p-4">
            <SessionLog characterId={character.id} sessionId={session.id} refreshKey={live.logRefresh} />
          </Card>
        )}
      </div>

      {/* The End-Session prompt — gated on the tab being visible so a hidden
          panel never trap-focuses a dialog over Overview. The recap overlay
          lives at the workspace level (it must outlive this panel unmounting). */}
      {active && life.endPromptOpen && (
        <EndSessionPrompt
          busy={life.endPending}
          error={life.endError}
          onConfirm={life.handleConfirmEnd}
          onCancel={life.closeEndPrompt}
        />
      )}
    </div>
  );
}

/** The mobile Turn/Log sub-nav (#962). A tablist so the running session Log is
 *  reachable under Combat (Inventory/Class/Spells moved to the sheet's own tabs;
 *  Loot dropped). #964 renders the log as a persistent desktop column instead. */
function TurnLogSubNav({ view, onChange }: { view: "turn" | "log"; onChange: (v: "turn" | "log") => void }) {
  const tab = (id: "turn" | "log", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === id}
      onClick={() => onChange(id)}
      className={`rounded-control px-4 py-1.5 text-sm font-semibold transition-colors ${
        view === id ? "bg-garnet-700 text-parchment-50" : "text-parchment-600 hover:bg-parchment-100"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div role="tablist" aria-label="Combat view" className="flex gap-1 rounded-card border border-parchment-200 bg-parchment-50 p-1">
      {tab("turn", "Turn")}
      {tab("log", "Log")}
    </div>
  );
}
