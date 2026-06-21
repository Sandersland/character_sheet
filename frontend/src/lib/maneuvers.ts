/**
 * maneuvers.ts — pure classification data for Battle Master maneuvers.
 *
 * Keyed by the exact name string from the seed (see backend/prisma/seed.ts
 * MANEUVERS array). Allows the ManeuverPrompt component to classify what a
 * given maneuver does mechanically without importing any backend logic.
 *
 * ManeuverMechanic values:
 *   "addToDamage"  — the superiority die is added to a damage roll.
 *   "addToAttack"  — the superiority die is added to an attack roll (Precision).
 *   "saveBased"    — the die result is used for a saving throw / AC / temp HP
 *                    effect (no attack/damage roll augment to auto-sum).
 *   "special"      — mechanics that don't fit the above (Commander's Strike).
 */

export type ManeuverMechanic = "addToDamage" | "addToAttack" | "saveBased" | "special";

export interface ManeuverMechanics {
  mechanic: ManeuverMechanic;
  /** True when using this maneuver forfeits one of the Attack action's attacks. */
  consumesAttack?: boolean;
  /** Which slot the maneuver occupies (undefined = action or no cost beyond superiority die). */
  slot?: "bonusAction" | "reaction";
}

export const MANEUVER_MECHANICS: Record<string, ManeuverMechanics> = {
  // ── Add to attack roll ─────────────────────────────────────────────────────
  "Precision Attack":     { mechanic: "addToAttack" },

  // ── Add to damage roll ─────────────────────────────────────────────────────
  "Trip Attack":          { mechanic: "addToDamage" },
  "Disarming Attack":     { mechanic: "addToDamage" },
  "Menacing Attack":      { mechanic: "addToDamage" },
  "Pushing Attack":       { mechanic: "addToDamage" },
  "Sweeping Attack":      { mechanic: "addToDamage" },
  "Distracting Strike":   { mechanic: "addToDamage" },
  "Goading Attack":       { mechanic: "addToDamage" },
  "Lunging Attack":       { mechanic: "addToDamage" },
  "Maneuvering Attack":   { mechanic: "addToDamage" },
  "Feinting Attack":      { mechanic: "addToDamage" },
  "Riposte":              { mechanic: "addToDamage", slot: "reaction" },
  "Rally":                { mechanic: "addToDamage" },

  // ── Save-based / AC / other effect ─────────────────────────────────────────
  "Parry":                { mechanic: "saveBased", slot: "reaction" },
  "Evasive Footwork":     { mechanic: "saveBased" },

  // ── Special ────────────────────────────────────────────────────────────────
  "Commander's Strike":   { mechanic: "special", consumesAttack: true, slot: "bonusAction" },
};

/**
 * Returns the mechanics entry for a maneuver by name.
 * Defaults to `{ mechanic: "addToDamage" }` for any unknown name so that
 * custom/homebrew maneuvers still render the Damage section.
 */
export function mechanicsFor(name: string): ManeuverMechanics {
  return MANEUVER_MECHANICS[name] ?? { mechanic: "addToDamage" };
}
