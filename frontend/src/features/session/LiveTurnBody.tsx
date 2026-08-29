import TurnHub from "@/features/session/TurnHub";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { partyHealAllies } from "@/lib/spellMeta";
import type { TurnStateView } from "@/features/session/useTurnState";
import type { Session } from "@/types/character";

interface LiveTurnBodyProps {
  session: Session;
  turnState: TurnStateView;
  onLogChanged: () => void;
  /** Gates the hub's overlay pickers so a mounted-but-hidden Combat tab never floats a picker over another tab (#960). */
  overlaysActive?: boolean;
  onOpenLog?: () => void;
}

export default function LiveTurnBody({
  session,
  turnState,
  onLogChanged,
  overlaysActive,
  onOpenLog,
}: LiveTurnBodyProps) {
  const { character } = useCurrentCharacter();
  return (
    <TurnHub
      sessionId={session.id}
      turnState={turnState}
      onLogChanged={onLogChanged}
      allies={partyHealAllies(session, character.id)}
      overlaysActive={overlaysActive}
      onOpenLog={onOpenLog}
    />
  );
}
