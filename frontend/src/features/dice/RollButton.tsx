import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

import { formatRollSpec, type RollMode, type RollSpec } from "@/lib/dice";
import { resolveRollMode, rollModeChip, type ResolvedRollMode } from "@/lib/rollMode";
import { useLongPress } from "@/hooks/useLongPress";
import { useRoll, type RollLog } from "@/features/dice/RollContext";
import RollModeMenu from "@/features/dice/RollModeMenu";
import type { RollModifier } from "@/types/character";

// Owned by the tap/hold gesture; a caller passing these would silently clobber the long-press wiring.
type OwnedHandlers =
  | "onClick"
  | "onPointerDown"
  | "onPointerUp"
  | "onPointerLeave"
  | "onPointerCancel"
  | "onContextMenu";

function withFlatModifier(spec: RollSpec, flat: number): RollSpec {
  return flat !== 0 ? { ...spec, modifier: (spec.modifier ?? 0) + flat } : spec;
}

function resolveForLog(
  rollModifiers: RollModifier[],
  log: RollLog | undefined,
  manualMode: RollMode,
): ResolvedRollMode | null {
  return log ? resolveRollMode(rollModifiers, { kind: log.kind, ability: log.ability }, manualMode) : null;
}

// Caller-pinned spec.mode wins over the resolved mode over fallbackMode; the flat modifier always folds in regardless.
function effectiveSpec(spec: RollSpec, resolved: ResolvedRollMode | null, fallbackMode: RollMode): RollSpec {
  const withMod = withFlatModifier(spec, resolved?.modifier ?? 0);
  return spec.mode !== undefined ? withMod : { ...withMod, mode: resolved?.mode ?? fallbackMode };
}

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

  function rollWith(manualMode: RollMode) {
    const resolved = resolveForLog(rollModifiers, log, manualMode);
    rollAnimated(effectiveSpec(spec, resolved, manualMode), label, log);
  }

  const press = useLongPress(
    () => rollWith("normal"),
    () => setMenuOpen(true),
  );

  const chipResolved = resolveForLog(rollModifiers, log, "normal");
  // chip is "" when no state modifier applies, so it doubles as the affected flag.
  const chip = chipResolved ? rollModeChip(chipResolved) : "";
  const affected = chip !== "";
  const previewSpec = effectiveSpec(spec, chipResolved, "normal");

  return (
    <>
      <button
        // Caller props spread first so the gesture wiring after them always wins.
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
