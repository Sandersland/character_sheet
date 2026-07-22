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
