import BottomSheet from "@/components/ui/BottomSheet";
import { GiCycle } from "@/components/ui/icons";
import { UNIVERSAL_ACTIONS } from "@/lib/turnRules";
import { TurnSlotCard, QuickBtn, ReactionResult } from "@/features/session/TurnControls";
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
  handleReactionManeuver: (entryId: string, name: string) => Promise<void>;
}) {
  const universalReactions = UNIVERSAL_ACTIONS.filter(
    (u) => u.cost === "reaction" && !classReactions.some((c) => c.key === u.key),
  );
  const preview =
    [
      ...classReactions.map((a) => a.name),
      ...universalReactions.map((u) => u.label),
      ...reactionManeuvers.map((m) => m.name),
    ]
      .slice(0, 4)
      .join(" · ") || "No reactions available";

  return (
    <>
      <TurnSlotCard
        icon={GiCycle}
        title="Reaction"
        preview={reactionUsed ? "used" : preview}
        tone="arcane"
        used={reactionUsed}
        onUse={!reactionUsed ? () => setShowReactionMenu(true) : undefined}
        useLabel="Use Reaction"
      >
        {/* Error: die spend failed before the reaction was consumed. */}
        {!reactionUsed && error && <ReactionResult message={error} tone="garnet" />}
        {/* Result: shown after the reaction is spent. */}
        {reactionUsed && <ReactionResult message={reactionMessage} />}
      </TurnSlotCard>

      {showReactionMenu && !reactionUsed && (
        <BottomSheet
          title="Reaction"
          subtitle="Available on your turn and off-turn"
          onClose={() => setShowReactionMenu(false)}
        >
          <div className="flex flex-wrap gap-1.5">
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
            {universalReactions.map((u) => (
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
                onClick={() => handleReactionManeuver(m.id, m.name)}
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
        </BottomSheet>
      )}
    </>
  );
}
