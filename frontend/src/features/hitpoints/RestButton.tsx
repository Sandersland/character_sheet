import { useState } from "react";
import { Flame, Moon } from "lucide-react";

import BottomSheet from "@/components/ui/BottomSheet";
import { ChevronRight } from "@/components/ui/icons";
import RestControls from "@/features/hitpoints/RestControls";
import { useHitPointApply } from "@/features/hitpoints/useHitPointApply";
import { useRestActions } from "@/features/hitpoints/useRestActions";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";

interface RestButtonProps {
  variant?: "compact" | "row";
}

export default function RestButton({ variant = "compact" }: RestButtonProps) {
  const { character } = useCurrentCharacter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const hp = useHitPointApply(character);
  const rest = useRestActions(character, hp.submit);
  const { total, die } = character.hitDice;

  return (
    <>
      {variant === "row" ? (
        <button
          type="button"
          aria-label="Rest"
          onClick={() => setSheetOpen(true)}
          className="pressable flex min-h-[52px] w-full items-center gap-3 border-t border-parchment-200 px-4 py-2.5 text-left"
        >
          <span className="flex shrink-0 items-center gap-1">
            <Flame aria-hidden="true" className="h-[18px] w-[18px] text-garnet-600" />
            <Moon aria-hidden="true" className="h-[18px] w-[18px] text-arcane-600" />
          </span>
          <span className="flex-1 text-base font-semibold text-parchment-900">
            Rest
            <span className="font-normal tabular-nums text-parchment-600">
              {" · "}Hit dice {rest.availableDice}/{total}
              {die}
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-parchment-400" />
        </button>
      ) : (
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
      )}

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
