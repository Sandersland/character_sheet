export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

// 5e PHB: the DC to maintain concentration after taking damage is 10, or half the damage taken (rounded down), whichever is higher.
export function concentrationSaveDC(damage: number): number {
  return Math.max(10, Math.floor(damage / 2));
}

export function hitDieFace(hitDie: string): number {
  return Number(hitDie.replace(/^d/i, ""));
}
