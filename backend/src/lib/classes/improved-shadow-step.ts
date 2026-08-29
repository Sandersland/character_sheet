// PHB'24 p.91, Warrior of Shadow L11 — upgrades Shadow Step's SAME bonus action in place (mirrors Heightened Focus's shape), rather than a competing catalog row.
// The rider must be a standalone trailing sentence, never a mid-string splice — an announce-augmentor payload can only APPEND (foldPayload).
import type { RulesEdition } from "@character-sheet/shared-types";

import type { AnnounceAugmentor } from "./announce-augmentors.js";

// PHB'24 p.91 — Improved Shadow Step's own grant level.
export const IMPROVED_SHADOW_STEP_LEVEL = 11;

export const IMPROVED_SHADOW_STEP_REMINDER =
  "Improved Shadow Step (L11): for 1 focus, ignore the dim/dark destination requirement.";

// 2024-only feature (PHB'24 p.91) — SRD 5.1's Way of Shadow has no Improved Shadow Step.
const EDITION_HAS_IMPROVED_SHADOW_STEP: Record<RulesEdition, boolean> = {
  EDITION_2024: true,
  EDITION_2014: false,
};
function editionHasImprovedShadowStep(edition: RulesEdition): boolean {
  return EDITION_HAS_IMPROVED_SHADOW_STEP[edition];
}

export const improvedShadowStepAugmentor: AnnounceAugmentor = {
  targetKeys: ["shadowStep"],
  appliesTo: (ctx) =>
    editionHasImprovedShadowStep(ctx.edition) && ctx.slug === "monk-warrior-of-shadow" && ctx.entryLevel >= IMPROVED_SHADOW_STEP_LEVEL,
  augment: () => ({ reminderAppend: IMPROVED_SHADOW_STEP_REMINDER }),
};
