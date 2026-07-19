import ConcentrationNoteBanner from "@/features/hitpoints/ConcentrationNoteBanner";
import type { ConcentrationNote } from "@/features/hitpoints/useHitPointApply";

interface HpNoticesProps {
  concentrationNote: ConcentrationNote | null;
  error: string | null;
}

// Below-the-fold HP notices: concentration save note + apply error. (Level-up and
// advancement nudges moved to the header-level LevelUpBanner, #892.)
export default function HpNotices({ concentrationNote, error }: HpNoticesProps) {
  return (
    <>
      {concentrationNote && <ConcentrationNoteBanner note={concentrationNote} />}
      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
    </>
  );
}
