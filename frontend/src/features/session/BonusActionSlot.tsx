import { SlotPip, QuickBtn, AttackCounter } from "@/features/session/TurnControls";
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
  return (
    <div className="rounded-card border border-parchment-200 bg-parchment-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlotPip filled={!bonusActionUsed && bonusAttack === null} />
          <span className="text-sm font-semibold text-parchment-800">Bonus Action</span>
          {bonusActionUsed && bonusAttack === null && (
            <span className="text-xs text-parchment-600 italic">used</span>
          )}
        </div>
        {!bonusActionUsed && (
          <button
            type="button"
            onClick={() => setShowBonusMenu((v) => !v)}
            className="text-xs font-medium text-garnet-700 hover:underline"
          >
            {showBonusMenu ? "Hide" : "Use Bonus ▾"}
          </button>
        )}
      </div>

      {bonusAttack !== null && (
        <AttackCounter
          total={bonusAttack.total}
          used={bonusAttack.used}
          label="Off-hand attack"
        />
      )}

      {showBonusMenu && !bonusActionUsed && (
        <div className="mt-2 flex flex-wrap gap-1.5">
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
      )}
    </div>
  );
}
