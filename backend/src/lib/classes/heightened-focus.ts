/**
 * Heightened Focus (Monk L10, PHB'24 p.88 / SRD 5.2, #1244/#1912) — the
 * base-class 2024 feature that upgrades three of the Monk's own focus
 * actions in place: Flurry of Blows gains a third strike, Patient Defense's
 * Focus variant gains temp HP, Step of the Wind's Focus variant gains a
 * move-a-willing-creature rider. Base facts (the L1-9 count/reminder) live
 * on flurryOfBlows/patientDefenseFocus/stepOfTheWindFocus's own ClassFeature
 * rows (monk-features.ts); this descriptor supplies only the L10 delta,
 * registered in ANNOUNCE_AUGMENTORS (announce-augmentors.ts).
 */
import type { AnnounceAugmentor, AugmentPayload } from "./announce-augmentors.js";

/** PHB'24 p.88 — Heightened Focus's own grant level. */
export const HEIGHTENED_FOCUS_LEVEL = 10;

const PATIENT_DEFENSE_RIDER =
  "Heightened Focus (L10): also gain temporary hit points equal to two Martial Arts die rolls.";
const STEP_OF_THE_WIND_RIDER =
  "Heightened Focus (L10): also bring one willing creature within 5 ft along with you, moving it up to your Speed — it doesn't provoke opportunity attacks.";

// Edition-invariant in shape (2024-only feature — the gate itself IS the
// edition check, matched below), so `augment` branches on `action.key`
// alone once `appliesTo` has already confirmed level + edition.
function heightenedFocusPayload(key: string): AugmentPayload | null {
  if (key === "flurryOfBlows") return { count: 3 };
  if (key === "patientDefenseFocus") return { reminderAppend: PATIENT_DEFENSE_RIDER };
  if (key === "stepOfTheWindFocus") return { reminderAppend: STEP_OF_THE_WIND_RIDER };
  return null;
}

export const heightenedFocusAugmentor: AnnounceAugmentor = {
  targetKeys: ["flurryOfBlows", "patientDefenseFocus", "stepOfTheWindFocus"],
  appliesTo: (ctx) => ctx.edition === "EDITION_2024" && ctx.entryLevel >= HEIGHTENED_FOCUS_LEVEL,
  augment: (action) => heightenedFocusPayload(action.key),
};
