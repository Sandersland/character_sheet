import { isCriticalRoll, isNaturalOne, isNaturalTwenty, keptD20 } from "@/lib/dice";
import type { RollResult } from "@/lib/dice";

export type TallyVerdict = "hit" | "miss" | "crit";

export type TallyRowSource = "action" | "bonusAction";

export interface TallyAttackRoll {
  total: number;
  keptFace: number | null;
  // Display-only ("nat 20" badge) — never the crit decision; Champion's widened crit range crits below 20 too (#1120).
  nat20: boolean;
  nat1: boolean;
  // The ONE crit-decision field — autoVerdict/isVerdictLocked/isCritRow all read this, never nat20.
  criticalHit: boolean;
}

export interface AttackTallyRow {
  // Stable id — damage/rider/override writes target it, not "the last row" (#813).
  id: string;
  source: TallyRowSource;
  formId: string;
  formName: string;
  attack: TallyAttackRoll;
  damage?: number;
  verdict?: TallyVerdict;
  // Correlates this row's attack/damage/rider events as one swing (#1235).
  swingId?: string;
}

// Shared by useAttackRolls.handleAttack and useResolution so the roll-to-TallyAttackRoll step has exactly one implementation (#1831).
export function toHitSnapshot(result: RollResult, critRange: number): TallyAttackRoll {
  return {
    total: result.total,
    keptFace: keptD20(result)?.value ?? null,
    nat20: isNaturalTwenty(result),
    nat1: isNaturalOne(result),
    criticalHit: isCriticalRoll(result, critRange),
  };
}

export function autoVerdict(attack: TallyAttackRoll): TallyVerdict | undefined {
  if (attack.criticalHit) return "crit";
  if (attack.nat1) return "miss";
  return undefined;
}

// Keeps a nat20 always paired with verdict "crit" (and a nat1 with "miss") — resolveActionToHitSchema's
// superRefine enforces the nat20/crit half of this on the wire. Shared by useResolution and
// useInstanceResolution's own crit-call guards (#1983 review) so the wire invariant lives in one place.
export function isDieLocked(attack: TallyAttackRoll): boolean {
  return attack.criticalHit || attack.nat1;
}

export function isVerdictLocked(row: AttackTallyRow): boolean {
  return isDieLocked(row.attack);
}

export function isMissRow(row: AttackTallyRow): boolean {
  return row.verdict === "miss";
}

export function isCritRow(row: AttackTallyRow): boolean {
  return row.verdict === "crit" || row.attack.criticalHit;
}

export function isUnresolvedRow(row: AttackTallyRow): boolean {
  return row.verdict === undefined;
}

export function attackTallyLine(row: AttackTallyRow): string {
  const name = row.formName;
  if (isUnresolvedRow(row)) {
    return `${name}: to-hit ${row.attack.total} — hit or miss?`;
  }
  if (isMissRow(row)) {
    return row.attack.nat1 ? `${name}: nat 1 — miss` : `${name}: miss (to-hit ${row.attack.total})`;
  }
  const hitPart = isCritRow(row) ? `crit! (to-hit ${row.attack.total})` : `hit — to-hit ${row.attack.total}`;
  const dmg = row.damage !== undefined ? ` — ${row.damage} damage` : " — roll damage";
  return `${name}: ${hitPart}${dmg}`;
}

export function attackTallyLines(rows: AttackTallyRow[]): string[] {
  return rows.map(attackTallyLine);
}
