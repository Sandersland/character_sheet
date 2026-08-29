// A maneuver replacement is bound to learn-time (PHB'14 Battle Master p.73 /
// SRD 5.2 equivalent), so this row renders no forget affordance (#1516).
import AbilityRowShell from "@/features/class/AbilityRowShell";
import type { ManeuverEntry } from "@/types/character";

interface Props {
  entry: ManeuverEntry;
}

export default function ManeuverRow({ entry }: Props) {
  // The served superiority-die faces are pure chrome over a resolved value, never re-derived here.
  const dieFaces = entry.effect?.dice?.faces;

  return (
    <AbilityRowShell
      name={entry.name}
      chips={
        dieFaces !== undefined ? (
          <span className="text-[10px] text-parchment-500">
            {/* The bare "d8" is the sighted affordance; the die size appears nowhere
                else in the row, so screen readers get the spelled-out equivalent
                rather than losing the value entirely. */}
            <span aria-hidden="true">d{dieFaces}</span>
            <span className="sr-only">Superiority die d{dieFaces}</span>
          </span>
        ) : undefined
      }
    >
      <p className="text-xs leading-relaxed text-parchment-600">{entry.description}</p>
    </AbilityRowShell>
  );
}
