// Damage roll button + DM-called Crit toggle, shared by AttackRow (compact "sm")
// and the neutral WeaponDamageCard ("md"). The button flips to doubled-dice
// wording when the row is a crit and dims after a nat-1 miss (#778).

interface CritDamageButtonProps {
  size: "sm" | "md";
  /** Effective crit (nat-20 to-hit OR manual toggle). */
  isCrit: boolean;
  /** Manual DM-called crit toggle state. */
  manualCrit: boolean;
  /** Nat-1 to-hit — dims the button unless a crit overrides it. */
  miss: boolean;
  /** Damage already rolled for this row → relabel to "Re-roll damage (N)" (#802). */
  filledTotal?: number | null;
  onDamage: () => void;
  onToggleCrit: () => void;
}

const CRIT_STYLE = "border-garnet-300 bg-garnet-100 text-garnet-800 hover:bg-garnet-200";

// Per-size chrome + labels, so the render path carries no size branching.
const SIZE_STYLE = {
  sm: {
    wrap: "flex flex-col items-end gap-1",
    pad: "px-2.5 py-1",
    idle: "border-parchment-300 bg-parchment-50 text-parchment-700 hover:bg-parchment-100",
    damage: "Damage",
    crit: "Crit damage",
  },
  md: {
    wrap: "flex shrink-0 flex-col items-end gap-1",
    pad: "px-3 py-1.5",
    idle: "border-parchment-300 bg-parchment-100 text-parchment-700 hover:bg-parchment-200",
    damage: "Roll damage",
    crit: "Roll crit damage",
  },
} as const;

export default function CritDamageButton({
  size,
  isCrit,
  manualCrit,
  miss,
  filledTotal,
  onDamage,
  onToggleCrit,
}: CritDamageButtonProps) {
  const s = SIZE_STYLE[size];
  const label =
    filledTotal != null ? `Re-roll damage (${filledTotal})` : isCrit ? s.crit : s.damage;
  return (
    <div className={s.wrap}>
      <button
        type="button"
        onClick={onDamage}
        className={`rounded-control border ${s.pad} text-xs font-semibold transition-colors ${
          isCrit ? CRIT_STYLE : s.idle
        } ${miss && !isCrit ? "opacity-50" : ""}`}
      >
        {label}
      </button>
      <label className="flex items-center gap-1 text-[11px] text-parchment-500">
        <input
          type="checkbox"
          checked={manualCrit}
          onChange={onToggleCrit}
          className="h-3 w-3 accent-garnet-600"
        />
        Crit
      </label>
    </div>
  );
}
