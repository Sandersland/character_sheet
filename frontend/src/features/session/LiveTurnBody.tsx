/**
 * The live turn tracker — the Combat tab's turn slot (#1086). It renders the
 * TurnHub (the hero surface: action economy, inline attack/spell/item pickers)
 * and resolves the party heal-targets for it. HP, conditions/exhaustion/rest, and
 * the session log are no longer nested here — they're sibling slots of the shared
 * CombatColumn now, so idle↔live switches move only this slot and the HP card.
 *
 * Turn-engine behaviour is untouched — this is composition only, keeping the #955
 * fidelity guarantee. `overlaysActive` gates the hub's overlay pickers so a
 * mounted-but-hidden Combat tab never floats a picker over another tab (#960).
 */

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
  /** Opens the session log overlay (turn-bar icon). */
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
  );
}
