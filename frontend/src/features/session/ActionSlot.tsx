import BottomSheet from "@/components/ui/BottomSheet";
import { GiCrossedSwords } from "@/components/ui/icons";
import { UNIVERSAL_ACTIONS } from "@/lib/turnRules";
import ActionSheetBody from "@/features/session/ActionSheetBody";
import { TurnSlotCard, AttackCounter } from "@/features/session/TurnControls";
import type { AttackState } from "@/features/session/useTurnState";
import type { ActionSheetModel } from "@/lib/turnOptions";
import type { AvailableAction } from "@/types/character";

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
  handleActionClick: (key: string, cost: "action" | "bonusAction" | "reaction") => void;
}) {
  const universalActions = UNIVERSAL_ACTIONS.filter(
    (u) => u.cost === "action" && u.key !== "attack" && !classActions.some((c) => c.key === u.key),
  );
  const preview = ["Attack", ...classActions.map((a) => a.name), ...universalActions.map((u) => u.label)]
    .slice(0, 4)
    .join(" · ");
  const available = actionsRemaining > 0;

  return (
    <>
      <TurnSlotCard
        icon={GiCrossedSwords}
        title="Action"
        preview={preview}
        tone="garnet"
        used={!available && attack === null}
        badge={actionsRemaining > 1 ? `×${actionsRemaining}` : undefined}
        onUse={available ? () => setShowActionMenu(true) : undefined}
        useLabel="Use Action"
      >
        {attack !== null && (
          <AttackCounter total={attack.total} used={attack.used} label="Attacks" />
        )}
      </TurnSlotCard>

      {showActionMenu && available && (
        <BottomSheet
          title="Action"
          subtitle="Pick one — nothing is spent until you choose"
          onClose={() => setShowActionMenu(false)}
        >
          <ActionSheetBody
            model={sheetModel}
            busy={busy}
            handleAttackAction={handleAttackAction}
            handleActionClick={handleActionClick}
          />
        </BottomSheet>
      )}
    </>
  );
}
