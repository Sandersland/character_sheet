import GoldWarningBox from "@/components/ui/GoldWarningBox";
import { summarizeRollModifiers } from "@/lib/conditionRollSummary";
import type { RollModifier } from "@/types/character";

interface ConditionRollBannerProps {
  modifiers: RollModifier[];
  className?: string;
}

// resolveRollMode already applies the roll mode automatically; this banner is only the display, not the source of truth (#984).
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
