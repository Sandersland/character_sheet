/**
 * Improved Shadow Step (Warrior of Shadow L11, PHB'24 p.91, #1246/#1912) —
 * upgrades the SAME Shadow Step bonus action in place (ignore the dim/dark
 * destination requirement for 1 focus) rather than adding a competing
 * catalog row, mirroring Heightened Focus's own in-place-upgrade shape. The
 * base row's reminder (monk-features.ts, Warrior of Shadow's Shadow Step)
 * carries the flat below-L11 text; this descriptor appends the L11 rider —
 * reworded to a standalone trailing sentence rather than the pre-#1912
 * mid-sentence insertion, since an announce-augmentor payload can only ever
 * APPEND (announce-augmentors.ts's `foldPayload`), never splice text
 * mid-string. Registered in ANNOUNCE_AUGMENTORS.
 */
import type { AnnounceAugmentor } from "./announce-augmentors.js";

/** PHB'24 p.91 — Improved Shadow Step's own grant level. */
export const IMPROVED_SHADOW_STEP_LEVEL = 11;

export const IMPROVED_SHADOW_STEP_REMINDER =
  "Improved Shadow Step (L11): for 1 focus, ignore the dim/dark destination requirement.";

export const improvedShadowStepAugmentor: AnnounceAugmentor = {
  targetKeys: ["shadowStep"],
  appliesTo: (ctx) =>
    ctx.edition === "EDITION_2024" && ctx.slug === "monk-warrior-of-shadow" && ctx.entryLevel >= IMPROVED_SHADOW_STEP_LEVEL,
  augment: () => ({ reminderAppend: IMPROVED_SHADOW_STEP_REMINDER }),
};
