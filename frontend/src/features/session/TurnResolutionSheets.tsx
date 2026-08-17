import BottomSheet from "@/components/ui/BottomSheet";
import { flurryStrikeCount } from "@/lib/attackMath";
import InlineAttackPicker from "@/features/session/InlineAttackPicker";
import InlineFlurryPicker from "@/features/session/InlineFlurryPicker";
import InlineLoadoutPicker from "@/features/session/InlineLoadoutPicker";
import InlineOffHandPicker from "@/features/session/InlineOffHandPicker";
import InlineItemPicker from "@/features/session/InlineItemPicker";
import InlineSpellPicker from "@/features/session/InlineSpellPicker";
import LayOnHandsInput from "@/features/session/LayOnHandsInput";
import SongOfDefenseInput from "@/features/session/SongOfDefenseInput";
import type { ActiveResolution } from "@/features/session/useActiveResolution";
import type { LoadoutSwapControls } from "@/features/session/useLoadoutSwap";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import { useTurnStateContext } from "@/features/session/TurnStateProvider";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { AllyOption } from "@/lib/spellMeta";

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

function attackKicker(attack: TurnState["attack"]): string {
  const count = attack?.total ?? 1;
  return `${count} attack${count === 1 ? "" : "s"} · no target AC tracked — read the roll to your DM`;
}

type SendAction = (actionKey: string, opts?: { roll?: number; inventoryItemId?: string; slotLevel?: number }) => Promise<unknown>;

interface TurnResolutionSheetsProps {
  sessionId: string;
  turnState: TurnState & TurnStateActions;
  activeResolution: ActiveResolution | null;
  closeResolution: () => void;
  setShowActionMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setShowBonusMenu: React.Dispatch<React.SetStateAction<boolean>>;
  onLogChanged: () => void;
  allies: AllyOption[];
  send: SendAction;
  loadoutSwap: LoadoutSwapControls;
}

// fallow-ignore-next-line complexity -- one thin `case -> <XResolutionSheet {...props} />` per resolver kind (kind -> sheet dispatch, this file's whole job per its own header); adding Song of Defense's "slot-picker" case (#1676, the ninth) pushed CRAP over the estimated-coverage threshold, not real branchy logic
export default function TurnResolutionSheets(props: TurnResolutionSheetsProps) {
  const { character } = useCurrentCharacter();
  switch (props.activeResolution?.resolver.kind) {
    case "loadout-picker":
      return <LoadoutResolutionSheet {...props} />;
    case "attack-picker":
      return <AttackResolutionSheet {...props} />;
    case "twf-picker":
      return <TwfResolutionSheet {...props} />;
    case "flurry-picker":
      return <FlurryResolutionSheet {...props} />;
    case "item-picker":
      return <ItemResolutionSheet {...props} />;
    case "heal-input":
      return <HealResolutionSheet {...props} />;
    case "slot-picker":
      return <SongOfDefenseResolutionSheet {...props} />;
    case "spell-picker":
      return character.spellcasting ? <SpellResolutionSheet {...props} /> : null;
    default:
      return null;
  }
}

function LoadoutResolutionSheet({
  turnState,
  loadoutSwap,
  closeResolution,
}: Pick<TurnResolutionSheetsProps, "turnState" | "loadoutSwap" | "closeResolution">) {
  return (
    <BottomSheet
      title="Change weapons"
      subtitle="Swapping a held weapon costs your Action — drawing into a free hand or stowing is free."
      onClose={closeResolution}
    >
      <InlineLoadoutPicker turnState={turnState} loadout={loadoutSwap} />
    </BottomSheet>
  );
}

function AttackResolutionSheet({
  turnState,
  closeResolution,
  setShowActionMenu,
  onLogChanged,
}: Pick<
  TurnResolutionSheetsProps,
  | "turnState"
  | "closeResolution"
  | "setShowActionMenu"
  | "onLogChanged"
>) {
  const attack = turnState.attack;
  const exhausted = attack !== null && attack.used >= attack.total;
  const closeAttackSheet = () => {
    if (exhausted) turnState.finishAttack();
    else turnState.cancelAttack();
    closeResolution();
  };
  return (
    <BottomSheet title="Attack" subtitle={attackKicker(turnState.attack)} wide onClose={closeAttackSheet}>
      <InlineAttackPicker
        turnState={turnState}
        onClose={closeAttackSheet}
        onCancel={() => {
          turnState.cancelAttack();
          closeResolution();
          setShowActionMenu(true);
        }}
        onLogChanged={onLogChanged}
      />
    </BottomSheet>
  );
}

function TwfResolutionSheet({
  turnState,
  activeResolution,
  closeResolution,
  setShowBonusMenu,
  onLogChanged,
}: Pick<
  TurnResolutionSheetsProps,
  | "turnState"
  | "activeResolution"
  | "closeResolution"
  | "setShowBonusMenu"
  | "onLogChanged"
>) {
  const isUnarmed = activeResolution?.resolver.key === "bonusUnarmedStrike";
  return (
    <BottomSheet
      title={isUnarmed ? "Bonus Unarmed Strike" : "Off-hand attack"}
      subtitle={isUnarmed ? "Martial Arts · bonus action" : "Two-Weapon Fighting · bonus action"}
      wide
      onClose={() => {
        turnState.cancelTwf();
        closeResolution();
      }}
    >
      <InlineOffHandPicker
        turnState={turnState}
        variant={isUnarmed ? "unarmed" : "twf"}
        onClose={closeResolution}
        onCancel={() => {
          turnState.cancelTwf();
          closeResolution();
          setShowBonusMenu(true);
        }}
        onLogChanged={onLogChanged}
      />
    </BottomSheet>
  );
}

