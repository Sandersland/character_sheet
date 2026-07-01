import { UNIVERSAL_ACTIONS } from "@/lib/turnRules";
import { SlotPip, QuickBtn, AttackCounter } from "@/features/session/TurnControls";
import type { AttackState } from "@/features/session/useTurnState";
import type { AvailableAction } from "@/types/character";

/** The Action economy slot — Attack path, class actions, and universal actions. */
export default function ActionSlot({
  actionsRemaining,
  attack,
  showActionMenu,
  setShowActionMenu,
  classActions,
  busy,
  handleAttackAction,
  handleActionClick,
}: {
  actionsRemaining: number;
  attack: AttackState | null;
  showActionMenu: boolean;
  setShowActionMenu: React.Dispatch<React.SetStateAction<boolean>>;
  classActions: AvailableAction[];
  busy: boolean;
  handleAttackAction: () => void;
  handleActionClick: (key: string, cost: "action" | "bonusAction" | "reaction") => void;
}) {
  return (
    <div className="rounded-card border border-parchment-200 bg-parchment-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlotPip filled={actionsRemaining > 0 || attack !== null} />
          <span className="text-sm font-semibold text-parchment-800">Action</span>
          {actionsRemaining > 0 && (
            <span className="text-xs text-parchment-600">
              {actionsRemaining} available
            </span>
          )}
          {actionsRemaining === 0 && attack === null && (
            <span className="text-xs text-parchment-600 italic">used</span>
          )}
        </div>
        {actionsRemaining > 0 && (
          <button
            type="button"
            onClick={() => setShowActionMenu((v) => !v)}
            className="text-xs font-medium text-garnet-700 hover:underline"
          >
            {showActionMenu ? "Hide" : "Use Action ▾"}
          </button>
        )}
      </div>

      {attack !== null && (
        <AttackCounter total={attack.total} used={attack.used} label="Attacks" />
      )}

      {showActionMenu && actionsRemaining > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {/* Attack — special path through enterAttackMode. */}
          <QuickBtn tone="garnet" onClick={handleAttackAction}>
            Attack
          </QuickBtn>
          {/* Class-specific action abilities. */}
          {classActions.map((a) => (
            <QuickBtn
              key={a.key}
              tone={a.enabled ? "arcane" : "neutral"}
              disabled={!a.enabled || busy}
              onClick={() => handleActionClick(a.key, "action")}
              title={a.disabledReason}
            >
              {a.name}
            </QuickBtn>
          ))}
          {/* Universal actions (excluding Attack which is above). */}
          {UNIVERSAL_ACTIONS.filter(
            (u) =>
              u.cost === "action" &&
              u.key !== "attack" &&
              !classActions.some((c) => c.key === u.key),
          ).map((u) => (
            <QuickBtn
              key={u.key}
              onClick={() => handleActionClick(u.key, "action")}
              title={u.description}
            >
              {u.label}
            </QuickBtn>
          ))}
        </div>
      )}
    </div>
  );
}
