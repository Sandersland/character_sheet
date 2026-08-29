import type { RollMode } from "@/lib/dice";

const OPTIONS: { mode: RollMode; label: string; short: string }[] = [
  { mode: "advantage", label: "Advantage", short: "Adv" },
  { mode: "normal", label: "Normal", short: "Normal" },
  { mode: "disadvantage", label: "Disadvantage", short: "Dis" },
];

function toneClass(mode: RollMode, active: boolean): string {
  if (!active) {
    if (mode === "advantage") return "text-vitality-700 hover:bg-parchment-100";
    if (mode === "disadvantage") return "text-garnet-700 hover:bg-parchment-100";
    return "text-parchment-600 hover:bg-parchment-100";
  }
  if (mode === "advantage") return "bg-vitality-600 text-parchment-50";
  if (mode === "disadvantage") return "bg-garnet-surface text-garnet-on-surface";
  return "bg-parchment-50 text-parchment-900 shadow-sm";
}

interface RollModeChoiceProps {
  // Omit for a menu where no choice persists.
  selected?: RollMode;
  onSelect: (mode: RollMode) => void;
  ariaLabel: string;
}

export default function RollModeChoice({ selected, onSelect, ariaLabel }: RollModeChoiceProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex gap-0.5 rounded-full border border-parchment-200 bg-parchment-100 p-0.5"
    >
      {OPTIONS.map(({ mode, label, short }) => {
        const active = selected === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={selected !== undefined ? active : undefined}
            onClick={() => onSelect(mode)}
            title={`Roll with ${label.toLowerCase()}`}
            className={`cursor-pointer rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${toneClass(mode, active)}`}
          >
            <span aria-hidden="true">{short}</span>
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
