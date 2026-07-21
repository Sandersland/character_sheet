import BottomSheet from "@/components/ui/BottomSheet";
import { GiCrossedSwords } from "@/components/ui/icons";
import { UNIVERSAL_ACTIONS } from "@/lib/turnRules";
import ActionSheetBody from "@/features/session/ActionSheetBody";
import { TurnSlotCard, AttackCounter } from "@/features/session/TurnControls";
import type { AttackState } from "@/features/session/useTurnState";
import type { ActionSheetModel } from "@/lib/turnOptions";
import type { AvailableAction } from "@/types/character";

// Pure slot derivations, extracted so the component stays a composition layer.
function slotView(actionsRemaining: number, attack: AttackState | null, classActions: AvailableAction[]) {
  const universalActions = UNIVERSAL_ACTIONS.filter(
    (u) => u.cost === "action" && u.key !== "attack" && !classActions.some((c) => c.key === u.key),
  );
  const available = actionsRemaining > 0;
  // An Attack action closed with attacks still to spend (#802) — offer Resume
  // without touching the action economy.
  const resuming = attack !== null && attack.used > 0 && attack.used < attack.total;
  return {
    preview: ["Attack", ...classActions.map((a) => a.name), ...universalActions.map((u) => u.label)]
      .slice(0, 4)
      .join(" · "),
    available,
    resuming,
    used: !available && !resuming && attack === null,
    badge: actionsRemaining > 1 ? `×${actionsRemaining}` : undefined,
  };
}

function ResumeAttackButton({ attack, onResume }: { attack: AttackState; onResume: () => void }) {
  return (
    <button
      type="button"
      onClick={onResume}
      className="mt-2 w-full rounded-control border border-garnet-300 bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 transition-colors hover:bg-garnet-700"
    >
      Resume attack — {attack.total - attack.used} of {attack.total} remaining
    </button>
  );
}

/** The Action economy slot — Attack path, class actions, and universal actions. */
export default function ActionSlot({
  actionsRemaining,
  attack,
  showActionMenu,
  setShowActionMenu,
  classActions,
  sheetModel,
  busy,
  handleAttackAction,
  handleResumeAttack,
  handleActionClick,
}: {
  actionsRemaining: number;
  attack: AttackState | null;
  showActionMenu: boolean;
  setShowActionMenu: React.Dispatch<React.SetStateAction<boolean>>;
  classActions: AvailableAction[];
  sheetModel: ActionSheetModel;
  busy: boolean;
  handleAttackAction: () => void;
  handleResumeAttack: () => void;
  handleActionClick: (key: string, cost: "action" | "bonusAction" | "reaction") => void;
}) {
  const view = slotView(actionsRemaining, attack, classActions);

  return (
    <>
      <TurnSlotCard
        icon={GiCrossedSwords}
        title="Action"
        preview={view.preview}
        tone="garnet"
        used={view.used}
        badge={view.badge}
        onUse={() => setShowActionMenu(true)}
        // Once the Action is spent, the button stays tappable for interaction-
        // budget options (#1165) but must NOT keep announcing "Use Action" —
        // a screen-reader user shouldn't hear an offer to use an action that
        // isn't there. Rename the accessible name to match what's actually
        // still reachable.
        useLabel={view.available ? "Use Action" : "Interaction options"}
        // Once the Action is spent, the menu still opens in free-only mode
        // (interaction budget, #1165) — replaces the old standalone
        // "Change weapons" strip that existed only as an escape hatch (#815).
        alwaysTappable
      >
        {attack !== null && (
          <AttackCounter total={attack.total} used={attack.used} label="Attacks" />
        )}
        {view.resuming && attack !== null && (
          <ResumeAttackButton attack={attack} onResume={handleResumeAttack} />
        )}
      </TurnSlotCard>

      {showActionMenu && (
        <BottomSheet
          title="Action"
          subtitle={
            view.available
              ? "Pick one — nothing is spent until you choose"
              : "Action spent — interaction budget options only"
          }
          onClose={() => setShowActionMenu(false)}
        >
          <ActionSheetBody
            model={sheetModel}
            busy={busy}
            actionAvailable={view.available}
            handleAttackAction={handleAttackAction}
            handleActionClick={handleActionClick}
          />
        </BottomSheet>
      )}
    </>
  );
}
