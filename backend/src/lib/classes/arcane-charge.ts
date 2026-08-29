// Eldritch Knight Arcane Charge, PHB'14 p.75.
import type { RulesEdition } from "@character-sheet/shared-types";

import type { AnnounceAugmentor } from "./announce-augmentors.js";

// PHB'14 p.75 — Arcane Charge's own grant level.
export const ARCANE_CHARGE_LEVEL = 15;

export const ARCANE_CHARGE_REMINDER =
  "Arcane Charge: teleport up to 30 ft to an unoccupied space you can see (before or after the additional action).";

// Total mapping per #1527 (mirrors weaponBondAvailable) — never `=== EDITION_…`.
// Eldritch Knight's PHB'24 text is unverified/PARKED (#1531) — same stance as weaponBondAvailable.
const EDITION_HAS_ARCANE_CHARGE: Record<RulesEdition, boolean> = {
  EDITION_2014: true,
  EDITION_2024: false,
};
export function arcaneChargeAvailable(edition: RulesEdition): boolean {
  return EDITION_HAS_ARCANE_CHARGE[edition];
}

// `entryLevel` is the fighter entry's own effective level, never the character's total level (PHB'14 p.75 grants this at Fighter 15).
export function hasArcaneCharge(entryLevel: number, isEldritchKnight: boolean, edition: RulesEdition): boolean {
  return isEldritchKnight && entryLevel >= ARCANE_CHARGE_LEVEL && arcaneChargeAvailable(edition);
}

export const arcaneChargeAugmentor: AnnounceAugmentor = {
  targetKeys: ["actionSurge"],
  appliesTo: (ctx) => hasArcaneCharge(ctx.entryLevel, ctx.slug === "fighter-eldritch-knight", ctx.edition),
  augment: () => ({ reminderAppend: ARCANE_CHARGE_REMINDER }),
};
