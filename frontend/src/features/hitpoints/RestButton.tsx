import { useState } from "react";
import { Flame, Moon } from "lucide-react";

import BottomSheet from "@/components/ui/BottomSheet";
import RestControls from "@/features/hitpoints/RestControls";
import { useHitPointApply } from "@/features/hitpoints/useHitPointApply";
import { useRestActions } from "@/features/hitpoints/useRestActions";
import type { Character } from "@/types/character";

interface RestButtonProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

/**
 * Always-visible BG3-style session rest control (#814): a compact campfire button
 * beside CompactHpBar that opens a "Rest" sheet with the short/long rest controls
 * and hit-dice readout — the session home for rests now the Rest & HP tab is gone.
 */
export default function RestButton({ character, onUpdate }: RestButtonProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const hp = useHitPointApply(character, onUpdate);
  const rest = useRestActions(character, hp.submit);
  const { total, die } = character.hitDice;

  return (
    <>
      <button
        type="button"
        aria-label="Rest"
        onClick={() => setSheetOpen(true)}
        className="group flex shrink-0 flex-col items-center justify-center gap-1 rounded-card border border-parchment-200 bg-parchment-50 px-3 py-2 shadow-card transition-colors hover:border-parchment-300 hover:bg-parchment-100 active:bg-parchment-200 sm:px-4 sm:py-3"
      >
        <span className="flex items-center gap-1">
          <Flame aria-hidden="true" className="h-4 w-4 text-garnet-600" />
          <Moon aria-hidden="true" className="h-4 w-4 text-arcane-600" />
        </span>
        <span className="font-sans text-xs font-semibold uppercase tracking-wide text-parchment-600">
          Rest
        </span>
      </button>

      {sheetOpen && (
        <BottomSheet title="Rest" onClose={() => setSheetOpen(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
              Hit dice{" "}
              <span className="tabular-nums text-parchment-900">
                {rest.availableDice}/{total}
                {die}
              </span>
            </p>
            <RestControls
              availableDice={rest.availableDice}
              pending={hp.pending}
              onShortRest={rest.shortRest}
              onLongRest={rest.longRest}
            />
            {hp.error && <p className="text-xs font-semibold text-garnet-700">{hp.error}</p>}
          </div>
        </BottomSheet>
      )}
    </>
  );
}
