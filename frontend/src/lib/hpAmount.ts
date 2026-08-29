export type HpMode = "damage" | "heal" | "temp";

const MAX_HP_AMOUNT = 999;

export const ACCUMULATOR_CHIPS = [5, 10, 20] as const;

export interface HpSnapshot {
  current: number;
  max: number;
  temp: number;
}

export function clampAmount(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(MAX_HP_AMOUNT, Math.max(0, Math.trunc(value)));
}

export function accumulateAmount(current: number, delta: number): number {
  return clampAmount(current + delta);
}

export interface HpApplyDerivation {
  numericAmount: number;
  isResisted: boolean;
  halved: number;
  effectiveAmount: number;
}

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

export function projectHp(mode: HpMode, amount: number, hp: HpSnapshot): string {
  if (mode === "heal") {
    const next = Math.min(hp.max, hp.current + amount);
    return `→ ${next} / ${hp.max}`;
  }
  if (mode === "temp") {
    const next = Math.max(hp.temp, amount);
    return `Temp → ${next}`;
  }
  const remaining = Math.max(0, amount - hp.temp);
  const next = Math.max(0, hp.current - remaining);
  return `→ ${next} / ${hp.max}`;
}
