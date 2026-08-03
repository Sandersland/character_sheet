// Per-row roll state + handlers for the attack sheet, plus the AttackEntryView
// bundle each row/card renders from (mirrors the ActionSheetModel pattern in
// lib/turnOptions). Extracted from InlineAttackPicker so its state cluster and
// branching are scored — and testable — as their own unit (#778).
//
// Crit authority (#811): the current tally row's VERDICT is the only crit
// source — nat-20 auto-verdicts at record time, "Crit!" sets it manually. The
// old `manualCrit` checkbox state is gone; damage doubling reads the verdict.

import { useRef, useState } from "react";

import { critDamageSpec } from "@/lib/attackMath";
import { autoVerdict, isCritRow } from "@/lib/attackTallySummary";
import { isNaturalOne, isNaturalTwenty, keptD20 } from "@/lib/dice";
import { randomId } from "@/lib/ids";
import { resolveRollMode, rollModeChip } from "@/lib/rollMode";
import { useRoll } from "@/features/dice/RollContext";
import type { useRollLogger } from "@/features/session/useRollLogger";
import type { RecordedAttack } from "@/features/session/useTurnState";
import type { AttackTallyRow, TallyRowSource } from "@/lib/attackTallySummary";
import type { AttackEntry, DamageRider } from "@/lib/attackMath";
import type { RollMode, RollResult } from "@/lib/dice";

// Everything one AttackStepCard needs, bundled per entry so the component takes
// a single `view` prop instead of the full state surface.
export interface AttackEntryView {
  entry: AttackEntry;
  attackTotal: number | null | undefined;
  damageTotal: number | null | undefined;
  lastAttackRoll: RollResult | null;
  lastDamageRoll: RollResult | null;
  /** Effective crit — the current tally row's verdict is `crit` (#811). */
  isCrit: boolean;
  /** State-driven "why" chip for the attack roll (#486), e.g. "disadvantage — Poisoned"; "" when none. */
  attackChip: string;
  /** The resolved mode behind the chip — color by this, never by parsing the chip text. */
  attackMode: RollMode;
  onAttack: () => void;
  onDamage: () => void;
  onDamageRider: (rider: DamageRider) => void;
  onRollsUpdated: (newAttackTotal: number | null, newDamageTotal: number | null) => void;
}

