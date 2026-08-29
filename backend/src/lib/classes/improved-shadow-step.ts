// PHB'24 p.91, Warrior of Shadow L11 — upgrades Shadow Step's SAME bonus action in place (mirrors Heightened Focus's shape), rather than a competing catalog row.
// The rider must be a standalone trailing sentence, never a mid-string splice — an announce-augmentor payload can only APPEND (foldPayload).
import type { AnnounceAugmentor } from "./announce-augmentors.js";

// PHB'24 p.91 — Improved Shadow Step's own grant level.
export const IMPROVED_SHADOW_STEP_LEVEL = 11;

export const IMPROVED_SHADOW_STEP_REMINDER =
  "Improved Shadow Step (L11): for 1 focus, ignore the dim/dark destination requirement.";

export const improvedShadowStepAugmentor: AnnounceAugmentor = {
  targetKeys: ["shadowStep"],
  appliesTo: (ctx) =>
    ctx.edition === "EDITION_2024" && ctx.slug === "monk-warrior-of-shadow" && ctx.entryLevel >= IMPROVED_SHADOW_STEP_LEVEL,
  augment: () => ({ reminderAppend: IMPROVED_SHADOW_STEP_REMINDER }),
};
