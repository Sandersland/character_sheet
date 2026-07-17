import { useState, type ReactNode } from "react";

import BottomSheet from "@/components/ui/BottomSheet";
import HpSheetBody from "@/features/hitpoints/HpSheetBody";
import type { Character } from "@/types/character";

interface Props {
  character: Character;
  onUpdate: (character: Character) => void;
  /** Styling for the trigger button — the host supplies its own chip/tile shell. */
  className?: string;
  /** The visual readout rendered inside the trigger (HP value, meter, etc.). */
  children: ReactNode;
}

/**
 * A tappable HP control (#982): renders `children` inside a button labelled
 * "Manage hit points" that opens the shared "Hit Points" `BottomSheet`
 * (`HpSheetBody` — the single damage/heal/temp editing surface). Reused by the
 * sheet header vitals (desktop banner + mobile mini-header) so the header HP
 * readout IS the entry point to the HP sheet, now the live-Combat panel no longer
 * carries its own `CompactHpBar`. The sheet stays open after an apply (mirrors
 * `CompactHpBar`), so a player can chain damage/heal without re-opening it.
 */
export default function ManageHpButton({ character, onUpdate, className, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Manage hit points"
        onClick={() => setOpen(true)}
        className={className}
      >
        {children}
      </button>

      {open && (
        <BottomSheet title="Hit Points" onClose={() => setOpen(false)}>
          <HpSheetBody character={character} onUpdate={onUpdate} />
        </BottomSheet>
      )}
    </>
  );
}
