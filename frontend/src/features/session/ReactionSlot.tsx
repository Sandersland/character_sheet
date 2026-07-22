import BottomSheet from "@/components/ui/BottomSheet";
import { GiCrossedSwords, GiCycle, GiSpellBook, MoreHorizontal } from "@/components/ui/icons";
import { ClassActionCard } from "@/features/session/ActionSheetBody";
import OptionCard from "@/features/session/OptionCard";
import { TurnSlotCard, ReactionResult } from "@/features/session/TurnControls";
import { UNIVERSAL_ACTIONS, type TurnActionOption } from "@/lib/turnRules";
import type { ReactionSheetModel } from "@/lib/turnOptions";
import type { AvailableAction } from "@/types/character";

/** One universal reaction as an option card — OA gets the weapon summary,
 *  reaction-speed casting is gated on the character being a caster. */
function UniversalReactionCard({
  action,
  sheetModel,
  onClick,
}: {
  action: TurnActionOption;
  sheetModel: ReactionSheetModel;
  onClick: () => void;
}) {
  if (action.key === "castSpellReaction") {
    if (!sheetModel.hasSpellcasting) return null;
    return (
      <OptionCard
        icon={GiSpellBook}
        title={action.label}
        subtitle="Shield, Counterspell & other reaction-speed spells"
        tone="arcane"
        onClick={onClick}
      />
    );
  }
  if (action.key === "opportunityAttack") {
    return (
      <OptionCard
        icon={GiCrossedSwords}
        title={action.label}
        subtitle={sheetModel.attackSummary}
        tone="garnet"
        onClick={onClick}
      />
    );
  }
  return <OptionCard icon={GiCycle} title={action.label} onClick={onClick} />;
}

/** Battle Master reaction maneuver (Parry, Riposte) — spends a superiority die. */
function ManeuverReactionCard({
  name,
  dieLabel,
  superiorityRemaining,
  dieBusy,
  onClick,
}: {
  name: string;
  dieLabel: string;
  superiorityRemaining: number;
  dieBusy: boolean;
  onClick: () => void;
}) {
  const exhausted = superiorityRemaining === 0;
  return (
    <OptionCard
      icon={GiCycle}
      title={name}
      ariaLabel={`${name} (${dieLabel})`}
      subtitle={`Spend a superiority die (${dieLabel})`}
      badge={`${dieLabel} · ${superiorityRemaining} left`}
      badgeTone="gold"
      tone={exhausted ? "neutral" : "gold"}
      disabled={exhausted || dieBusy}
      disabledReason={exhausted ? "No superiority dice remaining." : undefined}
      onClick={onClick}
    />
  );
}

/**
 * Deflect Attacks redirect (#1241): a ranged hit reduced to 0 can spend 1 Focus
 * to redirect it, as part of the same reaction — self-adjudicated by the player
 * (the app doesn't track incoming attacks), same trust model as "ranged" and
 * "free hand" in the reaction's reminder text.
 */
function DeflectRedirectButton({
  available,
  busy,
  onRedirect,
}: {
  available: boolean;
  busy: boolean;
  onRedirect: () => void;
}) {
  if (!available) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onRedirect}
      className="mt-2 w-full rounded-control border border-gold-300 bg-gold-100 px-3 py-1.5 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
    >
      Redirect · spend 1 Focus
    </button>
  );
}

/**
 * The result strip inside the Reaction slot card: the die-spend error (before
 * use), or the spent-reaction message plus the Deflect Attacks redirect
 * follow-up (after use). Split out of ReactionSlot to keep its own branching
 * budget for the menu/sheet wiring below.
 */
function ReactionSlotResult({
  reactionUsed,
  error,
  reactionMessage,
  deflectRedirectAvailable,
  busy,
  onDeflectRedirect,
}: {
  reactionUsed: boolean;
  error: string | null;
  reactionMessage: string | null;
  deflectRedirectAvailable: boolean;
  busy: boolean;
  onDeflectRedirect: () => void;
}) {
  if (!reactionUsed) {
    return error ? <ReactionResult message={error} tone="garnet" /> : null;
  }
  return (
    <>
      <ReactionResult message={reactionMessage} />
      <DeflectRedirectButton available={deflectRedirectAvailable} busy={busy} onRedirect={onDeflectRedirect} />
    </>
  );
}

/** Universal reactions the class doesn't already provide + the slot's preview line. */
function deriveReactionOptions(
  classReactions: AvailableAction[],
  reactionManeuvers: Array<{ id: string; name: string }>,
): { universalReactions: TurnActionOption[]; preview: string } {
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
  return { universalReactions, preview };
}

