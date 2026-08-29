import { useState, type ReactNode } from "react";

import BottomSheet from "@/components/ui/BottomSheet";
import HpSheetBody from "@/features/hitpoints/HpSheetBody";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";

interface Props {
  className?: string;
  children: ReactNode;
}

export default function ManageHpButton({ className, children }: Props) {
  const { character } = useCurrentCharacter();
  const [open, setOpen] = useState(false);

  // Button content is aria-hidden by this label, so temp must ride along here too (#989).
  const { current, max, temp } = character.hitPoints;
  const label =
    `Manage hit points: ${current} of ${max}` + (temp > 0 ? ` (+${temp} temp)` : "");

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className={className}
      >
        {children}
      </button>

      {open && (
        <BottomSheet title="Hit Points" onClose={() => setOpen(false)}>
          <HpSheetBody />
        </BottomSheet>
      )}
    </>
  );
}
