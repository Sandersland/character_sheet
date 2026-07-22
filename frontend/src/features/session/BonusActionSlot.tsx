import BottomSheet from "@/components/ui/BottomSheet";
import { GiSparkles } from "@/components/ui/icons";
import BonusActionSheetBody from "@/features/session/BonusActionSheetBody";
import { TurnSlotCard, AttackCounter } from "@/features/session/TurnControls";
import type { AttackState } from "@/features/session/useTurnState";
import type { BonusSheetModel } from "@/lib/turnOptions";
import type { AvailableAction } from "@/types/character";

/** The Bonus Action economy slot — TWF off-hand, class bonus actions, spells, catch-all. */
export default function BonusActionSlot({
  bonusActionUsed,
  bonusAttack,
  bonusAttackLabel,
  showBonusMenu,
  setShowBonusMenu,
  twfAvailable,
  classBonusActions,
  sheetModel,
  busy,
  handleTwfAction,
  handleActionClick,
  handleBonusSpellCast,
  consumeBonusAction,
}: {
  bonusActionUsed: boolean;
  bonusAttack: AttackState | null;
  /** Label for the pending-swing counter — "Off-hand attack" or "Bonus Unarmed
   *  Strike" (#1218), both of which share the same bonusAttack state. */
  bonusAttackLabel: string;
  showBonusMenu: boolean;
  setShowBonusMenu: React.Dispatch<React.SetStateAction<boolean>>;
  twfAvailable: boolean;
  classBonusActions: AvailableAction[];
  sheetModel: BonusSheetModel;
  busy: boolean;
  handleTwfAction: () => void;
  handleActionClick: (key: string, cost: "action" | "bonusAction" | "reaction") => void;
  handleBonusSpellCast: (spellId: string) => void;
  consumeBonusAction: () => void;
}) {
  const preview =
    [
      ...(twfAvailable ? ["Off-hand Attack"] : []),
      ...classBonusActions.map((a) => a.name),
      ...sheetModel.bonusSpells.map((s) => s.name),
      "Other",
    ]
      .slice(0, 4)
      .join(" · ") || "Other bonus action";
  const available = !bonusActionUsed;

  return (
    <>
      <TurnSlotCard
        icon={GiSparkles}
        title="Bonus Action"
        preview={preview}
        tone="garnet"
        used={bonusActionUsed && bonusAttack === null}
        onUse={available ? () => setShowBonusMenu(true) : undefined}
        useLabel="Use Bonus"
      >
        {bonusAttack !== null && (
          <AttackCounter total={bonusAttack.total} used={bonusAttack.used} label={bonusAttackLabel} />
        )}
      </TurnSlotCard>

      {showBonusMenu && available && (
        <BottomSheet
          title="Bonus Action"
          subtitle="Pick one — nothing is spent until you choose"
          onClose={() => setShowBonusMenu(false)}
        >
          <BonusActionSheetBody
            model={sheetModel}
            twfAvailable={twfAvailable}
            busy={busy}
            handleTwfAction={handleTwfAction}
            handleActionClick={handleActionClick}
            handleBonusSpellCast={handleBonusSpellCast}
            onOther={() => {
              consumeBonusAction();
              setShowBonusMenu(false);
            }}
          />
        </BottomSheet>
      )}
    </>
  );
}
