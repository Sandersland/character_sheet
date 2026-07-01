import { UNIVERSAL_ACTIONS } from "@/lib/turnRules";
import { SlotPip, QuickBtn, ReactionResult } from "@/features/session/TurnControls";
import type { AvailableAction } from "@/types/character";

/**
 * The Reaction economy slot — shared between idle and active render branches
 * so both always show the same state and the same result strip.
 */
export default function ReactionSlot({
  reactionUsed,
  showReactionMenu,
  setShowReactionMenu,
  classReactions,
  reactionManeuvers,
  superiorityRemaining,
  dieLabel,
  dieBusy,
  busy,
  reactionMessage,
  error,
  handleActionClick,
  handleReactionManeuver,
}: {
  reactionUsed: boolean;
  showReactionMenu: boolean;
  setShowReactionMenu: React.Dispatch<React.SetStateAction<boolean>>;
  classReactions: AvailableAction[];
  reactionManeuvers: Array<{ id: string; name: string }>;
  superiorityRemaining: number;
  dieLabel: string;
  dieBusy: boolean;
  busy: boolean;
  reactionMessage: string | null;
  error: string | null;
  handleActionClick: (key: string, cost: "action" | "bonusAction" | "reaction") => void;
  handleReactionManeuver: (name: string) => Promise<void>;
}) {
  return (
    <div className="rounded-card border border-parchment-200 bg-parchment-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlotPip filled={!reactionUsed} />
          <span className="text-sm font-semibold text-parchment-800">Reaction</span>
          {reactionUsed ? (
            <span className="text-xs text-parchment-600 italic">used</span>
          ) : (
            <span className="text-xs text-parchment-600">available</span>
          )}
        </div>
        {!reactionUsed && (
          <button
            type="button"
            onClick={() => setShowReactionMenu((v) => !v)}
            className="text-xs font-medium text-garnet-700 hover:underline"
          >
            {showReactionMenu ? "Hide" : "Use Reaction ▾"}
          </button>
        )}
      </div>

      {showReactionMenu && !reactionUsed && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {classReactions.map((a) => (
            <QuickBtn
              key={a.key}
              tone={a.enabled ? "arcane" : "neutral"}
              disabled={!a.enabled || busy}
              onClick={() => handleActionClick(a.key, "reaction")}
              title={a.disabledReason}
            >
              {a.name}
            </QuickBtn>
          ))}
          {UNIVERSAL_ACTIONS.filter(
            (u) =>
              u.cost === "reaction" &&
              !classReactions.some((c) => c.key === u.key),
          ).map((u) => (
            <QuickBtn
              key={u.key}
              onClick={() => handleActionClick(u.key, "reaction")}
              title={u.description}
            >
              {u.label}
            </QuickBtn>
          ))}
          {/* Battle Master reaction maneuvers (Parry, Riposte) */}
          {reactionManeuvers.map((m) => (
            <QuickBtn
              key={m.id}
              tone={superiorityRemaining > 0 ? "gold" : "neutral"}
              disabled={superiorityRemaining === 0 || dieBusy}
              onClick={() => handleReactionManeuver(m.name)}
              title={
                superiorityRemaining === 0
                  ? "No superiority dice remaining."
                  : `Spend ${dieLabel} — ${m.name}`
              }
            >
              {m.name} ({dieLabel})
            </QuickBtn>
          ))}
        </div>
      )}

      {/* Error: die spend failed before the reaction was consumed. */}
      {!reactionUsed && error && <ReactionResult message={error} tone="garnet" />}
      {/* Result: shown after the reaction is spent. */}
      {reactionUsed && <ReactionResult message={reactionMessage} />}
    </div>
  );
}