export function useAttackRolls({
  roll,
  logRollSafe,
  recordAttack,
  setTallyDamage,
  setTallyAttackTotal,
  addTallyDamageRider,
  currentRow,
  source = "action",
  manualMode = "normal",
}: {
  roll: ReturnType<typeof useRoll>["roll"];
  logRollSafe: ReturnType<typeof useRollLogger>;
  recordAttack: (recorded: RecordedAttack) => void;
  setTallyDamage: (rowId: string, damage: number) => void;
  setTallyAttackTotal: (rowId: string, total: number) => void;
  addTallyDamageRider: (rowId: string, amount: number) => void;
  /** The most-recent tally row for THIS source — its verdict drives crit doubling and its id targets writes (#811/#813). */
  currentRow: AttackTallyRow | null;
  /** Which economy slot these rolls record into — `action` (default) or `bonusAction` for the off-hand (#813). */
  source?: TallyRowSource;
  /** The attack sheet's own ADV/DIS choice (#958) — merged with state grants. */
  manualMode?: RollMode;
}) {
  // State-driven advantage/disadvantage on attack rolls (#486, e.g. Poisoned)
  // merged with the sheet's own ADV/DIS control (#958); resolved once per attack.
  const { rollModifiers } = useRoll();
  // Attacks aren't ability-scoped, so the resolved mode is the same for every row.
  const resolvedAttack = resolveRollMode(rollModifiers, { kind: "attack" }, manualMode);
  const attackChip = rollModeChip(resolvedAttack);

  // Per-row last roll results (keyed by weapon item.id, "unarmed", or "improvised").
  const [lastAttackRolls, setLastAttackRolls] = useState<Record<string, RollResult | null>>({});
  const [lastDamageRolls, setLastDamageRolls] = useState<Record<string, RollResult | null>>({});

  // Last rolled total per on-hit rider id (Flame Tongue +2d6), shown inline.
  const [riderTotals, setRiderTotals] = useState<Record<string, number>>({});

  // Auto-summed override totals set by ManeuverPrompt after a die spend.
  const [attackTotals, setAttackTotals] = useState<Record<string, number | null>>({});
  const [damageTotals, setDamageTotals] = useState<Record<string, number | null>>({});

  // swingId correlates an entry's attack roll event with its damage roll event
  // as one swing (#1235) — client-generated because the route's own `batchId`
  // is minted fresh per HTTP request and can't span two separate logRoll
  // calls. A ref (not state) because it must survive from handleAttack to a
  // LATER handleDamage click without forcing a re-render in between; it is
  // regenerated per attack so a second swing never reuses the stale id.
  const swingIdRef = useRef<Record<string, string>>({});

  // A row rolls crit damage when it IS the current tally row and that row's
  // verdict is crit (nat-20 auto or manual "Crit!"). The direct nat-20 check
  // covers tally-less surfaces (the off-hand sheet passes currentRow: null
  // until #813) — for tallied rows it's redundant with the auto-verdict.
  function isRowCrit(rowId: string): boolean {
    if (isNaturalTwenty(lastAttackRolls[rowId])) return true;
    return currentRow !== null && currentRow.formId === rowId && isCritRow(currentRow);
  }

  // Roll an attack for a row: log it, retain the result, clear any override, spend
  // one attack, and append the tally row for this action (#802).
  function handleAttack(entry: AttackEntry) {
    // Pin the state-resolved mode (Poisoned disadvantage, manual override, RAW
    // cancel) and fold in any flat penalty (exhaustion −2×level, #1136).
    const attackSpec = {
      ...entry.attackSpec,
      modifier: (entry.attackSpec.modifier ?? 0) + resolvedAttack.modifier,
      mode: resolvedAttack.mode,
    };
    const result = roll(attackSpec, entry.attackRollLabel);
    const attack = {
      total: result.total,
      keptFace: keptD20(result)?.value ?? null,
      nat20: isNaturalTwenty(result),
      nat1: isNaturalOne(result),
    };
    // Fresh id per attack (#1235) — the damage roll below reads it back via entry.id.
    const swingId = randomId();
    swingIdRef.current[entry.id] = swingId;
    logRollSafe("attack", entry.logSource, result, attackSpec, undefined, {
      swingId,
      // Only the die-forced verdict is known synchronously — nat20/nat1 auto-
      // verdict (attackTallySummary's own rule). A middling roll stays
      // unresolved here; it's the tally's "Call it" step, not a re-log, that
      // later decides it (rolls are logged once and never mutated).
      verdict: autoVerdict(attack),
      nat20: attack.nat20,
      nat1: attack.nat1,
      crit: attack.nat20,
      // Both, deliberately: `sources` lists what applied, but the NET mode after
      // advantage/disadvantage cancellation is a rule (resolveRollMode). Logging
      // only the sources would force every reader to re-derive it (#1235).
      rollMode: resolvedAttack.mode,
      modeSources: resolvedAttack.sources,
      attackComponents: entry.attackComponents,
    });
    setLastAttackRolls((prev) => ({ ...prev, [entry.id]: result }));
    setAttackTotals((prev) => ({ ...prev, [entry.id]: null }));
    recordAttack({
      formId: entry.id,
      formName: entry.name,
      source,
      attack,
      // Carried onto the tally row so rollDamageFor (useTallyResolve) can
      // correlate its damage event with this attack even without reaching
      // swingIdRef (#1354).
      swingId,
    });
  }

  // Roll damage for a row: auto-doubles the dice when the row is a crit. Writes/
  // replaces the current tally row's damage slot (never appends) — which also
  // resolves an unset verdict to hit (#811, implicit hit).
  function handleDamage(entry: AttackEntry) {
    const rowCrit = isRowCrit(entry.id);
    const spec = rowCrit ? critDamageSpec(entry.damageSpec) : entry.damageSpec;
    const result = roll(spec, entry.damageRollLabel);
    logRollSafe("damage", entry.logSource, result, spec, entry.damageType, {
      // Shares the attack's swingId (#1235) — same swing, two roll events.
      swingId: swingIdRef.current[entry.id],
      // withAutoHit's rule ("rolling damage is an implicit hit call", #811)
      // reproduced here synchronously so the damage event carries a verdict
      // even when the attack roll didn't auto-resolve one (#1235).
      verdict: currentRow?.verdict ?? "hit",
      // The row's actual crit state at damage time (nat20 or a manual "Crit!"
      // call) — see RollEventData's `crit` doc for why this differs from the
      // attack event's nat20-only value.
      crit: rowCrit,
      damageComponents: entry.damageComponents,
    });
    setLastDamageRolls((prev) => ({ ...prev, [entry.id]: result }));
    setDamageTotals((prev) => ({ ...prev, [entry.id]: null }));
    if (currentRow) setTallyDamage(currentRow.id, result.total);
  }

  // Roll one on-hit dice rider (e.g. Flame Tongue +2d6 fire) as its own typed term.
  // On a crit the rider's dice double too — mirror the parent row's crit state.
  function handleDamageRider(rider: DamageRider, parentEntryId: string | null) {
    const parentCrit = parentEntryId
      ? isRowCrit(parentEntryId) || Boolean(lastDamageRolls[parentEntryId]?.spec.crit)
      : false;
    const spec = parentCrit ? critDamageSpec(rider.spec) : rider.spec;
    const result = roll(spec, rider.rollLabel);
    logRollSafe("damage", rider.logSource, result, spec, rider.damageType, {
      // Shares the parent swing's id (#1235/#1354) — the rider is another
      // roll event on the same swing, not a new one.
      swingId: parentEntryId ? swingIdRef.current[parentEntryId] : undefined,
    });
    setRiderTotals((prev) => ({ ...prev, [rider.id]: result.total }));
    if (currentRow) addTallyDamageRider(currentRow.id, result.total);
  }

  // Callback for ManeuverPrompt — stores auto-sum overrides per entry, and folds
  // the boosted totals into THIS source's current tally row (targeted by id, so a
  // second interleaved source never gets the override — #813).
  function makeOnRollsUpdated(entryId: string) {
    return (newAtk: number | null, newDmg: number | null) => {
      if (newAtk !== null) {
        setAttackTotals((prev) => ({ ...prev, [entryId]: newAtk }));
        if (currentRow) setTallyAttackTotal(currentRow.id, newAtk);
      }
      if (newDmg !== null) {
        setDamageTotals((prev) => ({ ...prev, [entryId]: newDmg }));
        if (currentRow) setTallyDamage(currentRow.id, newDmg);
      }
    };
  }

  // Bundle one entry's state + handlers into the view the row/card renders.
  // Rider rolls mirror THIS entry's crit state (the damage step only shows for
  // the active weapon, so binding to entry.id matches the active-weapon binding).
  function viewFor(entry: AttackEntry): AttackEntryView {
    return {
      entry,
      attackTotal: attackTotals[entry.id],
      damageTotal: damageTotals[entry.id],
      lastAttackRoll: lastAttackRolls[entry.id] ?? null,
      lastDamageRoll: lastDamageRolls[entry.id] ?? null,
      isCrit: isRowCrit(entry.id),
      attackChip,
      attackMode: resolvedAttack.mode,
      onAttack: () => handleAttack(entry),
      onDamage: () => handleDamage(entry),
      onDamageRider: (rider) => handleDamageRider(rider, entry.id),
      onRollsUpdated: makeOnRollsUpdated(entry.id),
    };
  }

  return { riderTotals, viewFor };
}
