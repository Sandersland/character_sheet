/**
 * A transparent roll affordance: wraps any existing display (a modifier
 * number, a stat label, etc.) and makes it clickable. On click, plays the 3D
 * `DiceRollModal` via `rollAnimated` — the result appears in `RollResultSeal`
 * and, when `log` is set and a session is active, emits the roll's category
 * event. Must be used inside `RollProvider`.
 *
 * The `title` attribute doubles as a tooltip showing what will be rolled.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { formatRollSpec, type RollSpec } from "@/lib/dice";
import { resolveRollMode, rollModeChip } from "@/lib/rollMode";
import { useRoll, type RollLog } from "@/features/dice/RollContext";

interface RollButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  spec: RollSpec;
  label: string;
  /** Roll-category metadata; when set the roll logs to the Session Log. */
  log?: RollLog;
  children: ReactNode;
}

export default function RollButton({
  spec,
  label,
  log,
  children,
  className = "",
  ...props
}: RollButtonProps) {
  const { rollAnimated, mode, rollModifiers } = useRoll();

  // State-driven advantage/disadvantage (#486): resolve from the log's category
  // (check/save/initiative + governing ability) merged with the manual toggle.
  // A caller-pinned spec.mode still wins. Only categorized (logged) rolls resolve.
  const resolved = log ? resolveRollMode(rollModifiers, { kind: log.kind, ability: log.ability }, mode) : null;
  const effectiveSpec = resolved && spec.mode === undefined ? { ...spec, mode: resolved.mode } : spec;
  const chip = resolved ? rollModeChip(resolved) : "";

  return (
    <button
      type="button"
      title={`Roll ${label}: ${formatRollSpec(effectiveSpec)}${chip ? ` — ${chip}` : ""}`}
      onClick={() => rollAnimated(effectiveSpec, label, log)}
      className={`cursor-pointer rounded transition-colors hover:bg-garnet-50 hover:text-garnet-700 ${className}`}
      {...props}
    >
      {children}
      {chip && (
        <span
          data-testid="roll-mode-chip"
          className={`mt-0.5 block text-[9px] font-semibold uppercase leading-none tracking-wide ${
            resolved!.mode === "advantage"
              ? "text-gold-600"
              : resolved!.mode === "disadvantage"
                ? "text-garnet-600"
                : "text-parchment-500"
          }`}
        >
          {chip}
        </span>
      )}
    </button>
  );
}
