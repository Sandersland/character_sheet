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

// The tap/hold gesture owns the pointer + click + context-menu handlers, so a
// caller can't pass them through (they'd silently clobber the long-press wiring).
type OwnedHandlers =
  | "onClick"
  | "onPointerDown"
  | "onPointerUp"
  | "onPointerLeave"
  | "onPointerCancel"
  | "onContextMenu";

interface RollButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, OwnedHandlers> {
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

  // State-driven advantage/disadvantage still resolves per roll (#486) and still
  // drives the roll's mode (see rollWith). What changed in #984: the "why" is no
  // longer stamped under every row — it lives ONCE in the ConditionRollBanner
  // above the rails. Here an affected affordance gets only a subtle amber dot,
  // and the full reason (`chip`) stays available on the button's title tooltip.
  const chipResolved = log
    ? resolveRollMode(rollModifiers, { kind: log.kind, ability: log.ability }, "normal")
    : null;
  // `chip` is non-empty exactly when a state modifier applied (rollModeChip
  // returns "" for no sources), so it doubles as the "row is affected" flag.
  const chip = chipResolved ? rollModeChip(chipResolved) : "";
  const chipMode = chipResolved?.mode ?? "normal";
  const affected = chip !== "";
  const previewSpec = spec.mode !== undefined ? spec : { ...spec, mode: chipMode };

  return (
    <>
      <button
        // Caller props first, then the gesture wiring + guard so they always
        // win (the Omit type already forbids these keys, this is defense in depth).
        {...props}
        ref={btnRef}
        type="button"
        title={`Roll ${label}: ${formatRollSpec(previewSpec)}${chip ? ` — ${chip}` : ""} · hold for advantage/disadvantage`}
        className={`relative cursor-pointer rounded transition-colors hover:bg-garnet-50 hover:text-garnet-700 ${className}`}
        {...press}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
        {affected && (
          <span
            data-testid="roll-mode-indicator"
            aria-hidden="true"
            className="pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-gold-500"
          />
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
