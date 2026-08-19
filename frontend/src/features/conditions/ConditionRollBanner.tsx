import GoldWarningBox from "@/components/ui/GoldWarningBox";
import { summarizeRollModifiers } from "@/lib/conditionRollSummary";
import type { RollModifier } from "@/types/character";

interface ConditionRollBannerProps {
  /** The character's derived roll modifiers (character.rollModifiers). */
  modifiers: RollModifier[];
  className?: string;
}

/**
 * One amber banner per active roll-modifying state (#984). Says the fact ONCE —
 * "Poisoned · Disadvantage on attack rolls, ability checks, and initiative" —
 * at the top of the roll rails, replacing the ~24 identical "disadvantage —
 * Poisoned" stamps the sheet used to render under every ability box and all
 * 18 skill rows (repetition kills scanability). The roll itself still
 * auto-applies the mode via resolveRollMode; affected rows keep only a subtle
 * amber dot. Renders nothing when no state is active, so hosts can mount it
 * unconditionally.
 *
 * Amber/gold tone per the liveplay redesign mockup (Fix B). Both advantage and
 * disadvantage sources use the same treatment; the effect text carries the
 * direction, so an adv/dis cancellation reads correctly (two banners, each
 * naming its own grant).
 */
export default function ConditionRollBanner({ modifiers, className = "" }: ConditionRollBannerProps) {
  const summaries = summarizeRollModifiers(modifiers);
  if (summaries.length === 0) return null;

  return (
    <div className={`flex flex-col gap-2 ${className}`} role="region" aria-label="Active roll modifiers">
      {summaries.map((summary) => (
        <GoldWarningBox key={summary.source} variant="row">
          <div className="text-xs font-bold text-gold-900">{summary.source}</div>
          <div className="text-[11px] font-medium text-gold-800">{summary.effect}</div>
        </GoldWarningBox>
      ))}
    </div>
  );
}
