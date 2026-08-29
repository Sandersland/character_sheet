// Split into useBonusResolution and useBonusAttackSheet because fallow scores a hook's cognitive load by its delegating closures — splitting the closures across two hooks (not just branches) is what keeps this under the complexity gate.

import { useRef, useState } from "react";

import { critDamageSpec, hasSuperiorityDice } from "@/lib/attackMath";
import type { AttackEntry, DamageRider } from "@/lib/attackMath";
import { formatRollSpec } from "@/lib/dice";
import type { RollMode } from "@/lib/dice";
import { weaponToResolution } from "@/lib/weaponToResolution";
import { useRoll } from "@/features/dice/RollContext";
import { useAttackTallyBridge } from "@/features/session/useAttackTallyBridge";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import { buildManeuverView, MANEUVER_DAMAGE_RIDER_ID } from "@/features/session/maneuverViewBridge";
import { INERT_RESOLUTION_CONSUMERS, useResolution } from "@/features/session/useResolution";
import type { ResolutionRolls, ResolutionTurnState, ResolutionView } from "@/features/session/useResolution";
import { riderTotalsOf, useResolveActionCommit } from "@/features/session/useResolveActionCommit";
import AttackTallyStrip from "@/features/session/AttackTallyStrip";
import ManeuversDisclosure from "@/features/session/ManeuversDisclosure";
import type { RecordedAttack, TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { ResolveActionEventEffect, TurnResolution } from "@character-sheet/shared-types";
import type { Character } from "@/types/character";

// `entry` can be null (no off-hand weapon), but useResolution/useAttackTallyBridge must stay unconditional hook calls — this placeholder's cost carries no toHit/save/effect, so every handler is a permanent no-op, and it's never rendered.
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

// consumeBonusAction is deliberately inert here — the tally bridge's record() call is the real per-swing spend. bonusActionUsed reflects local completedSwings/totalSwings, not the already-true turnState.bonusActionUsed, so the swing's own remaining steps don't self-disable the instant it starts.
function bonusResolutionTurnState(completedSwings: number, totalSwings: number): ResolutionTurnState {
  return {
    actionsRemaining: 0,
    bonusActionUsed: completedSwings >= totalSwings,
    reactionUsed: true,
    ...INERT_RESOLUTION_CONSUMERS,
  };
}

// Keeps the Damage button from firing before Roll to hit for a bonus swing too; the crit-over-already-rolled-damage half of this guard lives in useResolution's own onCallCrit now, so it doesn't need reproducing here.
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
  entry: AttackEntry | null;
  totalSwings: number;
  /** Spends this swing and appends its bonusAction-source tally row (recordTwfAttack or recordFlurryAttack). */
  record: (recorded?: RecordedAttack) => void;
  onLogChanged: () => void;
  manualMode?: RollMode;
  /** Fires exactly once, on the first strike roll — the deferred-commit point for a resource spend that must survive a pre-roll cancel. */
  onFirstStrike?: () => void;
}

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
  // turnState.bonusAttack?.used ?? 0 is correct at every render this hook mounts on: enterTwfMode/enterFlurryMode arm bonusAttack synchronously in the same click that opens this sheet, and completedSwings only advances afterward via this hook's own handleCommit, never re-read off turnState.bonusAttack again.
  const [local, setLocal] = useState(() => ({
    riderEffects: {} as Record<string, ResolveActionEventEffect>,
    completedSwings: turnState.bonusAttack?.used ?? 0,
  }));
  const firstStrikeCommittedRef = useRef(false);

  const resolution = entry ? weaponToResolution(entry, character.critRange, 1, "bonusAction") : NO_ENTRY_RESOLUTION;
  const armedEntry = entry ?? NO_ENTRY_PLACEHOLDER;
  const resolutionTurnState = bonusResolutionTurnState(local.completedSwings, totalSwings);

  // The tally row and the real bonusAttack advance already happened earlier, at roll-to-hit time, via the tally bridge's record() call — this only fires the resolveAction transaction and advances completedSwings.
  const { commit, pending: commitPending, error: commitError } = useResolveActionCommit({
    characterId: character.id,
    onLogChanged,
    onCommitted: (batchId) => {
      setLocal((s) => ({ ...s, completedSwings: s.completedSwings + 1, riderEffects: {} }));
      // Tags the recordTwfAttack/recordFlurryAttack entry with this strike's batch so undo can revert it.
      turnState.attachBatchId(batchId);
    },
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
    commitPending,
    "bonusAction",
    record,
  );

  // Riders route into the SAME resolveAction event via local.riderEffects, never a standalone logRoll event.
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
          source: rider.logSource,
        },
      },
    }));
    if (currentRow) turnState.addTallyDamageRider(currentRow.id, result.total);
  }

  const maneuverView = buildManeuverView(resolutionView, armedEntry, currentRow, turnState, (effect) =>
    setLocal((s) => ({ ...s, riderEffects: { ...s.riderEffects, [MANEUVER_DAMAGE_RIDER_ID]: effect } })),
  );

  return {
    currentRow,
    resolutionView,
    maneuverView,
    riderTotals: riderTotalsOf(local.riderEffects),
    onDamageRider: handleDamageRider,
    completedSwings: local.completedSwings,
    commitError,
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
