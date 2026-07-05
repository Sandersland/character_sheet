/**
 * A transparent roll affordance: wraps any existing display (a modifier
 * number, a stat label, etc.) and makes it clickable. On click, plays the 3D
 * `DiceRollModal` via `rollAnimated` — the result appears in `RollResultToast`
 * and, when `log` is set and a session is active, emits the roll's category
 * event. Must be used inside `RollProvider`.
 *
 * The `title` attribute doubles as a tooltip showing what will be rolled.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { formatRollSpec, type RollSpec } from "@/lib/dice";
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
  const { rollAnimated } = useRoll();

  return (
    <button
      type="button"
      title={`Roll ${label}: ${formatRollSpec(spec)}`}
      onClick={() => rollAnimated(spec, label, log)}
      className={`cursor-pointer rounded transition-colors hover:bg-garnet-50 hover:text-garnet-700 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
