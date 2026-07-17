/**
 * A transparent roll affordance: wraps any existing display (a modifier
 * number, a stat label, etc.) and makes it clickable. A **tap** rolls Normal
 * via `rollAnimated` — the result appears in `RollResultSeal`. A **press-and-
 * hold** opens the `RollModeMenu` so the player picks Advantage/Disadvantage
 * for that one roll (#958) — roll mode lives with the roll, not a global footer.
 * Must be used inside `RollProvider`.
 *
 * The `title` attribute doubles as a tooltip showing what will be rolled.
 */

import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

import { formatRollSpec, type RollMode, type RollSpec } from "@/lib/dice";
import { resolveRollMode, rollModeChip } from "@/lib/rollMode";
import { useLongPress } from "@/hooks/useLongPress";
import { useRoll, type RollLog } from "@/features/dice/RollContext";
import RollModeMenu from "@/features/dice/RollModeMenu";

interface RollButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  spec: RollSpec;
  label: string;
  /** Roll-category metadata; when set the roll logs to the Session Log. */
  log?: RollLog;
  children: ReactNode;
}

// The "why" chip's colour echoes the resolved state-driven mode.
function chipColorClass(mode: RollMode): string {
  if (mode === "advantage") return "text-gold-600";
  if (mode === "disadvantage") return "text-garnet-600";
  return "text-parchment-500";
}

export default function RollButton({
  spec,
  label,
  log,
  children,
  className = "",
  ...props
}: RollButtonProps) {
  const { rollAnimated, rollModifiers } = useRoll();
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // State-driven advantage/disadvantage (#486): resolve from the log's category
  // (check/save/initiative + governing ability) merged with the picked manual
  // mode. A caller-pinned spec.mode still wins. Only categorized rolls resolve.
  function rollWith(manualMode: RollMode) {
    const resolved = log
      ? resolveRollMode(rollModifiers, { kind: log.kind, ability: log.ability }, manualMode)
      : null;
    const effectiveSpec =
      spec.mode !== undefined ? spec : { ...spec, mode: resolved?.mode ?? manualMode };
    rollAnimated(effectiveSpec, label, log);
  }

  // Tap → Normal roll; press-and-hold → open the ADV/DIS menu.
  const press = useLongPress(
    () => rollWith("normal"),
    () => setMenuOpen(true),
  );

  // The "why" chip reflects the state-driven mode for a plain (Normal) roll.
  const chipResolved = log
    ? resolveRollMode(rollModifiers, { kind: log.kind, ability: log.ability }, "normal")
    : null;
  const chip = chipResolved ? rollModeChip(chipResolved) : "";
  const chipMode = chipResolved?.mode ?? "normal";
  const previewSpec = spec.mode !== undefined ? spec : { ...spec, mode: chipMode };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={`Roll ${label}: ${formatRollSpec(previewSpec)}${chip ? ` — ${chip}` : ""} · hold for advantage/disadvantage`}
        {...press}
        onContextMenu={(e) => e.preventDefault()}
        className={`cursor-pointer rounded transition-colors hover:bg-garnet-50 hover:text-garnet-700 ${className}`}
        {...props}
      >
        {children}
        {chip && (
          <span
            data-testid="roll-mode-chip"
            className={`mt-0.5 block text-[9px] font-semibold uppercase leading-none tracking-wide ${chipColorClass(chipMode)}`}
          >
            {chip}
          </span>
        )}
      </button>
      {menuOpen && (
        <RollModeMenu
          anchor={btnRef.current}
          label={label}
          onPick={(mode) => {
            setMenuOpen(false);
            rollWith(mode);
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </>
  );
}
