// Shared step-rail wiring for a bonus-action attack sheet driven by the
// shared resolver (epic #1827; rewired off useAttackRolls/AttackStepCard onto
// useResolution/ResolutionRail, #1845) — the TWF off-hand swing
// (InlineOffHandPicker, #732, 1 swing) or Flurry of Blows' Unarmed Strikes
// (InlineFlurryPicker, #1217, 2+ swings). Mirrors InlineAttackPicker's own
// wiring (#1832: useResolution + useAttackTallyBridge + a resolveAction
// commit), generalized over `totalSwings`/`record` so TWF's always-1 swing
// and Flurry's multi-strike loop share one hook instead of two copies — each
// picker still owns its own forms/footer/kicker composition (TWF has no
// Resume; Flurry loops with a live counter and its own ADV/DIS control).
//
// Split into useBonusResolution (the resolveAction wiring) and
// useBonusAttackSheet (adds the tally-strip/maneuvers JSX on top) so neither
// function's own closure count trips the complexity gate — fallow scores a
// hook's cognitive load by its delegating closures, so branch-only extraction
// doesn't help; splitting the closures across two hooks does (same reasoning
// as the pre-#1845 version of this file).

import { useRef, useState } from "react";

import { critDamageSpec, hasSuperiorityDice } from "@/lib/attackMath";
import type { AttackEntry, DamageRider } from "@/lib/attackMath";
import { formatRollSpec } from "@/lib/dice";
import type { RollMode } from "@/lib/dice";
import { weaponToResolution } from "@/lib/weaponToResolution";
import { useRoll } from "@/features/dice/RollContext";
import { useAttackTallyBridge } from "@/features/session/useAttackTallyBridge";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import { buildManeuverView } from "@/features/session/maneuverViewBridge";
import { INERT_RESOLUTION_CONSUMERS, useResolution } from "@/features/session/useResolution";
import type { ResolutionRolls, ResolutionTurnState, ResolutionView } from "@/features/session/useResolution";
import { riderTotalsOf, useResolveActionCommit } from "@/features/session/useResolveActionCommit";
import AttackTallyStrip from "@/features/session/AttackTallyStrip";
import ManeuversDisclosure from "@/features/session/ManeuversDisclosure";
import type { RecordedAttack, TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { ResolveActionEventEffect, TurnResolution } from "@character-sheet/shared-types";
import type { Character } from "@/types/character";

// A bonus swing always resolves ONE served AttackEntry (buildBonusSwingEntry
// for TWF, the Flurry Unarmed Strike row) — but `entry` can be null (no
// off-hand weapon equipped), and useResolution/useAttackTallyBridge must stay
// UNCONDITIONAL hook calls either way. This placeholder's `cost` carries no
// toHit/save/effect, so every useResolution handler is a permanent no-op
// (its own guards), and it's never rendered — the picker shows its "No
// off-hand weapon" message instead of the rail when `entry` is null.
const NO_ENTRY_RESOLUTION: TurnResolution = { source: "", cost: { kind: "bonusAction" } };
const NO_ENTRY_PLACEHOLDER: AttackEntry = {
  id: "__none__",
  name: "",
  attackLabel: "",
  damageLabel: "",
  attackSpec: { count: 1, faces: 20, modifier: 0 },
  damageSpec: { count: 1, faces: 4, modifier: 0 },
  damageType: "bludgeoning",
  attackRollLabel: "",
  damageRollLabel: "",
  logSource: "",
  damageRiders: [],
};

// The economy shim useResolution spends against (mirrors InlineAttackPicker's
// attackResolutionTurnState, #1831 review comment 2): enterTwfMode/
// enterFlurryMode already consumed the REAL bonusActionUsed flag before this
// sheet mounts, so `consumeBonusAction` is deliberately inert — the actual
// per-swing spend is the tally bridge's own `record` call (recordTwfAttack/
// recordFlurryAttack), fired the instant to-hit rolls. `bonusActionUsed`
// here reads the LOCAL completedSwings/totalSwings count, not the
// already-true turnState.bonusActionUsed — deriving `disabled` from the real
// flag would self-disable the swing's own remaining steps (Call it/Damage/
// Done) the instant it started.
function bonusResolutionTurnState(completedSwings: number, totalSwings: number): ResolutionTurnState {
  return {
    actionsRemaining: 0,
    bonusActionUsed: completedSwings >= totalSwings,
    reactionUsed: true,
    ...INERT_RESOLUTION_CONSUMERS,
  };
}

// Driving-layer guard (mirrors InlineAttackPicker's own #1831 review comment
// 2, second half): ResolutionRail's Damage button stays visually enabled
// before Roll to hit — this keeps the STATE ordering honest for a bonus
// swing too. The crit-over-already-rolled-damage half of that guard does NOT
// need reproducing here: useResolution's own onCallCrit carries it now that
// this hook drives useResolution directly (see useResolution.ts's own
// "#1845's off-hand path" comment).
function guardDamageOrder(view: ResolutionView): ResolutionView {
  return {
    ...view,
    onRollEffect: () => {
      if (!view.toHitRoll) return;
      view.onRollEffect();
    },
  };
}

interface UseBonusAttackRollArgs {
  character: Character;
  turnState: TurnState & TurnStateActions;
  /** The single form this sheet resolves — null when nothing is resolvable (e.g. no off-hand weapon). */
  entry: AttackEntry | null;
  /** How many swings this bonus action resolves — 1 for TWF, 2+ for Flurry (#1244 Heightened Focus). */
  totalSwings: number;
  /** Spends this swing AND appends its `bonusAction`-source tally row; recordTwfAttack or recordFlurryAttack. */
  record: (recorded?: RecordedAttack) => void;
  onLogChanged: () => void;
  /** The sheet's own ADV/DIS choice (#958) — Flurry has one, TWF doesn't yet. */
  manualMode?: RollMode;
  /**
   * Fires exactly once, on the FIRST strike roll — the deferred-commit point
   * for a resource spend that must survive a pre-roll cancel (Flurry's 1
   * Focus, #1217: opening the sheet must not spend it). Omit for a sheet
   * with no deferred spend (TWF, Bonus Unarmed Strike).
   */
  onFirstStrike?: () => void;
}

/** The resolveAction/tally-bridge/rider core — no tally-strip/maneuvers JSX (that's useBonusAttackSheet's job). */
function useBonusResolution({
  character,
  turnState,
  entry,
  totalSwings,
  record,
  onLogChanged,
  manualMode,
  onFirstStrike,
}: UseBonusAttackRollArgs) {
  const { roll } = useRoll();
  // Lazy initializer mirrors InlineAttackPicker's own completedSwings seed —
  // `turnState.bonusAttack?.used ?? 0` is correct at every render this hook
  // actually mounts on: enterTwfMode/enterFlurryMode arm `bonusAttack` in the
  // SAME synchronous click handler that opens this sheet (see
  // useTurnActions.handleTwfAction/handleFlurryAction), so the very first
  // render already sees the armed `{total,used:0}` counter — a null
  // bonusAttack at first mount means nothing has been recorded yet either
  // way, so 0 is correct there too. `completedSwings` only advances
  // afterward via THIS hook's own handleCommit, never re-read off
  // turnState.bonusAttack again.
  const [local, setLocal] = useState(() => ({
    riderEffects: {} as Record<string, ResolveActionEventEffect>,
    completedSwings: turnState.bonusAttack?.used ?? 0,
  }));
  const firstStrikeCommittedRef = useRef(false);

  const resolution = entry ? weaponToResolution(entry, character.critRange, 1, "bonusAction") : NO_ENTRY_RESOLUTION;
  const armedEntry = entry ?? NO_ENTRY_PLACEHOLDER;
  const resolutionTurnState = bonusResolutionTurnState(local.completedSwings, totalSwings);

  // Fires the resolveAction transaction and advances the completed-swings
  // count — mirrors InlineAttackPicker's handleCommit (both now share
  // useResolveActionCommit). The tally row + the real bonusAttack advance
  // already happened earlier, at roll-to-hit time, via the tally bridge's
  // `record` call below.
  const { commit } = useResolveActionCommit({
    characterId: character.id,
    onLogChanged,
    onCommitted: () => setLocal((s) => ({ ...s, completedSwings: s.completedSwings + 1, riderEffects: {} })),
  });
  function handleCommit(rolls: ResolutionRolls) {
    commit(resolution, rolls, local.riderEffects);
  }

  const { view: rawResolutionView, reset } = useResolution({
    resolution,
    turnState: resolutionTurnState,
    commit: handleCommit,
    manualMode,
  });

  // The deferred first-strike spend (Flurry's 1 Focus) wraps onRollToHit —
  // committed before the very first roll of this sheet's lifetime, never again.
  function onRollToHit() {
    if (onFirstStrike && !firstStrikeCommittedRef.current) {
      firstStrikeCommittedRef.current = true;
      onFirstStrike();
    }
    rawResolutionView.onRollToHit();
  }
  const resolutionView = guardDamageOrder({ ...rawResolutionView, onRollToHit });

  const { currentRow } = useAttackTallyBridge(
    turnState,
    armedEntry,
    resolutionView,
    local.completedSwings,
    totalSwings,
    reset,
    "bonusAction",
    record,
  );

  // On-hit dice riders (rare on an off-hand/unarmed swing, but the shape is
  // generic) — same treatment as InlineAttackPicker's handleDamageRider
  // (#1843): routed into the SAME resolveAction event via local.riderEffects,
  // never a standalone logRoll event.
  function handleDamageRider(rider: DamageRider) {
    const spec = resolutionView.isCrit ? critDamageSpec(rider.spec) : rider.spec;
    const result = roll(spec, rider.rollLabel);
    setLocal((s) => ({
      ...s,
      riderEffects: {
        ...s.riderEffects,
        [rider.id]: {
          spec: formatRollSpec(result.spec),
          faces: result.dice.map((d) => d.value),
          total: result.total,
          type: rider.damageType ?? armedEntry.damageType,
          kind: "damage",
          crit: resolutionView.isCrit,
        },
      },
    }));
    if (currentRow) turnState.addTallyDamageRider(currentRow.id, result.total);
  }

  const maneuverView = buildManeuverView(resolutionView, armedEntry, currentRow, turnState);

  return {
    currentRow,
    resolutionView,
    maneuverView,
    riderTotals: riderTotalsOf(local.riderEffects),
    onDamageRider: handleDamageRider,
    completedSwings: local.completedSwings,
  };
}

export function useBonusAttackSheet(args: UseBonusAttackRollArgs) {
  const { character, turnState, entry, totalSwings } = args;
  const die = useManeuverDie(character);
  const core = useBonusResolution(args);

  const tallyStrip = (
    <AttackTallyStrip
      rows={turnState.attackTally}
      onSetVerdict={turnState.setTallyVerdict}
      source="bonusAction"
      heading="This bonus action"
    />
  );
  const attacksExhausted = core.completedSwings >= totalSwings;
  const maneuversDisclosure = hasSuperiorityDice(character) && (
    <ManeuversDisclosure
      turnState={turnState}
      view={core.maneuverView}
      attacksExhausted={attacksExhausted}
      die={die}
    />
  );

  return { ...core, entry, totalSwings, attacksExhausted, tallyStrip, maneuversDisclosure };
}
