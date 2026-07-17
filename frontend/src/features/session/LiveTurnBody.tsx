/**
 * The shared live-turn body (#960): the compact HP + rest strip, the conditions
 * surface, and the turn hub — the composition common to the `/session` page
 * (`SessionContent`) and the sheet's live Combat tab (`CombatLivePanel`).
 * Renders inner fragments (not a `<main>`) so each host supplies its own
 * landmark + any extras (the `/session` page appends its reference tabs).
 */

import CompactHpBar from "@/features/hitpoints/CompactHpBar";
import RestButton from "@/features/hitpoints/RestButton";
import CompactConditionsBar from "@/features/conditions/CompactConditionsBar";
import ConditionsStrip from "@/features/conditions/ConditionsStrip";
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
}

export default function LiveTurnBody({
  character,
  session,
  turnState,
  onUpdate,
  onLogChanged,
  overlaysActive,
}: LiveTurnBodyProps) {
  return (
    <>
      {/* Compact HP strip + rest button — always visible mid-turn (#768/#814). */}
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1">
          <CompactHpBar character={character} onUpdate={onUpdate} />
        </div>
        <RestButton character={character} onUpdate={onUpdate} />
      </div>

      {/* Active conditions + exhaustion (compact on mobile, card at md+, #769). */}
      <div className="md:hidden">
        <CompactConditionsBar character={character} onUpdate={onUpdate} />
      </div>
      <div className="hidden md:block">
        <ConditionsStrip character={character} onUpdate={onUpdate} />
      </div>

      {/* Turn hub — the primary surface; inline attack/item pickers live here. */}
      <TurnHub
        character={character}
        sessionId={session.id}
        turnState={turnState}
        onUpdate={onUpdate}
        onLogChanged={onLogChanged}
        allies={partyHealAllies(session, character.id)}
        overlaysActive={overlaysActive}
      />
    </>
  );
}
