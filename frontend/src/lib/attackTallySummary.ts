// Pure model + formatting for the multi-attack tally (#802): the per-attack rows
// the attack sheet records, the auto-verdict rule (crit range met → crit, nat 1
// → miss, #1120), and the "Turn summary" banner lines. No JSX — rendered by
// AttackTallyStrip and TurnSummaryBanner, recorded by useTurnState.

import { isCriticalRoll, isNaturalOne, isNaturalTwenty, keptD20 } from "@/lib/dice";
import type { RollResult } from "@/lib/dice";

export type TallyVerdict = "hit" | "miss" | "crit";

/** Which economy slot a tally row came from — the Attack action or the TWF bonus action (#813). */
export type TallyRowSource = "action" | "bonusAction";

/** The kept-d20 snapshot for one recorded attack roll. */
export interface TallyAttackRoll {
  total: number;
  keptFace: number | null;
  /** Literally rolled 20 on the kept die — display-only ("nat 20" text/badge), never the crit decision (#1120: Champion's widened crit range crits below 20 too). */
  nat20: boolean;
  nat1: boolean;
  /** Kept die met the character's crit range (defaults to `nat20` at range 20) — the ONE crit-decision field autoVerdict/isVerdictLocked/isCritRow read. */
  criticalHit: boolean;
}

/** One recorded attack this turn: the roll, an optional damage slot, a verdict. */
export interface AttackTallyRow {
  /** Stable per-row id — damage/rider/override writes target it, not "the last row" (#813). */
  id: string;
  /** Which slot recorded it — `action` (Attack) or `bonusAction` (off-hand TWF). */
  source: TallyRowSource;
  formId: string;
  formName: string;
  attack: TallyAttackRoll;
  damage?: number;
  verdict?: TallyVerdict;
  /** Correlates this row's roll events (attack/damage/rider) as one swing (#1235). */
  swingId?: string;
}

// A kept-d20 result → the tally's roll snapshot (#1120: the crit DECISION
// reads the character's served critRange, never a hardcoded 20). Shared by
// useAttackRolls' handleAttack and useResolution (#1831) so the "roll → build
// a TallyAttackRoll" step has exactly one implementation.
export function toHitSnapshot(result: RollResult, critRange: number): TallyAttackRoll {
  return {
    total: result.total,
    keptFace: keptD20(result)?.value ?? null,
    nat20: isNaturalTwenty(result),
    nat1: isNaturalOne(result),
    criticalHit: isCriticalRoll(result, critRange),
  };
}

// Verdict forced by the die: crit range met → crit (auto hit), nat 1 → miss.
// Any other roll returns undefined so the row is a tap-to-cycle manual call.
export function autoVerdict(attack: TallyAttackRoll): TallyVerdict | undefined {
  if (attack.criticalHit) return "crit";
  if (attack.nat1) return "miss";
  return undefined;
}

// A row is locked (no manual verdict changes) when the die auto-decided it.
export function isVerdictLocked(row: AttackTallyRow): boolean {
  return row.attack.criticalHit || row.attack.nat1;
}

// Explicit-miss only — an unresolved row is undecided, never a miss.
export function isMissRow(row: AttackTallyRow): boolean {
  return row.verdict === "miss";
}

export function isCritRow(row: AttackTallyRow): boolean {
  return row.verdict === "crit" || row.attack.criticalHit;
}

// No verdict yet — the attack was rolled but never called hit or miss (#811).
// Unresolved rows are tappable everywhere they render; resolved rows are final.
export function isUnresolvedRow(row: AttackTallyRow): boolean {
  return row.verdict === undefined;
}

// One "Turn summary" banner line. An unresolved row asks the question instead of
// claiming a hit (#811); miss rows drop damage; crit rows say so.
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
