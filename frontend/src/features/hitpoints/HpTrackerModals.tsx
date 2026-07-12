import ConcentrationSaveModal from "@/features/hitpoints/ConcentrationSaveModal";
import type { PendingConcentrationSave } from "@/features/hitpoints/ConcentrationSaveModal";
import LevelUpModal from "@/features/hitpoints/LevelUpModal";
import type { Character, ClassOption, LevelUpTarget } from "@/types/character";

interface HpTrackerModalsProps {
  character: Character;
  referenceClasses: ClassOption[];
  conMod: number;
  pending: boolean;
  levelUpOpen: boolean;
  onConfirmLevelUp: (method: "average" | "roll", target: LevelUpTarget | undefined) => void;
  onCloseLevelUp: () => void;
  pendingSave: PendingConcentrationSave | null;
  onResolveSave: (roll: number) => void;
  onCloseSave: () => void;
}

// Overlay layer for the HP tracker: level-up modal + manual concentration save.
export default function HpTrackerModals({
  character,
  referenceClasses,
  conMod,
  pending,
  levelUpOpen,
  onConfirmLevelUp,
  onCloseLevelUp,
  pendingSave,
  onResolveSave,
  onCloseSave,
}: HpTrackerModalsProps) {
  return (
    <>
      {levelUpOpen && (
        <LevelUpModal
          character={character}
          referenceClasses={referenceClasses}
          conMod={conMod}
          pending={pending}
          onConfirm={onConfirmLevelUp}
          onClose={onCloseLevelUp}
        />
      )}
      {pendingSave && (
        <ConcentrationSaveModal save={pendingSave} onResolve={onResolveSave} onClose={onCloseSave} />
      )}
    </>
  );
}
