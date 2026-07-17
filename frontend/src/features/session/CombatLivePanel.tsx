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
 * with the live `sessionId`). It owns only UI state (the open picker + the
 * Turn/Log sub-nav) — the End/Leave lifecycle + its prompt live in the workspace
 * + sheet header (#979). The turn economy lives in the provider, so it survives a
 * swipe away (this panel stays mounted, hidden) and even a remount.
 *
 * `active` = the Combat tab is the visible tab. Overlay pickers (BottomSheet,
 * portaled to document.body) render ONLY while active, so a hidden panel's open
 * sheet never floats over Overview.
 */

import { useState, type KeyboardEvent } from "react";

import Card from "@/components/ui/Card";
import AbilityScoresPanel from "@/features/abilities/AbilityScoresPanel";
import AllSkillsCard from "@/features/abilities/AllSkillsCard";
import ConditionRollBanner from "@/features/conditions/ConditionRollBanner";
import LiveTurnBody from "@/features/session/LiveTurnBody";
import SessionLog from "@/features/session/SessionLog";
import { nextTabForKey, type LiveView } from "@/features/session/combatLiveTabs";
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
  /** The Combat tab is the visible tab — gates overlay render. */
  active: boolean;
}

export default function CombatLivePanel({
  character,
  session,
  onUpdate,
  active,
}: CombatLivePanelProps) {
  const turnState = useTurnStateContext();
  const live = useLiveSession();
  // Note: the End/Leave lifecycle + its prompt now live in the workspace + sheet
  // header (#979), not here — this panel is just the turn surface + rails.
  // #962: a small Turn/Log sub-nav — the session Log is the only secondary
  // surface that stays under Combat (Inventory/Class/Spells moved to the sheet's
  // own tabs; Loot is dropped from the UI). Mobile only — desktop (#964) shows
  // the log in a persistent right rail instead, so the sub-nav is `md:hidden`.
  const [view, setView] = useState<LiveView>("turn");
  const isBelowMd = useIsBelowMd();

  // The panel is mounted only while live+joined, so turnState is non-null in
  // practice; guard the render (never the hooks above) for safety.
  if (!turnState) return null;

  // The turn tracker is visible (so its overlay pickers may render) whenever the
  // Combat tab is active AND the turn surface is showing: on mobile that means
  // the Turn sub-nav view; on desktop the tracker is always the center column.
  const turnVisible = isBelowMd ? view === "turn" : true;

  return (
    <div className="bg-parchment-100">
      {/* A section, not a <main> — this renders inside CharacterSheetBody's
          <main> landmark (the sheet's Combat tab), so a nested main is invalid.
          Mobile: a single column with a Turn/Log sub-nav. Desktop (#964): a
          three-column live view — roll rails · turn tracker · session log — so a
          player rolls a save, watches the fight, and reads the log at once, no
          tab switch. The turn tracker (LiveTurnBody) is mounted ONCE and
          reflowed by the grid; no forked turn engine. */}
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 pt-6 md:grid md:max-w-6xl md:grid-cols-[17rem_minmax(0,1fr)_20rem] md:items-start md:gap-6">
        {/* Left rail (desktop only) — the same ability/save boxes + inline all-18
            skills as Overview (#957), rendered inside the workspace RollProvider
            so a roll stamps the seal (#956) and logs to the session for free. */}
        <aside className="hidden md:flex md:flex-col md:gap-4" aria-label="Ability checks, saves, and skills">
          {/* The condition banner (#984) rides the roll rails: this desktop-only
              rail here, and the Overview panel on mobile (the mobile Combat Turn
              view has no rails, so no banner is expected there). */}
          <ConditionRollBanner modifiers={character.rollModifiers} />
          <AbilityScoresPanel character={character} gridClassName="grid-cols-3" />
          <AllSkillsCard
            skills={character.skills}
            abilityScores={character.abilityScores}
            proficiencyBonus={character.proficiencyBonus}
          />
        </aside>

        {/* Center — the turn tracker. Mobile: gated by the Turn/Log sub-nav (stays
            mounted, hidden, so the economy + an open picker survive a flip).
            Desktop: `md:block` wins, so it is always the center column. */}
        <div className="flex flex-col gap-4">
          <div className="md:hidden">
            <TurnLogSubNav view={view} onChange={setView} />
          </div>
          <div
            className={`${view === "turn" ? "" : "hidden"} md:block`}
            role="tabpanel"
            id="combat-panel-turn"
            aria-labelledby="combat-tab-turn"
            tabIndex={0}
          >
            <LiveTurnBody
              character={character}
              session={session}
              turnState={turnState}
              onUpdate={onUpdate}
              onLogChanged={live.bumpLog}
              overlaysActive={active && turnVisible}
            />
          </div>
          {/* Mobile-only Log panel (the desktop log is the right rail). It stays
              mounted (hidden via a class), so — like the desktop rail — it reads
              the shared `logRefresh` counter to re-fetch when a roll or turn
              action logs an event (#959); without that it would show only the
              events present when the panel first mounted. */}
          <div
            className={`${view === "log" ? "" : "hidden"} md:hidden`}
            role="tabpanel"
            id="combat-panel-log"
            aria-labelledby="combat-tab-log"
            tabIndex={0}
          >
            <Card title="Session Log" className="p-4">
              <SessionLog
                characterId={character.id}
                sessionId={session.id}
                refreshKey={live.logRefresh}
              />
            </Card>
          </div>
        </div>

        {/* Right rail (desktop only) — the session log, always visible during the
            fight. It stays mounted, so it reads the shared `logRefresh` counter
            to re-fetch when a roll or turn action logs an event (#959). */}
        <aside className="hidden md:block" aria-label="Session log">
          <Card title="Session Log" className="p-4">
            <SessionLog
              characterId={character.id}
              sessionId={session.id}
              refreshKey={live.logRefresh}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}

/** The mobile Turn/Log sub-nav (#962). A tablist so the running session Log is
 *  reachable under Combat (Inventory/Class/Spells moved to the sheet's own tabs;
 *  Loot dropped). #964 renders the log as a persistent desktop column instead. */
function TurnLogSubNav({ view, onChange }: { view: LiveView; onChange: (v: LiveView) => void }) {
  const handleKeyDown = (e: KeyboardEvent, id: LiveView) => {
    const next = nextTabForKey(e.key, id);
    if (!next) return;
    e.preventDefault();
    onChange(next);
    document.getElementById(`combat-tab-${next}`)?.focus();
  };
  const tab = (id: LiveView, label: string) => (
    <button
      type="button"
      role="tab"
      id={`combat-tab-${id}`}
      aria-selected={view === id}
      aria-controls={`combat-panel-${id}`}
      tabIndex={view === id ? 0 : -1}
      onClick={() => onChange(id)}
      onKeyDown={(e) => handleKeyDown(e, id)}
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
