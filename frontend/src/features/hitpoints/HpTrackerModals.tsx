import ConcentrationSaveModal from "@/features/hitpoints/ConcentrationSaveModal";
import type { PendingConcentrationSave } from "@/features/hitpoints/ConcentrationSaveModal";

interface HpTrackerModalsProps {
  pendingSave: PendingConcentrationSave | null;
  onResolveSave: (roll: number) => void;
  onCloseSave: () => void;
}

// Overlay layer for the HP tracker: the manual concentration save (#76). The
// level-up flow moved to the dedicated ceremony route (#892).
export default function HpTrackerModals({
  pendingSave,
  onResolveSave,
  onCloseSave,
}: HpTrackerModalsProps) {
  if (!pendingSave) return null;
  return <ConcentrationSaveModal save={pendingSave} onResolve={onResolveSave} onClose={onCloseSave} />;
}
