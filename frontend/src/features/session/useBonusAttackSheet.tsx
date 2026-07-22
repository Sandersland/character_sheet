// Shared step-rail wiring for a bonus-action attack sheet that resolves
// against a SINGLE form — the TWF off-hand swing (InlineOffHandPicker, #732)
// or Flurry of Blows' Unarmed Strike (InlineFlurryPicker, #1217). Factors out
// the bonusAction tally-row lookup, the useAttackRolls wiring, the roll/miss/
// crit/skip/next handlers, and the tally-strip + maneuvers-disclosure JSX that
// both pickers would otherwise duplicate — each picker still owns its own
// forms/footer/kicker composition, which genuinely differ (TWF is a single
// swing with no Resume; Flurry loops over 2+ strikes with a live counter).
//
// Split into useBonusAttackRoll (the roll/miss/crit/skip/next handlers) and
// useBonusAttackSheet (adds the tally-strip/maneuvers JSX on top) so neither
// function's own closure count trips the complexity gate — fallow scores a
// hook's cognitive load by its delegating closures, so branch-only extraction
// doesn't help; splitting the closures across two hooks does.

import { useRef, useState } from "react";

import { useRoll } from "@/features/dice/RollContext";
import { hasSuperiorityDice, type AttackEntry } from "@/lib/attackMath";
import type { RollMode } from "@/lib/dice";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import { useRollLogger } from "@/features/session/useRollLogger";
import { useAttackRolls } from "@/features/session/useAttackRolls";
import AttackTallyStrip from "@/features/session/AttackTallyStrip";
import ManeuversDisclosure from "@/features/session/ManeuversDisclosure";
import type { RecordedAttack, TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";

interface UseBonusAttackRollArgs {
  character: Character;
  turnState: TurnState & TurnStateActions;
  sessionId: string;
  /** The single form this sheet resolves — null when nothing is resolvable (e.g. no off-hand weapon). */
  entry: AttackEntry | null;
  /** Spends the bonus-attack counter; recordTwfAttack or recordFlurryAttack. */
  recordAttack: (recorded?: RecordedAttack) => void;
  onLogChanged: () => void;
  /** The sheet's own ADV/DIS choice (#958) — Flurry has one, TWF doesn't yet. */
  manualMode?: RollMode;
  /**
   * Fires exactly once, on the FIRST strike roll — the deferred-commit point
   * for a resource spend that must survive a pre-roll cancel (Flurry's 1
   * Focus, #1217: opening the sheet must not spend it, since cancelling
   * before any roll can't give back an already-spent Focus Point). Omit for
   * a sheet with no deferred spend (TWF, Bonus Unarmed Strike).
   */
  onFirstStrike?: () => void;
}

/** The roll/miss/crit/skip/next core — no tally-strip/maneuvers JSX (that's useBonusAttackSheet's job). */
function useBonusAttackRoll({
  character,
  turnState,
  sessionId,
  entry,
  recordAttack,
  onLogChanged,
  manualMode,
  onFirstStrike,
}: UseBonusAttackRollArgs) {
  const { roll } = useRoll();
  const logRollSafe = useRollLogger(character.id, sessionId, onLogChanged);
  const [rolledId, setRolledId] = useState<string | null>(null);
  const committedRef = useRef(false);

  // Bind steps 2–3 to the last bonusAction row — the tally also holds the
  // Attack action's rows, so "last row overall" would misattribute (#813).
  const currentRowIndex = turnState.attackTally.map((r) => r.source).lastIndexOf("bonusAction");
  const currentRow = currentRowIndex >= 0 ? turnState.attackTally[currentRowIndex] : null;

  const { riderTotals, viewFor } = useAttackRolls({
    roll,
    logRollSafe,
    recordAttack,
    setTallyDamage: turnState.setTallyDamage,
    setTallyAttackTotal: turnState.setTallyAttackTotal,
    addTallyDamageRider: turnState.addTallyDamageRider,
    currentRow,
    source: "bonusAction",
    ...(manualMode ? { manualMode } : {}),
  });

  const boundView = rolledId && entry ? viewFor(entry) : null;

  // Roll to hit with the (only) form and bind steps 2–3 to it. No-ops when
  // there's no form (TWF with no off-hand equipped — the caller renders a
  // fallback message instead of the step card in that case). The deferred
  // spend (if any) commits on this FIRST roll only — a `committedRef` guard
  // rather than a re-derivable condition, since "first" must survive across
  // this sheet's 2+ strikes without re-firing on strike 2.
  function handleRollToHit() {
    if (!entry) return;
    if (onFirstStrike && !committedRef.current) {
      committedRef.current = true;
      onFirstStrike();
    }
    setRolledId(entry.id);
    viewFor(entry).onAttack();
  }

  function handleCallMiss() {
    if (currentRowIndex >= 0) turnState.setTallyVerdict(currentRowIndex, "miss");
    setRolledId(null);
  }

  function handleCallCrit() {
    if (currentRowIndex >= 0) turnState.setTallyVerdict(currentRowIndex, "crit");
  }

  function handleSkip() {
    setRolledId(null);
  }

  // Re-arms step 1 for the next roll without rolling (#834 pattern).
  function handleNext() {
    setRolledId(null);
  }

  return {
    currentRow,
    riderTotals,
    viewFor,
    boundView,
    handleRollToHit,
    handleCallMiss,
    handleCallCrit,
    handleSkip,
    handleNext,
  };
}

interface UseBonusAttackSheetArgs extends UseBonusAttackRollArgs {
  /** Whether Roll to hit should be disabled — each caller defines its own "spent" rule. */
  attacksExhausted: boolean;
  onUpdate: (c: Character) => void;
}

export function useBonusAttackSheet({
  character,
  turnState,
  sessionId,
  entry,
  recordAttack,
  attacksExhausted,
  onUpdate,
  onLogChanged,
  manualMode,
  onFirstStrike,
}: UseBonusAttackSheetArgs) {
  const die = useManeuverDie(character, onUpdate);
  const roll = useBonusAttackRoll({
    character,
    turnState,
    sessionId,
    entry,
    recordAttack,
    onLogChanged,
    manualMode,
    onFirstStrike,
  });

  const tallyStrip = (
    <AttackTallyStrip
      rows={turnState.attackTally}
      onSetVerdict={turnState.setTallyVerdict}
      source="bonusAction"
      heading="This bonus action"
    />
  );
  const maneuversDisclosure = hasSuperiorityDice(character) && (
    <ManeuversDisclosure
      character={character}
      turnState={turnState}
      view={roll.boundView}
      attacksExhausted={attacksExhausted}
      die={die}
      onUpdate={onUpdate}
    />
  );

  return { ...roll, tallyStrip, maneuversDisclosure };
}
