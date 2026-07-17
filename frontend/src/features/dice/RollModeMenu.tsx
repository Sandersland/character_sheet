/**
 * The long-press roll-mode chooser (#958). A tap on a roll affordance rolls
 * Normal; a press-and-hold opens this menu so the player can pick Advantage or
 * Disadvantage for that one roll — the mode lives with the roll, not a global
 * footer. Picking fires the roll immediately (non-sticky: the next roll is
 * Normal again unless the player holds again).
 *
 * Rendered as a top-layer portal anchored above the pressed affordance, with a
 * light tap-anywhere scrim to dismiss (mirrors the result seal's language).
 */

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { RollMode } from "@/lib/dice";
import RollModeChoice from "@/features/dice/RollModeChoice";

interface RollModeMenuProps {
  /** The affordance the menu anchors above. */
  anchor: HTMLElement | null;
  /** The roll being chosen for, e.g. "Stealth check" — titles the menu. */
  label: string;
  onPick: (mode: RollMode) => void;
  onClose: () => void;
}

export default function RollModeMenu({ anchor, label, onPick, onClose }: RollModeMenuProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Anchor above the pressed affordance, centered on it, clamped to the viewport.
  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const left = Math.min(Math.max(r.left + r.width / 2, 120), window.innerWidth - 120);
    setPos({ top: Math.max(r.top - 8, 56), left });
  }, [anchor]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-ink-900/20"
      onPointerDown={onClose}
      role="presentation"
    >
      {pos && (
        <div
          data-testid="roll-mode-menu"
          // Stop the pointer-down from bubbling to the dismiss scrim.
          onPointerDown={(e) => e.stopPropagation()}
          style={{ top: pos.top, left: pos.left }}
          className="fixed -translate-x-1/2 -translate-y-full rounded-card border border-parchment-200 bg-parchment-50 px-3 py-2.5 shadow-xl"
        >
          <p className="mb-1.5 whitespace-nowrap text-center text-[10px] font-semibold uppercase tracking-wider text-parchment-500">
            {label}
          </p>
          <RollModeChoice ariaLabel={`Roll mode for ${label}`} onSelect={onPick} />
        </div>
      )}
    </div>,
    document.body,
  );
}
