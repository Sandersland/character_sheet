// Pure model + formatting for the multi-attack tally (#802): the per-attack rows
// the attack sheet records, the auto-verdict rule (nat 20 → crit, nat 1 → miss),
// and the "Turn summary" banner lines. No JSX — rendered by AttackTallyStrip and
// TurnSummaryBanner, recorded by useTurnState.

export type TallyVerdict = "hit" | "miss" | "crit";

/** Which economy slot a tally row came from — the Attack action or the TWF bonus action (#813). */
export type TallyRowSource = "action" | "bonusAction";

/** The kept-d20 snapshot for one recorded attack roll. */
export interface TallyAttackRoll {
  total: number;
  keptFace: number | null;
  nat20: boolean;
  nat1: boolean;
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
}

// Verdict forced by the die: nat 20 → crit (auto hit), nat 1 → miss. Any other
// roll returns undefined so the row is a tap-to-cycle manual call.
export function autoVerdict(attack: TallyAttackRoll): TallyVerdict | undefined {
  if (attack.nat20) return "crit";
  if (attack.nat1) return "miss";
  return undefined;
}

// A row is locked (no manual verdict changes) when the die auto-decided it.
export function isVerdictLocked(row: AttackTallyRow): boolean {
  return row.attack.nat20 || row.attack.nat1;
}

// Explicit-miss only — an unresolved row is undecided, never a miss.
export function isMissRow(row: AttackTallyRow): boolean {
  return row.verdict === "miss";
}

export function isCritRow(row: AttackTallyRow): boolean {
  return row.verdict === "crit" || row.attack.nat20;
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
