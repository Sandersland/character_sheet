import BottomSheet from "@/components/ui/BottomSheet";
import { GiCrossedSwords } from "@/components/ui/icons";
import ActionSheetBody from "@/features/session/ActionSheetBody";
import { TurnSlotCard, AttackCounter } from "@/features/session/TurnControls";
import type { AttackState } from "@/features/session/useTurnState";
import type { ActionSheetModel } from "@/lib/turnOptions";
import type { AvailableAction, UniversalActionOption } from "@/types/character";

function slotView(
  actionsRemaining: number,
  attack: AttackState | null,
  classActions: AvailableAction[],
  served: UniversalActionOption[],
) {
  const universalActions = served.filter(
    (u) => u.cost === "action" && u.key !== "attack" && !classActions.some((c) => c.key === u.key),
  );
  const available = actionsRemaining > 0;
  const resuming = attack !== null && attack.used > 0 && attack.used < attack.total;
  return {
    // Reads the SERVED name, so a 2024 character's preview says "Magic", not
    // "Cast a Spell" — and follows the served (alphabetical) order.
    preview: ["Attack", ...classActions.map((a) => a.name), ...universalActions.map((u) => u.name)]
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
      className="mt-2 w-full rounded-control border border-garnet-300 bg-garnet-soft-surface px-3 py-1.5 text-xs font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-soft-surface-hover"
    >
      Resume attack — {attack.total - attack.used} of {attack.total} remaining
    </button>
  );
}

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
  const view = slotView(actionsRemaining, attack, classActions, sheetModel.universalActions);

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
        // Accessible name must not announce "Use Action" once none is left.
        useLabel={view.available ? "Use Action" : "Interaction options"}
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
