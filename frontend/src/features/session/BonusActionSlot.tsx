import BottomSheet from "@/components/ui/BottomSheet";
import { GiSparkles } from "@/components/ui/icons";
import { TurnSlotCard, QuickBtn, AttackCounter } from "@/features/session/TurnControls";
import type { AttackState } from "@/features/session/useTurnState";
import type { AvailableAction } from "@/types/character";

/** The Bonus Action economy slot — TWF off-hand, class bonus actions, catch-all. */
export default function BonusActionSlot({
  bonusActionUsed,
  bonusAttack,
  showBonusMenu,
  setShowBonusMenu,
  twfAvailable,
  classBonusActions,
  busy,
  handleTwfAction,
  handleActionClick,
  consumeBonusAction,
}: {
  bonusActionUsed: boolean;
  bonusAttack: AttackState | null;
  showBonusMenu: boolean;
  setShowBonusMenu: React.Dispatch<React.SetStateAction<boolean>>;
  twfAvailable: boolean;
  classBonusActions: AvailableAction[];
  busy: boolean;
  handleTwfAction: () => void;
  handleActionClick: (key: string, cost: "action" | "bonusAction" | "reaction") => void;
  consumeBonusAction: () => void;
}) {
  const preview =
    [
      ...(twfAvailable ? ["Off-hand Attack"] : []),
      ...classBonusActions.map((a) => a.name),
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
          <AttackCounter total={bonusAttack.total} used={bonusAttack.used} label="Off-hand attack" />
        )}
      </TurnSlotCard>

      {showBonusMenu && available && (
        <BottomSheet
          title="Bonus Action"
          subtitle="Pick one — nothing is spent until you choose"
          onClose={() => setShowBonusMenu(false)}
        >
          <div className="flex flex-wrap gap-1.5">
            {twfAvailable && (
              <QuickBtn tone="garnet" onClick={handleTwfAction}>
                Off-hand Attack (TWF)
              </QuickBtn>
            )}
            {classBonusActions.map((a) => (
              <QuickBtn
                key={a.key}
                tone={a.enabled ? "arcane" : "neutral"}
                disabled={!a.enabled || busy}
                onClick={() => handleActionClick(a.key, "bonusAction")}
                title={a.disabledReason}
              >
                {a.name}
              </QuickBtn>
            ))}
            <QuickBtn
              onClick={() => {
                consumeBonusAction();
                setShowBonusMenu(false);
              }}
            >
              Other Bonus Action
            </QuickBtn>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
