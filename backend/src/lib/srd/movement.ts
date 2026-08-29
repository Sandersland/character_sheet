import type { RulesEdition } from "@character-sheet/shared-types";

// SRD 5.2: Monk Unarmored Movement bonus by level, +10 at L2 rising to +30 at L18, lost while wearing armor or wielding a shield. Additive — composes with racial/feat speed bonuses, never merged into them.
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

// PHB p.48: Barbarian Fast Movement, +10 ft speed at level 5+ while not wearing heavy armor. Additive — composes with racial/feat speed bonuses and Monk Unarmored Movement.
export function deriveFastMovement(input: {
  barbarianLevel: number;
  wearingHeavyArmor: boolean;
}): number {
  const { barbarianLevel, wearingHeavyArmor } = input;
  return barbarianLevel >= 5 && !wearingHeavyArmor ? 10 : 0;
}

// Dragon Wings (Draconic Bloodline L14, #1123) — FORKS. PHB'14 p.107: a passive, indefinite-duration effect, so a derived value equal to walking speed is exact.
// PHB'24 p.148 (SRD 5.2 primary): a flat 60 ft Fly Speed for 1 hour on its own once-per-Long-Rest resource pool (dragonWings) — an activated ability, not a passive one, so 2024 gets no derived value here.
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
      return undefined;
    default: {
      const exhaustive: never = edition;
      throw new Error(`deriveDragonWingsFlySpeed: unhandled edition ${String(exhaustive)}`);
    }
  }
}
