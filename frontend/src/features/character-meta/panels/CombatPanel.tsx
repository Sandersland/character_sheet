import { useState } from "react";

import BottomSheet from "@/components/ui/BottomSheet";
import Drawer from "@/components/ui/Drawer";
import ConditionsStrip from "@/features/conditions/ConditionsStrip";
import HitPointTracker from "@/features/hitpoints/HitPointTracker";
import CombatColumn from "@/features/session/CombatColumn";
import CombatLogRow from "@/features/session/CombatLogRow";
import SessionDoorwayCard from "@/features/session/SessionDoorwayCard";
import SessionLog from "@/features/session/SessionLog";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";

/**
 * Combat tab, idle (#1086) — the same CombatColumn the live panel fills, with the
 * doorway card in the turn slot and the full HitPointTracker in the HP slot. The
 * last-session log collapses to one line; tapping it opens the log in a right
 * Drawer (desktop) or BottomSheet (mobile). When a session goes live this panel
 * is replaced by CombatLivePanel (CharacterSheetBody gating, untouched). Takes
 * no props (still assignable to the SheetPanelProps-typed panel registry) —
 * CombatColumn is a features/session component (deferred, #1284) so it still
 * gets `character` explicitly, sourced here from the hook rather than a prop.
 */
export default function CombatPanel() {
  const { character } = useCurrentCharacter();
  const [logSessionId, setLogSessionId] = useState<string | null>(null);
  const isBelowMd = useIsBelowMd();

  return (
    <>
      <CombatColumn
        character={character}
        turnSlot={<SessionDoorwayCard characterId={character.id} />}
        hpSlot={<HitPointTracker />}
        conditionsSlot={<ConditionsStrip />}
        logRow={<CombatLogRow mode="idle" characterId={character.id} onOpen={setLogSessionId} />}
      />

      {logSessionId &&
        (isBelowMd ? (
          <BottomSheet title="Session Log" onClose={() => setLogSessionId(null)}>
            <SessionLog characterId={character.id} sessionId={logSessionId} />
          </BottomSheet>
        ) : (
          <Drawer title="Session Log" onClose={() => setLogSessionId(null)}>
            <SessionLog characterId={character.id} sessionId={logSessionId} />
          </Drawer>
        ))}
    </>
  );
}
