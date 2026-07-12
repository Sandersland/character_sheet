import { useState } from "react";
import { ChevronRight } from "lucide-react";

import BottomSheet from "@/components/ui/BottomSheet";
import ConditionsSheetBody from "@/features/conditions/ConditionsSheetBody";
import { conditionLabel, exhaustionLabel } from "@/lib/conditions";
import type { Character } from "@/types/character";

interface Props {
  character: Character;
  onUpdate: (character: Character) => void;
}

/**
 * Slim conditions strip for the session page on mobile (#769). Read-only chips
 * for each active condition plus an "Exhaustion N" chip, or a muted "No
 * conditions" when clear — but the whole strip is a button that opens a
 * "Conditions" sheet with the full add/remove/exhaustion controls, mirroring
 * CompactHpBar. The desktop card (ConditionsStrip) stays visible at md+.
 */
export default function CompactConditionsBar({ character, onUpdate }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { active, exhaustion } = character.conditions;
  const isClear = active.length === 0 && exhaustion === 0;

  return (
    <>
      <button
        type="button"
        aria-label="Manage conditions"
        onClick={() => setSheetOpen(true)}
        className="group w-full rounded-card border border-parchment-200 bg-parchment-50 px-4 py-3 text-left shadow-card transition-colors hover:border-parchment-300 hover:bg-parchment-100 active:bg-parchment-200"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 font-sans text-xs font-semibold uppercase tracking-wide text-parchment-600">
              Conditions
            </span>
            {isClear ? (
              <span className="text-sm text-parchment-500">No conditions</span>
            ) : (
              <ul className="flex flex-wrap items-center gap-1.5">
                {active.map((entry) => (
                  <li key={entry.key}>
                    <span className="inline-flex items-center rounded-control border border-garnet-200 bg-garnet-50 px-2 py-0.5 text-xs font-semibold text-garnet-800">
                      {conditionLabel(entry.key)}
                    </span>
                  </li>
                ))}
                {exhaustion > 0 && (
                  <li>
                    <span className="inline-flex items-center rounded-control border border-gold-300 bg-gold-50 px-2 py-0.5 text-xs font-semibold text-gold-800">
                      {exhaustionLabel(exhaustion)}
                    </span>
                  </li>
                )}
              </ul>
            )}
          </div>
          <ChevronRight
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-parchment-400 transition-colors group-hover:text-parchment-600"
          />
        </div>
      </button>

      {sheetOpen && (
        <BottomSheet title="Conditions" onClose={() => setSheetOpen(false)}>
          <ConditionsSheetBody character={character} onUpdate={onUpdate} />
        </BottomSheet>
      )}
    </>
  );
}
