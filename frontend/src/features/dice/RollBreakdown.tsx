/**
 * Shared roll-result readout (#945): source label, total, and the
 * dice/modifier breakdown, with crit / fumble / advantage flags. Rendered by
 * the shared result seal (RollResultSeal), which both the Quick path and the
 * Animated-mode 3D tray (DiceRollModal) settle onto, so the readout carries
 * identical information regardless of preference and can never drift.
 */

import { usesAdvantage, type RollResult } from "@/lib/dice";

function modifierSuffix(modifier: number): string {
  return modifier > 0 ? ` + ${modifier}` : modifier < 0 ? ` − ${Math.abs(modifier)}` : "";
}

interface RollFlagBanner {
  key: string;
  text: string;
  className: string;
}

// The total's color echoes the standout flag: gold on a crit, muted on a fumble.
function totalColorClass(isCrit: boolean, isFumble: boolean): string {
  if (isCrit) return "text-gold-800";
  if (isFumble) return "text-parchment-600";
  return "text-garnet-800";
}

function advantageLabel(mode: RollResult["spec"]["mode"]): string {
  return mode === "advantage" ? "Advantage" : "Disadvantage";
}

/**
 * Derive the crit/fumble/advantage banner rows and the total's color from a
 * roll. Crit and advantage can co-occur (a nat-20 rolled with advantage), so
 * banners is an ordered list, not one exclusive choice.
 */
function deriveRollFlags(result: RollResult): {
  banners: RollFlagBanner[];
  totalClassName: string;
} {
  const { dice, spec } = result;
  // Crit/fumble only applies to a single d20 roll (checks, saves, attacks, initiative).
  const isD20Single = spec.faces === 20 && spec.count === 1;
  const advantage = usesAdvantage(spec);
  // The taken die under advantage/disadvantage is the kept (non-dropped) one.
  const takenDie = dice.find((d) => !d.dropped) ?? dice[0];
  const naturalRoll = isD20Single ? (takenDie?.value ?? 0) : 0;
  const isCrit = naturalRoll === 20;
  const isFumble = naturalRoll === 1;

  const banners: RollFlagBanner[] = [];
  if (isCrit) banners.push({ key: "crit", text: "Natural 20 — Critical!", className: "text-gold-800" });
  if (isFumble) banners.push({ key: "fumble", text: "Natural 1 — Fumble", className: "text-parchment-600" });
  if (advantage)
    banners.push({ key: "advantage", text: advantageLabel(spec.mode), className: "text-garnet-700" });

  return { banners, totalClassName: totalColorClass(isCrit, isFumble) };
}

interface RollBreakdownProps {
  label: string;
  result: RollResult;
  /** Larger total for the modal settle; the compact chip leaves this off. */
  emphasis?: boolean;
}

export default function RollBreakdown({ label, result, emphasis = false }: RollBreakdownProps) {
  const { total, dice, spec, modifier } = result;
  const { banners, totalClassName } = deriveRollFlags(result);

  return (
    <div className="flex flex-col gap-0.5">
      {banners.map((banner) => (
        <p
          key={banner.key}
          className={`text-[10px] font-semibold uppercase tracking-wider ${banner.className}`}
        >
          {banner.text}
        </p>
      ))}
      <p className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600 sm:text-xs">
        {label}
      </p>
      <p
        className={`font-display font-semibold leading-none tabular-nums ${
          emphasis ? "text-4xl" : "text-3xl sm:text-4xl"
        } ${totalClassName}`}
      >
        {total}
      </p>
      <p className="text-[11px] tabular-nums text-parchment-600">
        {spec.count}d{spec.faces} (
        {dice.map((die, index) => (
          <span key={index}>
            {index > 0 && ", "}
            <span className={die.dropped ? "text-parchment-400 line-through" : ""}>
              {die.value}
            </span>
          </span>
        ))}
        ){modifierSuffix(modifier)}
      </p>
    </div>
  );
}
