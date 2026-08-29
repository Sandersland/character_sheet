import ConcentrationNoteBanner from "@/features/hitpoints/ConcentrationNoteBanner";
import type { ConcentrationNote } from "@/features/hitpoints/useHitPointApply";

interface HpNoticesProps {
  concentrationNote: ConcentrationNote | null;
  error: string | null;
}

export default function HpNotices({ concentrationNote, error }: HpNoticesProps) {
  return (
    <>
      {concentrationNote && <ConcentrationNoteBanner note={concentrationNote} />}
      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
    </>
  );
}
