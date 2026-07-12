// Pure model + formatting for the multi-attack tally (#802): the per-attack rows
// the attack sheet records, the auto-verdict rule (nat 20 → crit, nat 1 → miss),
// and the "Tell your DM" banner lines. No JSX — rendered by AttackTallyStrip and
// TurnDmBanner, recorded by useTurnState.

export type TallyVerdict = "hit" | "miss" | "crit";

/** The kept-d20 snapshot for one recorded attack roll. */
export interface TallyAttackRoll {
  total: number;
  keptFace: number | null;
  nat20: boolean;
  nat1: boolean;
}

/** One recorded attack this action: the roll, an optional damage slot, a verdict. */
export interface AttackTallyRow {
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

// A row is locked (no manual cycling) when the die auto-decided it.
export function isVerdictLocked(row: AttackTallyRow): boolean {
  return row.attack.nat20 || row.attack.nat1;
}

// Explicit-miss only — an unset verdict is treated as a hit ("no verdict gates anything").
export function isMissRow(row: AttackTallyRow): boolean {
  return row.verdict === "miss";
}

export function isCritRow(row: AttackTallyRow): boolean {
  return row.verdict === "crit" || row.attack.nat20;
}

// One "Tell your DM" banner line. Miss rows drop damage; crit rows say so.
export function attackTallyLine(row: AttackTallyRow): string {
  const name = row.formName;
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
