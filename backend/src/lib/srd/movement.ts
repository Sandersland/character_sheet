import type { RulesEdition } from "@character-sheet/shared-types";

// Monk Unarmored Movement speed bonus by monk level (SRD 5.2): +10 at L2, rising
// to +30 at L18. Lost while wearing armor or wielding a shield. Additive term —
// composes with racial base speed and feat speed bonuses, never merged into them.
export function deriveUnarmoredMovement(input: {
  monkLevel: number;
  isUnarmored: boolean;
  hasShield: boolean;
}): number {
  const { monkLevel, isUnarmored, hasShield } = input;
  if (!isUnarmored || hasShield || monkLevel < 2) return 0;
  if (monkLevel >= 18) return 30;
  if (monkLevel >= 14) return 25;
  if (monkLevel >= 10) return 20;
  if (monkLevel >= 6) return 15;
  return 10;
}

// Barbarian Fast Movement (PHB p.48): +10 ft speed at class level 5+ while not
// wearing heavy armor. Shields are irrelevant. Additive term — composes with
// racial base speed, feat speed bonuses, and Monk Unarmored Movement.
export function deriveFastMovement(input: {
  barbarianLevel: number;
  wearingHeavyArmor: boolean;
}): number {
  const { barbarianLevel, wearingHeavyArmor } = input;
  return barbarianLevel >= 5 && !wearingHeavyArmor ? 10 : 0;
}

// Dragon Wings (Draconic Bloodline L14, #1123) — FORKS. PHB'14 p.107: "gaining
// a flying speed equal to your current speed. The wings last until you
// dismiss them" — a passive, indefinite-duration effect, so a derived value
// equal to walking speed is exact. PHB'24 p.148 (SRD 5.2 primary): a FLAT 60 ft Fly
// Speed for 1 hour, gated behind its own once-per-Long-Rest `dragonWings`
// resource pool (already seeded, sorcerer-features.ts) — a genuinely
// different number AND an activated ability, not a passive one. Deriving a
// walking-speed-equal flySpeed for 2024 would be both the wrong value and a
// double-representation of the seeded resource. #1123 scopes toggled/
// while-active resources OUT (sprout/dismiss economy stays reminder text on
// the ClassFeature row); that scope line is exactly why 2024 gets NO derived
// value here rather than an attempt at the flat-60/resource-gated shape — a
// follow-up issue covers surfacing 2024 Dragon Wings as a resource-gated
// active buff. `edition` last, mirroring subclassGateLevel.
export function deriveDragonWingsFlySpeed(
  input: {
    draconicLevel: number;
    isUnarmored: boolean;
    walkingSpeed: number;
  },
  edition: RulesEdition,
): number | undefined {
  switch (edition) {
    case "EDITION_2014": {
      const { draconicLevel, isUnarmored, walkingSpeed } = input;
      if (draconicLevel < 14 || !isUnarmored) return undefined;
      return walkingSpeed;
    }
    case "EDITION_2024":
      // Deliberately no derived value — see the header: PHB'24 Dragon Wings
      // is a flat 60 ft activated ability on the seeded resource pool.
      return undefined;
    default: {
      const exhaustive: never = edition;
      throw new Error(`deriveDragonWingsFlySpeed: unhandled edition ${String(exhaustive)}`);
    }
  }
}
