import BottomSheet from "@/components/ui/BottomSheet";
import { GiSparkles } from "@/components/ui/icons";
import BonusActionSheetBody from "@/features/session/BonusActionSheetBody";
import { TurnSlotCard, AttackCounter } from "@/features/session/TurnControls";
import type { AttackState } from "@/features/session/useTurnState";
import type { BonusSheetModel } from "@/lib/turnOptions";
import type { AvailableAction } from "@/types/character";

/** The ≤4-item preview line for the collapsed Bonus Action slot card. */
function bonusPreview(
  twfAvailable: boolean,
  classBonusActions: AvailableAction[],
  bonusSpells: { name: string }[],
): string {
  return (
    [
      ...(twfAvailable ? ["Off-hand Attack"] : []),
      ...classBonusActions.map((a) => a.name),
      ...bonusSpells.map((s) => s.name),
      "Other",
    ]
      .slice(0, 4)
      .join(" · ") || "Other bonus action"
  );
}

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
  handleFlurryAction,
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
  handleFlurryAction: () => void;
  handleActionClick: (key: string, cost: "action" | "bonusAction" | "reaction") => void;
  handleBonusSpellCast: (spellId: string) => void;
  consumeBonusAction: () => void;
}) {
  const preview = bonusPreview(twfAvailable, classBonusActions, sheetModel.bonusSpells);
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
        {/* bonusAttack is shared by TWF (off-hand), the free Bonus Unarmed
            Strike (#1218), and Flurry of Blows (#1217); bonusAttackLabel
            (computed by the parent from the active resolution) names which. */}
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
            handleFlurryAction={handleFlurryAction}
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
