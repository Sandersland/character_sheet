// The active-turn resolution sheets (#737 extraction, no behavior change):
// when an action opens a resolver, the matching picker renders in a BottomSheet.
// Pulled out of TurnHub so that monolith stays under the complexity gate as the
// turn surface grows (undo, concentration, death saves, …). One component per
// resolver kind; TurnResolutionSheets itself is only the kind → sheet dispatch.

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

/** Attack-sheet kicker with the live Extra-Attack count (no counter → 1, e.g.
 *  opportunity attacks). The in-sheet footer deliberately carries no copy of it. */
function attackKicker(attack: TurnState["attack"]): string {
  const count = attack?.total ?? 1;
  return `${count} attack${count === 1 ? "" : "s"} · no target AC tracked — read the roll to your DM`;
}

// Widened past LayOnHandsInput's own narrower onSend (#1676, Song of
// Defense's slotLevel op) to the shape useTurnActions' real `send` carries —
// a shared declaration rather than deriving from one consumer's props, since
// TS's weak-type check rejects assigning between two ALL-optional object
// types with no property names in common (LayOnHandsInput's `{roll?}` vs
// SongOfDefenseInput's `{slotLevel?}`).
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
  // Attacks all spent → finalize; attacks remain → leave the action LIVE so the
  // Action slot can offer Resume (#802). cancelAttack still refunds pre-first-roll.
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
  sessionId,
  turnState,
  activeResolution,
  closeResolution,
  setShowBonusMenu,
  onLogChanged,
}: Pick<
  TurnResolutionSheetsProps,
  | "sessionId"
  | "turnState"
  | "activeResolution"
  | "closeResolution"
  | "setShowBonusMenu"
  | "onLogChanged"
>) {
  // Martial Arts Bonus Unarmed Strike (#1218) shares this sheet + the TWF
  // single-swing bonusAttack path — only the entry built (buildUnarmedEntry vs
  // buildOffHandEntry) and this title/subtitle differ.
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
        sessionId={sessionId}
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

// Flurry of Blows (#1217): strikes remaining → finalize (like the Attack
// sheet's Resume pattern); no strikes rolled yet → refund. Unlike TWF's always-
// exactly-1 swing, Flurry's 2 strikes mean a mid-way close is reachable — it
// just leaves the counter live with no explicit resume affordance (cosmetic
// only: the bonus action stays correctly spent either way).
//
// The 1 Focus spend is deliberately deferred to the FIRST strike roll, not
// opened here — `send` fires the same executeAction("flurryOfBlows") the
// generic click path uses elsewhere, just wired as InlineFlurryPicker's
// onCommitFocusSpend so a pre-roll cancel truly costs nothing.
function FlurryResolutionSheet({
  sessionId,
  turnState,
  closeResolution,
  setShowBonusMenu,
  onLogChanged,
  send,
}: Pick<
  TurnResolutionSheetsProps,
  | "sessionId"
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
        sessionId={sessionId}
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

// Song of Defense (#1676, TCoE p. 76) — Bladesinger's reaction, gated
// server-side on Bladesong being active (#1688's requiresActiveBuff; a 400
// surfaces via the mutation's error state if the player somehow opens this
// with Bladesong down). Nothing is spent until a slot is picked and used —
// same "commit at use-time" shape as Lay on Hands above.
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
  // Only rendered for the spell-picker kind, so the resolution is present.
  const slot = activeResolution!.resolver.slot as SpellSlot;
  // Open focused on this spellbook entry (bonus-spell card pre-selection).
  const focusSpellId = activeResolution!.context?.spellId;

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
    <BottomSheet title={SPELL_SHEET_TITLE[slot]} subtitle="Only what you can afford now" onClose={closeResolution}>
      <InlineSpellPicker
        sessionId={sessionId}
        onClose={closeResolution}
        onLogChanged={onLogChanged}
        slot={slot}
        slotAvailable={slotAvailable}
        onCommitSlot={onCommitSlot}
        spellCastThisTurn={turnState.spellCastThisTurn}
        allies={allies}
        castingTimeFilter={SPELL_CASTING_TIME[slot]}
        focusSpellId={focusSpellId}
        onCastSettled={turnState.recordSpellCast}
      />
    </BottomSheet>
  );
}
