// Boxed arcane stat readouts at the top of the spellcasting block:
// Save DC · Spell Attack · Prepared X / Y (hidden when there is no prepare mechanic).
import { formatModifier } from "@/lib/abilities";
import type { PreparedSummary } from "@/lib/preparedSummary";

interface SpellcastingStatBarProps {
  spellSaveDC: number;
  spellAttackBonus: number;
  prepared: PreparedSummary | null;
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-arcane-200 bg-gradient-to-b from-parchment-50 to-arcane-50 px-1 py-2 text-center">
      <p className="text-[9px] font-bold uppercase tracking-wide text-parchment-600">{label}</p>
      <p className="font-display text-2xl font-bold leading-tight text-arcane-800 tabular-nums">
        {value}
      </p>
    </div>
  );
}

export default function SpellcastingStatBar({
  spellSaveDC,
  spellAttackBonus,
  prepared,
}: SpellcastingStatBarProps) {
  return (
    <div className={`grid grid-cols-2 gap-2.5 ${prepared ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      <StatBox label="Save DC" value={String(spellSaveDC)} />
      <StatBox label="Spell Attack" value={formatModifier(spellAttackBonus)} />
      {prepared && (
        <StatBox label="Prepared" value={`${prepared.count} / ${prepared.limit ?? "—"}`} />
      )}
    </div>
  );
}
