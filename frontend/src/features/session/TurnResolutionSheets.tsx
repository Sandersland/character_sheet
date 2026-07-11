// The active-turn resolution sheets (#737 extraction, no behavior change):
// when an action opens a resolver, the matching picker renders in a BottomSheet.
// Pulled out of TurnHub so that monolith stays under the complexity gate as the
// turn surface grows (undo, concentration, death saves, …).

import BottomSheet from "@/components/ui/BottomSheet";
import InlineAttackPicker from "@/features/session/InlineAttackPicker";
import InlineItemPicker from "@/features/session/InlineItemPicker";
import InlineSpellPicker from "@/features/session/InlineSpellPicker";
import LayOnHandsInput from "@/features/session/LayOnHandsInput";
import type { ActiveResolution } from "@/features/session/useActiveResolution";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { AllyOption } from "@/lib/spellMeta";
import type { Character } from "@/types/character";

type SpellSlot = "action" | "bonusAction" | "reaction";

const SPELL_SHEET_TITLE: Record<SpellSlot, string> = {
  action: "Cast a Spell",
  bonusAction: "Bonus-Action Spell",
  reaction: "Reaction Spell",
};

const SPELL_CASTING_TIME: Record<SpellSlot, string> = {
  action: "1 action",
  bonusAction: "1 bonus action",
  reaction: "1 reaction",
};

interface TurnResolutionSheetsProps {
  character: Character;
  sessionId: string;
  turnState: TurnState & TurnStateActions;
  activeResolution: ActiveResolution | null;
  closeResolution: () => void;
  setShowActionMenu: React.Dispatch<React.SetStateAction<boolean>>;
  onUpdate: (c: Character) => void;
  onLogChanged: () => void;
  allies: AllyOption[];
  send: React.ComponentProps<typeof LayOnHandsInput>["onSend"];
}

export default function TurnResolutionSheets({
  character,
  sessionId,
  turnState,
  activeResolution,
  closeResolution,
  setShowActionMenu,
  onUpdate,
  onLogChanged,
  allies,
  send,
}: TurnResolutionSheetsProps) {
  const kind = activeResolution?.resolver.kind;

  if (kind === "attack-picker") {
    return (
      <BottomSheet
        title="Attack"
        subtitle="1 attack · no target AC tracked — read the roll to your DM"
        onClose={() => {
          turnState.cancelAttack();
          closeResolution();
        }}
      >
        <InlineAttackPicker
          character={character}
          turnState={turnState}
          sessionId={sessionId}
          onClose={() => {
            turnState.finishAttack();
            closeResolution();
          }}
          onCancel={() => {
            turnState.cancelAttack();
            closeResolution();
            setShowActionMenu(true);
          }}
          onUpdate={onUpdate}
          onLogChanged={onLogChanged}
        />
      </BottomSheet>
    );
  }

  if (kind === "item-picker") {
    return (
      <BottomSheet title="Use an item" onClose={closeResolution}>
        <InlineItemPicker character={character} onUpdate={onUpdate} onClose={closeResolution} />
      </BottomSheet>
    );
  }

  if (kind === "heal-input") {
    return (
      <BottomSheet title="Lay on Hands" onClose={closeResolution}>
        <LayOnHandsInput character={character} onSend={send} onClose={closeResolution} />
      </BottomSheet>
    );
  }

  if (kind === "spell-picker" && character.spellcasting) {
    return (
      <SpellResolutionSheet
        character={character}
        sessionId={sessionId}
        turnState={turnState}
        slot={activeResolution!.resolver.slot as SpellSlot}
        closeResolution={closeResolution}
        onUpdate={onUpdate}
        onLogChanged={onLogChanged}
        allies={allies}
      />
    );
  }

  return null;
}

function SpellResolutionSheet({
  character,
  sessionId,
  turnState,
  slot,
  closeResolution,
  onUpdate,
  onLogChanged,
  allies,
}: {
  character: Character;
  sessionId: string;
  turnState: TurnState & TurnStateActions;
  slot: SpellSlot;
  closeResolution: () => void;
  onUpdate: (c: Character) => void;
  onLogChanged: () => void;
  allies: AllyOption[];
}) {
  const slotAvailable =
    slot === "action"
      ? turnState.actionsRemaining > 0
      : slot === "bonusAction"
        ? !turnState.bonusActionUsed
        : !turnState.reactionUsed;

  const onCommitSlot = (spellLevel: number) => {
    if (slot === "action") turnState.commitActionSpell(spellLevel);
    else if (slot === "bonusAction") turnState.commitBonusActionSpell(spellLevel);
    else turnState.commitReactionSpell();
  };

  return (
    <BottomSheet title={SPELL_SHEET_TITLE[slot]} onClose={closeResolution}>
      <InlineSpellPicker
        character={character}
        sessionId={sessionId}
        onUpdate={onUpdate}
        onClose={closeResolution}
        onLogChanged={onLogChanged}
        slot={slot}
        slotAvailable={slotAvailable}
        onCommitSlot={onCommitSlot}
        spellCastThisTurn={turnState.spellCastThisTurn}
        allies={allies}
        castingTimeFilter={SPELL_CASTING_TIME[slot]}
      />
    </BottomSheet>
  );
}
