// Pure amount math for the HP action control (#787) — accumulate, clamp, project.

export type HpMode = "damage" | "heal" | "temp";

const MAX_HP_AMOUNT = 999;

// Accumulator chip steps offered beneath the amount readout.
export const ACCUMULATOR_CHIPS = [1, 5, 10, 20] as const;

export interface HpSnapshot {
  current: number;
  max: number;
  temp: number;
}

/** Clamp an amount to the valid 0–999 whole-number range. */
export function clampAmount(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(MAX_HP_AMOUNT, Math.max(0, Math.trunc(value)));
}

/** Add a chip/stepper delta to the current amount, clamped 0–999. */
export function accumulateAmount(current: number, delta: number): number {
  return clampAmount(current + delta);
}

export interface HpApplyDerivation {
  numericAmount: number;
  /** The chosen damage type is actively resisted (#456). */
  isResisted: boolean;
  halved: number;
  /** What the backend will actually apply after auto-halving (#456). */
  effectiveAmount: number;
}

/** Derive the apply-preview numbers from the control's raw inputs. */
export function deriveHpApply(
  mode: HpMode,
  rawAmount: string,
  damageType: string,
  resistedTypes: string[],
  applyResistance: boolean,
): HpApplyDerivation {
  const numericAmount = parseInt(rawAmount, 10) || 0;
  const isResisted = mode === "damage" && damageType !== "" && resistedTypes.includes(damageType);
  const halved = Math.floor(numericAmount / 2);
  return {
    numericAmount,
    isResisted,
    halved,
    effectiveAmount: isResisted && applyResistance ? halved : numericAmount,
  };
}

/** Projected-result line for the active mode, mirroring what Apply will do. */
export function projectHp(mode: HpMode, amount: number, hp: HpSnapshot): string {
  if (mode === "heal") {
    const next = Math.min(hp.max, hp.current + amount);
    return `${amount} → ${next} / ${hp.max}`;
  }
  if (mode === "temp") {
    const next = Math.max(hp.temp, amount);
    return `Temp ${hp.temp} → ${next}`;
  }
  // Damage: temp HP absorbs first, then current, floored at 0.
  const remaining = Math.max(0, amount - hp.temp);
  const next = Math.max(0, hp.current - remaining);
  return `${amount} HP → ${next} / ${hp.max}`;
}
