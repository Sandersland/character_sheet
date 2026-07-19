import { useState } from "react";

import BottomSheet from "@/components/ui/BottomSheet";
import Drawer from "@/components/ui/Drawer";
import ConditionsStrip from "@/features/conditions/ConditionsStrip";
import HitPointTracker from "@/features/hitpoints/HitPointTracker";
import CombatColumn from "@/features/session/CombatColumn";
import CombatLogRow from "@/features/session/CombatLogRow";
import SessionDoorwayCard from "@/features/session/SessionDoorwayCard";
import SessionLog from "@/features/session/SessionLog";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

/**
 * Combat tab, idle (#1086) — the same CombatColumn the live panel fills, with the
 * doorway card in the turn slot and the full HitPointTracker in the HP slot. The
 * last-session log collapses to one line; tapping it opens the log in a right
 * Drawer (desktop) or BottomSheet (mobile). When a session goes live this panel
 * is replaced by CombatLivePanel (CharacterSheetBody gating, untouched).
 */
export default function CombatPanel({ character, reference, onUpdate }: SheetPanelProps) {
  const [logSessionId, setLogSessionId] = useState<string | null>(null);
  const isBelowMd = useIsBelowMd();

  return (
    <>
      <CombatColumn
        character={character}
        turnSlot={<SessionDoorwayCard characterId={character.id} />}
        hpSlot={
          <HitPointTracker
            character={character}
            referenceClasses={reference?.classes ?? []}
            onUpdate={onUpdate}
          />
        }
        conditionsSlot={<ConditionsStrip character={character} onUpdate={onUpdate} />}
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
