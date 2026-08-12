/**
 * ManeuverRow — renders a single known maneuver with an expandable
 * description. Purely presentational: no API calls, no forget action — a
 * maneuver replacement is bound to learn-time (#1516: PHB'14 Battle Master
 * p.73 / SRD 5.2 equivalent), so the only forget affordance lives inside the
 * level-up ceremony's own maneuvers step, never on the sheet. Renders through
 * AbilityRowShell (shared with ShadowArtRow).
 */

import AbilityRowShell from "@/features/class/AbilityRowShell";
import type { ManeuverEntry } from "@/types/character";

interface Props {
  entry: ManeuverEntry;
}

export default function ManeuverRow({ entry }: Props) {
  // #1381: the served superiority-die faces (deriveManeuverEffect, backend) —
  // pure chrome over a resolved value, never re-derived here.
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
