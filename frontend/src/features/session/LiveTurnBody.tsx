/**
 * The shared live-turn body (#960, re-weighted #982): the turn hub leads as the
 * hero, followed by a single one-line vitals strip (conditions · exhaustion ·
 * rest). This is the composition common to the `/session` page (`SessionContent`)
 * and the sheet's live Combat tab (`CombatLivePanel`).
 *
 * Order matters (#982): the turn tracker is the reason the tab exists, so it
 * renders FIRST — no HP bar or full-height conditions card pushes it below the
 * fold on mobile. HP now lives in the sheet header (with its meter), so there's
 * no HP bar here; Rest folds into CombatUtilityStrip. The strip's
 * add-condition picker opens as a BottomSheet overlay, so it never displaces the
 * tracker. Turn-engine behaviour is untouched — this is composition only, keeping
 * the #955 fidelity guarantee.
 *
 * Renders inner fragments (not a `<main>`) so each host supplies its own
 * landmark + any extras (the `/session` page appends its reference tabs).
 */

import CombatUtilityStrip from "@/features/session/CombatUtilityStrip";
import TurnHub from "@/features/session/TurnHub";
import { partyHealAllies } from "@/lib/spellMeta";
import type { TurnStateView } from "@/features/session/useTurnState";
import type { Character, Session } from "@/types/character";

interface LiveTurnBodyProps {
  character: Character;
  session: Session;
  turnState: TurnStateView;
  /** Character update handler (also bumps the session-log counter). */
  onUpdate: (c: Character) => void;
  /** Bump the session-log refresh after a combat log event. */
  onLogChanged: () => void;
  /** Gate the turn hub's overlay pickers (#960 mounted-but-hidden). */
  overlaysActive?: boolean;
  /** Opens the session log (mobile turn-bar icon, #1028). */
  onOpenLog?: () => void;
}

export default function LiveTurnBody({
  character,
  session,
  turnState,
  onUpdate,
  onLogChanged,
  overlaysActive,
  onOpenLog,
}: LiveTurnBodyProps) {
  return (
    <>
      {/* Turn hub — the primary surface, rendered FIRST (#982). Inline
          attack/item pickers live here. */}
      <TurnHub
        character={character}
        sessionId={session.id}
        turnState={turnState}
        onUpdate={onUpdate}
        onLogChanged={onLogChanged}
        allies={partyHealAllies(session, character.id)}
        overlaysActive={overlaysActive}
        onOpenLog={onOpenLog}
      />

      {/* Quiet one-line vitals strip below the hero: conditions + exhaustion +
          rest. HP lives in the sheet header now, so it's not repeated here. */}
      <CombatUtilityStrip character={character} onUpdate={onUpdate} />
    </>
  );
}
