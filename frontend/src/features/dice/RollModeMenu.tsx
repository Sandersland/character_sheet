import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { RollMode } from "@/lib/dice";
import RollModeChoice from "@/features/dice/RollModeChoice";

interface RollModeMenuProps {
  anchor: HTMLElement | null;
  label: string;
  onPick: (mode: RollMode) => void;
  onClose: () => void;
}

export default function RollModeMenu({ anchor, label, onPick, onClose }: RollModeMenuProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const left = Math.min(Math.max(r.left + r.width / 2, 120), window.innerWidth - 120);
    setPos({ top: Math.max(r.top - 8, 56), left });
  }, [anchor]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-backdrop/50"
      onPointerDown={onClose}
      role="presentation"
    >
      {pos && (
        <div
          data-testid="roll-mode-menu"
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