function FlurryResolutionSheet({
  turnState,
  closeResolution,
  setShowBonusMenu,
  onLogChanged,
  send,
}: Pick<
  TurnResolutionSheetsProps,
  | "turnState"
  | "closeResolution"
  | "setShowBonusMenu"
  | "onLogChanged"
  | "send"
>) {
  const { character } = useCurrentCharacter();
  const attack = turnState.bonusAttack;
  const exhausted = attack !== null && attack.used >= attack.total;
  const closeFlurrySheet = () => {
    if (exhausted) turnState.finishFlurry();
    else turnState.cancelFlurry();
    closeResolution();
  };
  const strikeCount = attack?.total ?? flurryStrikeCount(character);
  return (
    <BottomSheet
      title="Flurry of Blows"
      subtitle={`${strikeCount} Unarmed Strike${strikeCount === 1 ? "" : "s"} · bonus action`}
      wide
      onClose={closeFlurrySheet}
    >
      <InlineFlurryPicker
        turnState={turnState}
        onClose={closeFlurrySheet}
        onCancel={() => {
          turnState.cancelFlurry();
          closeResolution();
          setShowBonusMenu(true);
        }}
        onLogChanged={onLogChanged}
        onCommitFocusSpend={() => {
          void send("flurryOfBlows");
        }}
      />
    </BottomSheet>
  );
}

function ItemResolutionSheet({
  turnState,
  closeResolution,
}: Pick<TurnResolutionSheetsProps, "turnState" | "closeResolution">) {
  return (
    <BottomSheet title="Use an item" subtitle="Nothing is spent until you use an item" onClose={closeResolution}>
      <InlineItemPicker
        onCommit={(batchId) => {
          turnState.consumeAction();
          if (batchId) turnState.attachBatchId(batchId);
        }}
        onClose={closeResolution}
      />
    </BottomSheet>
  );
}

function HealResolutionSheet({
  turnState,
  closeResolution,
  send,
}: Pick<TurnResolutionSheetsProps, "turnState" | "closeResolution" | "send">) {
  return (
    <BottomSheet title="Lay on Hands" subtitle="Nothing is spent until you heal" onClose={closeResolution}>
      <LayOnHandsInput
        onSend={send}
        onCommit={turnState.consumeAction}
        onClose={closeResolution}
      />
    </BottomSheet>
  );
}

function SongOfDefenseResolutionSheet({
  turnState,
  closeResolution,
  send,
}: Pick<TurnResolutionSheetsProps, "turnState" | "closeResolution" | "send">) {
  return (
    <BottomSheet title="Song of Defense" subtitle="Nothing is spent until you use it" onClose={closeResolution}>
      <SongOfDefenseInput
        onSend={send}
        onCommit={turnState.consumeReaction}
        onClose={closeResolution}
      />
    </BottomSheet>
  );
}

function SpellResolutionSheet({
  sessionId,
  turnState,
  activeResolution,
  closeResolution,
  onLogChanged,
  allies,
}: Pick<
  TurnResolutionSheetsProps,
  | "sessionId"
  | "turnState"
  | "activeResolution"
  | "closeResolution"
  | "onLogChanged"
  | "allies"
>) {
  const slot = activeResolution!.resolver.slot as SpellSlot;
  const focusSpellId = activeResolution!.context?.spellId;

  const slotAvailable =
    slot === "action"
      ? turnState.actionsRemaining > 0
      : slot === "bonusAction"
        ? !turnState.bonusActionUsed
        : !turnState.reactionUsed;
  const refreshCombat = useTurnStateContext()?.refreshCombat;

  const onCommitSlot = (batchId?: string) => {
    if (slot === "action") turnState.commitActionSpell();
    else if (slot === "bonusAction") turnState.commitBonusActionSpell();
    else turnState.commitReactionSpell();
    // Tag the history entry the commit above just pushed with the cast's batch
    // so turn undo reverts the server cast (#758), not just the local economy.
    if (batchId) turnState.attachBatchId(batchId);
    void refreshCombat?.();
  };

  return (
    <BottomSheet title={SPELL_SHEET_TITLE[slot]} onClose={closeResolution}>
      <InlineSpellPicker
        sessionId={sessionId}
        onClose={closeResolution}
        onLogChanged={onLogChanged}
        slot={slot}
        slotAvailable={slotAvailable}
        onCommitSlot={onCommitSlot}
        spellEconomy={turnState.spellEconomy}
        allies={allies}
        castingTimeFilter={SPELL_CASTING_TIME[slot]}
        focusSpellId={focusSpellId}
        onCastSettled={turnState.recordSpellCast}
      />
    </BottomSheet>
  );
}
