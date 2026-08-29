// Heightened Focus, PHB'24 p.88 / SRD 5.2, Monk L10 — upgrades Flurry of Blows/Patient Defense's Focus variant/Step of the Wind's Focus variant in place.
// Base L1-9 facts live on those actions' own ClassFeature rows; this descriptor supplies only the L10 delta.
import type { RulesEdition } from "@character-sheet/shared-types";

import type { AnnounceAugmentor, AugmentPayload } from "./announce-augmentors.js";

// PHB'24 p.88 — Heightened Focus's own grant level.
export const HEIGHTENED_FOCUS_LEVEL = 10;

const PATIENT_DEFENSE_RIDER =
  "Heightened Focus (L10): also gain temporary hit points equal to two Martial Arts die rolls.";
const STEP_OF_THE_WIND_RIDER =
  "Heightened Focus (L10): also bring one willing creature within 5 ft along with you, moving it up to your Speed — it doesn't provoke opportunity attacks.";

// 2024-only feature — appliesTo already confirms edition + level, so augment branches on action.key alone.
function heightenedFocusPayload(key: string): AugmentPayload | null {
  if (key === "flurryOfBlows") return { count: 3 };
  if (key === "patientDefenseFocus") return { reminderAppend: PATIENT_DEFENSE_RIDER };
  if (key === "stepOfTheWindFocus") return { reminderAppend: STEP_OF_THE_WIND_RIDER };
  return null;
}

// 2024-only feature (PHB'24 p.88) — SRD 5.1 has no Heightened Focus.
function editionHasHeightenedFocus(edition: RulesEdition): boolean {
  switch (edition) {
    case "EDITION_2024":
      return true;
    case "EDITION_2014":
      return false;
    default: {
      const exhaustive: never = edition;
      throw new Error(`editionHasHeightenedFocus: unhandled edition ${String(exhaustive)}`);
    }
  }
}

export const heightenedFocusAugmentor: AnnounceAugmentor = {
  targetKeys: ["flurryOfBlows", "patientDefenseFocus", "stepOfTheWindFocus"],
  appliesTo: (ctx) => editionHasHeightenedFocus(ctx.edition) && ctx.entryLevel >= HEIGHTENED_FOCUS_LEVEL,
  augment: (action) => heightenedFocusPayload(action.key),
};
