/**
 * A transparent roll affordance: wraps any existing display (a modifier
 * number, a stat label, etc.) and makes it clickable. On click, calls
 * `roll(spec, label)` from `RollContext` — the result appears in
 * `RollResultToast`. Must be used inside `RollProvider`.
 *
 * The `title` attribute doubles as a tooltip showing what will be rolled.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { formatRollSpec, type RollSpec } from "@/lib/dice";
import { useRoll } from "@/features/dice/RollContext";

interface RollButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  spec: RollSpec;
  label: string;
  children: ReactNode;
}

export default function RollButton({
  spec,
  label,
  children,
  className = "",
  ...props
}: RollButtonProps) {
  const { roll } = useRoll();

  return (
    <button
      type="button"
      title={`Roll ${label}: ${formatRollSpec(spec)}`}
      onClick={() => roll(spec, label)}
      className={`cursor-pointer rounded transition-colors hover:bg-garnet-50 hover:text-garnet-700 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