/** The option-card list inside the Reaction sheet. */
function ReactionSheetBody({
  sheetModel,
  universalReactions,
  reactionManeuvers,
  superiorityRemaining,
  dieLabel,
  dieBusy,
  busy,
  handleActionClick,
  handleReactionManeuver,
  onOther,
}: {
  sheetModel: ReactionSheetModel;
  universalReactions: TurnActionOption[];
  reactionManeuvers: Array<{ id: string; name: string }>;
  superiorityRemaining: number;
  dieLabel: string;
  dieBusy: boolean;
  busy: boolean;
  handleActionClick: (key: string, cost: "reaction") => void;
  handleReactionManeuver: (entryId: string, name: string) => Promise<void>;
  onOther: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {sheetModel.classReactionOptions.map((option) => (
        <ClassActionCard
          key={option.key}
          option={option}
          busy={busy}
          onClick={() => handleActionClick(option.key, "reaction")}
        />
      ))}

      {universalReactions.map((u) => (
        <UniversalReactionCard
          key={u.key}
          action={u}
          sheetModel={sheetModel}
          onClick={() => handleActionClick(u.key, "reaction")}
        />
      ))}

      {reactionManeuvers.map((m) => (
        <ManeuverReactionCard
          key={m.id}
          name={m.name}
          dieLabel={dieLabel}
          superiorityRemaining={superiorityRemaining}
          dieBusy={dieBusy}
          onClick={() => handleReactionManeuver(m.id, m.name)}
        />
      ))}

      <OptionCard
        icon={MoreHorizontal}
        title="Other reaction"
        subtitle="Just mark it used"
        badge="free"
        badgeTone="neutral"
        onClick={onOther}
      />
    </div>
  );
}

/**
 * The Reaction economy slot — shared between idle and active render branches
 * so both always show the same state and the same result strip.
 */
export default function ReactionSlot({
  reactionUsed,
  showReactionMenu,
  setShowReactionMenu,
  classReactions,
  sheetModel,
  reactionManeuvers,
  superiorityRemaining,
  dieLabel,
  dieBusy,
  busy,
  reactionMessage,
  error,
  handleActionClick,
  handleReactionManeuver,
  consumeReaction,
  deflectRedirectAvailable,
  handleDeflectAttacksRedirect,
}: {
  reactionUsed: boolean;
  showReactionMenu: boolean;
  setShowReactionMenu: React.Dispatch<React.SetStateAction<boolean>>;
  classReactions: AvailableAction[];
  sheetModel: ReactionSheetModel;
  reactionManeuvers: Array<{ id: string; name: string }>;
  superiorityRemaining: number;
  dieLabel: string;
  dieBusy: boolean;
  busy: boolean;
  reactionMessage: string | null;
  error: string | null;
  handleActionClick: (key: string, cost: "action" | "bonusAction" | "reaction") => void;
  handleReactionManeuver: (entryId: string, name: string) => Promise<void>;
  /** "Other reaction" catch-all — consume the slot without a specific action. */
  consumeReaction: () => void;
  /** Deflect Attacks (#1241): true once the base roll fired and 1+ Focus remains. */
  deflectRedirectAvailable: boolean;
  handleDeflectAttacksRedirect: () => Promise<void>;
}) {
  const { universalReactions, preview } = deriveReactionOptions(classReactions, reactionManeuvers);

  return (
    <>
      <TurnSlotCard
        icon={GiCycle}
        title="Reaction"
        preview={preview}
        tone="arcane"
        used={reactionUsed}
        onUse={!reactionUsed ? () => setShowReactionMenu(true) : undefined}
        useLabel="Use Reaction"
      >
        <ReactionSlotResult
          reactionUsed={reactionUsed}
          error={error}
          reactionMessage={reactionMessage}
          deflectRedirectAvailable={deflectRedirectAvailable}
          busy={busy}
          onDeflectRedirect={() => void handleDeflectAttacksRedirect()}
        />
      </TurnSlotCard>

      {showReactionMenu && !reactionUsed && (
        <BottomSheet
          title="Reaction"
          subtitle="Available on your turn and off-turn"
          onClose={() => setShowReactionMenu(false)}
        >
          <ReactionSheetBody
            sheetModel={sheetModel}
            universalReactions={universalReactions}
            reactionManeuvers={reactionManeuvers}
            superiorityRemaining={superiorityRemaining}
            dieLabel={dieLabel}
            dieBusy={dieBusy}
            busy={busy}
            handleActionClick={handleActionClick}
            handleReactionManeuver={handleReactionManeuver}
            onOther={() => {
              consumeReaction();
              setShowReactionMenu(false);
            }}
          />
        </BottomSheet>
      )}
    </>
  );
}
