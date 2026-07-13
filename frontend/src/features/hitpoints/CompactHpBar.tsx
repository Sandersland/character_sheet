import { useState } from "react";
import { ChevronRight } from "lucide-react";

import MeterBar from "@/components/ui/MeterBar";
import BottomSheet from "@/components/ui/BottomSheet";
import HpSheetBody from "@/features/hitpoints/HpSheetBody";
import type { Character } from "@/types/character";

interface CompactHpBarProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

/**
 * Slim HP strip always visible at the top of the session page. Read-only content
 * (current/max HP, temp badge, MeterBar), but the whole strip is a button that
 * opens a "Hit Points" sheet with the full damage/heal/temp controls (#768) — so
 * HP is manageable mid-turn on mobile without a dedicated tab (rest lives in the
 * adjacent RestButton, #814). Death saves stay on the turn screen.
 */
export default function CompactHpBar({ character, onUpdate }: CompactHpBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { current, max, temp } = character.hitPoints;
  const isLow = current / max <= 0.25;
  const isDown = current === 0;

  return (
    <>
      <button
        type="button"
        aria-label="Manage hit points"
        onClick={() => setSheetOpen(true)}
        className="group w-full rounded-card border border-parchment-200 bg-parchment-50 px-4 py-3 text-left shadow-card transition-colors hover:border-parchment-300 hover:bg-parchment-100 active:bg-parchment-200"
      >
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
            <span className="truncate font-sans text-xs font-semibold uppercase tracking-wide text-parchment-600">
              Hit Points
            </span>
            <span
              className={[
                "shrink-0 whitespace-nowrap font-sans text-sm font-bold",
                isDown
                  ? "text-garnet-700"
                  : isLow
                    ? "text-garnet-600"
                    : "text-parchment-900",
              ].join(" ")}
            >
              {current}
              <span className="font-normal text-parchment-600"> / {max}</span>
            </span>
            {temp > 0 && (
              <span className="shrink-0 rounded-control bg-arcane-50 px-2 py-0.5 text-xs font-semibold text-arcane-700">
                +{temp} temp
              </span>
            )}
            {isDown && (
              <span className="shrink-0 rounded-control bg-garnet-50 px-2 py-0.5 text-xs font-semibold text-garnet-700">
                Down
              </span>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {/* Meter yields before the HP number so a 3-digit total stays visible at 320px. */}
            <div className="w-16 min-w-0 sm:w-32">
              <MeterBar current={current} max={max} tone="garnet" label={`${current} of ${max} HP`} />
            </div>
            <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-parchment-500 sm:hidden">
              Tap
            </span>
            <ChevronRight
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-parchment-400 transition-colors group-hover:text-parchment-600"
            />
          </div>
        </div>
      </button>

      {sheetOpen && (
        <BottomSheet title="Hit Points" onClose={() => setSheetOpen(false)}>
          <HpSheetBody character={character} onUpdate={onUpdate} />
        </BottomSheet>
      )}
    </>
  );
}
