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

import { useState } from "react";

import BottomSheet from "@/components/ui/BottomSheet";
import Card from "@/components/ui/Card";
import AbilityScoresPanel from "@/features/abilities/AbilityScoresPanel";
import AllSkillsCard from "@/features/abilities/AllSkillsCard";
import ConditionRollBanner from "@/features/conditions/ConditionRollBanner";
import LiveTurnBody from "@/features/session/LiveTurnBody";
import LogPeek from "@/features/session/LogPeek";
import SessionLog from "@/features/session/SessionLog";
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
  // #1028: on mobile the Turn/Log segmented control is gone — the log opens as a
  // bottom sheet (turn-bar icon + the pinned peek strip). Desktop (#964) keeps
  // the log as a persistent right rail.
  const [showLog, setShowLog] = useState(false);
  const isBelowMd = useIsBelowMd();

  // The panel is mounted only while live+joined, so turnState is non-null in
  // practice; guard the render (never the hooks above) for safety.
  if (!turnState) return null;

  return (
    <div className="bg-parchment-100">
      {/* A section, not a <main> — this renders inside CharacterSheetBody's
          <main> landmark (the sheet's Combat tab), so a nested main is invalid.
          Mobile: a single column with a Turn/Log sub-nav. Desktop (#964): a
          three-column live view — roll rails · turn tracker · session log — so a
          player rolls a save, watches the fight, and reads the log at once, no
          tab switch. The turn tracker (LiveTurnBody) is mounted ONCE and
          reflowed by the grid; no forked turn engine.

          Mobile top spacing (#986): the host `<main>` already pads `py-8` (32px)
          and the compact fight bar sits directly above, so the panel's own top
          padding was stacking into a ~56px dead band under the bar. `-mt-8`
          cancels main's top pad and `pt-4` restores a tight, comfortable gap so
          the turn tracker sits close under the fight bar; desktop keeps its
          normal `md:pt-6` (the garnet banner, not a thin bar, sits above).
          Mobile is full-bleed (#1028): `px-0` lets the turn bar + action rows
          reach the viewport edge; desktop restores `md:px-6`. */}
      <div className="mx-auto -mt-8 flex max-w-4xl flex-col gap-4 px-0 pt-4 md:mt-0 md:grid md:max-w-6xl md:grid-cols-[17rem_minmax(0,1fr)_20rem] md:items-start md:gap-6 md:px-6 md:pt-6">
        {/* Left rail (desktop only) — the same ability/save boxes + inline all-18
            skills as Overview (#957), rendered inside the workspace RollProvider
            so a roll stamps the seal (#956) and logs to the session for free. */}
        <aside className="hidden md:flex md:flex-col md:gap-4" aria-label="Ability checks, saves, and skills">
          {/* The condition banner (#984) rides the roll rails: this desktop-only
              rail here, and the Overview panel on mobile (the mobile Combat Turn
              view has no rails, so no banner is expected there). */}
          <ConditionRollBanner modifiers={character.rollModifiers} />
          {/* `muted` (#986): the rail is a reference surface next to the turn
              tracker, so its ability boxes + skills card render flat and calmer
              — the tracker stays the hero. All 18 skills + all saves still show. */}
          <AbilityScoresPanel character={character} gridClassName="grid-cols-3" muted />
          <AllSkillsCard
            skills={character.skills}
            abilityScores={character.abilityScores}
            proficiencyBonus={character.proficiencyBonus}
            muted
          />
        </aside>

        {/* Center — the turn tracker. Mobile: the only column; the log is a
            bottom sheet (turn-bar icon + peek strip). Desktop: the center column,
            log in the right rail. */}
        <div className="flex flex-col gap-4">
          <LiveTurnBody
            character={character}
            session={session}
            turnState={turnState}
            onUpdate={onUpdate}
            onLogChanged={live.bumpLog}
            overlaysActive={active}
            onOpenLog={isBelowMd ? () => setShowLog(true) : undefined}
          />
          {/* Mobile log peek (#1028) — pinned one-liner above the bottom nav; taps
              open the full log sheet. Mount-gated on isBelowMd (not md:hidden) so
              it doesn't fetch the session on desktop, where the right rail does. */}
          {isBelowMd && (
            <LogPeek
              characterId={character.id}
              sessionId={session.id}
              refreshKey={live.logRefresh}
              onOpen={() => setShowLog(true)}
            />
          )}
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

      {/* Mobile log bottom sheet (#1028) — opened by the turn-bar icon or the peek
          strip; reuses the same SessionLog + shared refresh counter. */}
      {isBelowMd && showLog && (
        <BottomSheet title="Session Log" onClose={() => setShowLog(false)}>
          <SessionLog
            characterId={character.id}
            sessionId={session.id}
            refreshKey={live.logRefresh}
          />
        </BottomSheet>
      )}
    </div>
  );
}
