/**
 * Eldritch Knight Arcane Charge (2014, PHB'14 p.75, #1852): "When you use
 * your Action Surge, you can teleport up to 30 feet to an unoccupied space
 * you can see, before or after the additional action." Pure self-or-announce
 * (#416: positional teleport, no target/positioning model) — the whole
 * feature reduces to reminder text riding the served Action Surge action
 * (deriveEntryScopedActions, actions.ts). No persisted state, no teleport
 * simulation.
 *
 * SRD 5.1 does not contain Eldritch Knight; this feature's text is PHB'14-
 * only. Mirrors Weapon Bond's own 2024-unverified/PARKED stance
 * (weapon-bond.ts, #1531): stays 2014-only until a real 2024 Eldritch Knight
 * text is authored.
 */
import type { RulesEdition } from "@character-sheet/shared-types";

import type { AnnounceAugmentor } from "./announce-augmentors.js";

/** PHB'14 p.75 — Arcane Charge's own grant level. */
export const ARCANE_CHARGE_LEVEL = 15;

export const ARCANE_CHARGE_REMINDER =
  "Arcane Charge: teleport up to 30 ft to an unoccupied space you can see (before or after the additional action).";

/**
 * Whether Arcane Charge exists at all for this edition. `switch` +
 * `assertNever`-typed default (#1527 pattern-setter — subclassGateLevel,
 * mirrored by weaponBondAvailable), never `if (edition === …) … else …`.
 */
export function arcaneChargeAvailable(edition: RulesEdition): boolean {
  switch (edition) {
    case "EDITION_2014":
      return true;
    case "EDITION_2024":
      // Eldritch Knight's PHB'24 text is unverified/PARKED (#1531) — same
      // stance as Weapon Bond (weapon-bond.ts) until that lands.
      return false;
    default: {
      const exhaustive: never = edition;
      throw new Error(`arcaneChargeAvailable: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// `entryLevel` is the FIGHTER entry's own effective level, never the
// character's total level — a Fighter-14/Wizard-1 (total 15) does not have
// Arcane Charge (PHB'14 p.75 grants it at Fighter 15).
export function hasArcaneCharge(entryLevel: number, isEldritchKnight: boolean, edition: RulesEdition): boolean {
  return isEldritchKnight && entryLevel >= ARCANE_CHARGE_LEVEL && arcaneChargeAvailable(edition);
}

/**
 * Arcane Charge (#1910) rides the row-driven Action Surge action rather than
 * getting its own row: an Eldritch Knight L15+ (2014) sees its teleport
 * clause appended to Action Surge's own reminder. Registered in
 * ANNOUNCE_AUGMENTORS (announce-augmentors.ts) — the one fold point
 * (deriveEntryScopedActions, actions.ts) already resolves the entry's own
 * subclass slug and effective level, which is all appliesTo needs; the
 * pipeline (not this descriptor) does the actual text concatenation.
 */
export const arcaneChargeAugmentor: AnnounceAugmentor = {
  targetKeys: ["actionSurge"],
  appliesTo: (ctx) => hasArcaneCharge(ctx.entryLevel, ctx.slug === "fighter-eldritch-knight", ctx.edition),
  augment: () => ({ reminderAppend: ARCANE_CHARGE_REMINDER }),
};
