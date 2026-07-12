import AdvancementCallout from "@/features/hitpoints/AdvancementCallout";
import ConcentrationNoteBanner from "@/features/hitpoints/ConcentrationNoteBanner";
import LevelUpCallout from "@/features/hitpoints/LevelUpCallout";
import type { ConcentrationNote } from "@/features/hitpoints/useHitPointApply";

interface HpNoticesProps {
  pendingLevelUps: number;
  pending: boolean;
  onLevelUp: () => void;
  showAdvancement: boolean;
  onGoToAdvancements: () => void;
  concentrationNote: ConcentrationNote | null;
  error: string | null;
}

// Below-the-fold callouts: level-up, advancement unlock, concentration note, error.
export default function HpNotices({
  pendingLevelUps,
  pending,
  onLevelUp,
  showAdvancement,
  onGoToAdvancements,
  concentrationNote,
  error,
}: HpNoticesProps) {
  return (
    <>
      {pendingLevelUps > 0 && (
        <LevelUpCallout pendingLevelUps={pendingLevelUps} pending={pending} onLevelUp={onLevelUp} />
      )}
      {showAdvancement && <AdvancementCallout onGoToAdvancements={onGoToAdvancements} />}
      {concentrationNote && <ConcentrationNoteBanner note={concentrationNote} />}
      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
    </>
  );
}
