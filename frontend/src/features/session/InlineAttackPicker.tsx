import { useState } from "react";

import Segmented from "@/components/ui/Segmented";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";

import { useRoll } from "@/features/dice/RollContext";
import RollModeChoice from "@/features/dice/RollModeChoice";
import { formatRollSpec } from "@/lib/dice";
import type { RollMode } from "@/lib/dice";
import {
  attacksExhausted as computeAttacksExhausted,
  buildAttackForms,
  critDamageSpec,
  hasSuperiorityDice,
  SNEAK_ATTACK_RIDER_ID,
  sneakAttackDamageRider,
  type AttackEntry,
  type DamageRider,
} from "@/lib/attackMath";
import { weaponToResolution } from "@/lib/weaponToResolution";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import { useAttackTallyBridge } from "@/features/session/useAttackTallyBridge";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import { INERT_RESOLUTION_CONSUMERS, useResolution } from "@/features/session/useResolution";
import type { ResolutionRolls, ResolutionTurnState, ResolutionView } from "@/features/session/useResolution";
import { riderTotalsOf, useResolveActionCommit } from "@/features/session/useResolveActionCommit";
import type { ResolveActionEventEffect } from "@character-sheet/shared-types";
import ResolutionRail from "@/features/session/ResolutionRail";
import { AttackFormSummaryCore, AttackKickerPips, DamageRidersPanel } from "@/features/session/railPrimitives";
import { buildManeuverView, MANEUVER_DAMAGE_RIDER_ID } from "@/features/session/maneuverViewBridge";
import type { AttackEntryView } from "@/features/session/maneuverViewBridge";
import AttackTallyStrip from "@/features/session/AttackTallyStrip";
import AttackSheetFooter from "@/features/session/AttackSheetFooter";
import ManeuversDisclosure from "@/features/session/ManeuversDisclosure";
import SneakAttackSection from "@/features/session/SneakAttackSection";
import StunningStrikeSection from "@/features/session/StunningStrikeSection";
import QuiveringPalmSection from "@/features/session/QuiveringPalmSection";
import AssassinateSection from "@/features/session/AssassinateSection";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { Character } from "@/types/character";

function pickerView(character: Character, attack: TurnState["attack"], forms: AttackEntry[]) {
  return {
    // buildAttackForms always appends Unarmed + Improvised, so any other id is a weapon.
    hasWeapon: forms.some((f) => f.id !== "unarmed" && f.id !== "improvised"),
    showManeuvers: hasSuperiorityDice(character),
    attacksExhausted: computeAttacksExhausted(attack),
  };
}

function WeaponRollModeRow({
  hasWeapon,
  mode,
  onSelect,
}: {
  hasWeapon: boolean;
  mode: RollMode;
  onSelect: (m: RollMode) => void;
}) {
  if (!hasWeapon) {
    return (
      <p className="text-sm text-parchment-600">
        No weapon equipped — use Change on the turn screen.
      </p>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        Roll to hit
      </span>
      <RollModeChoice selected={mode} onSelect={onSelect} ariaLabel="Attack roll mode" />
    </div>
  );
}

function AttackingWithRow({
  forms,
  selectedId,
  onSelect,
}: {
  forms: AttackEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (forms.length <= 1) return null;
  const options = forms.map((f) => ({ value: f.id, label: f.name }));
  return <Segmented label="Attacking with" options={options} value={selectedId} onChange={onSelect} />;
}

function AttackFormSummary({ selected }: { selected: AttackEntry }) {
  return (
    <span className="min-w-0">
      <AttackFormSummaryCore selected={selected} />
    </span>
  );
}

function HitGatedSection({
  currentRow,
  turnState,
  Section,
}: {
  currentRow: AttackTallyRow | null;
  turnState: TurnState & TurnStateActions;
  Section: React.ComponentType<{ turnState: TurnState & TurnStateActions; currentRow: AttackTallyRow | null }>;
}) {
  if (!currentRow) return null;
  return <Section turnState={turnState} currentRow={currentRow} />;
}

function SneakAttackPanel({
  turnState,
  currentRow,
  sneak,
  riderEffects,
  onDamageRider,
}: {
  turnState: TurnState & TurnStateActions;
  currentRow: AttackTallyRow | null;
  sneak: Character["sneakAttack"];
  riderEffects: Record<string, ResolveActionEventEffect>;
  onDamageRider: (rider: DamageRider) => void;
}) {
  if (!sneak) return null;
  const rider = sneakAttackDamageRider(sneak);
  return (
    <SneakAttackSection
      // key forces a remount per swing so the eligibility checkbox resets.
      key={currentRow?.id ?? "pre-roll"}
      turnState={turnState}
      currentRow={currentRow}
      onRoll={() => {
        onDamageRider(rider);
        turnState.markSneakAttackUsed();
      }}
      rolled={riderEffects[SNEAK_ATTACK_RIDER_ID]?.total ?? null}
    />
  );
}

function ManeuversPanel({
  show,
  character,
  turnState,
  maneuverView,
  attacksExhausted,
}: {
  show: boolean;
  character: Character;
  turnState: TurnState & TurnStateActions;
  maneuverView: AttackEntryView | null;
  attacksExhausted: boolean;
}) {
  const die = useManeuverDie(character);
  if (!show) return null;
  return (
    <ManeuversDisclosure turnState={turnState} view={maneuverView} attacksExhausted={attacksExhausted} die={die} />
  );
}

// consumeAction is deliberately inert: the real spend already happened via enterAttackMode, before this sheet mounts — a spend here would double-decrement actionsRemaining under Action Surge.
// actionsRemaining is attackTotal - completedSwings, not turnState.attack.used, because `used` increments the moment to-hit is rolled and would self-disable the swing's own remaining steps via useResolution's `disabled`.
function attackResolutionTurnState(attackTotal: number, completedSwings: number): ResolutionTurnState {
  return {
    actionsRemaining: attackTotal - completedSwings,
    bonusActionUsed: true,
    reactionUsed: true,
    ...INERT_RESOLUTION_CONSUMERS,
  };
}

function guardResolutionView(view: ResolutionView): ResolutionView {
  return {
    ...view,
    onCallCrit: () => {
      if (view.effectRoll) return;
      view.onCallCrit();
    },
    onRollEffect: () => {
      if (!view.toHitRoll) return;
      view.onRollEffect();
    },
  };
}

function usePickerLocalState(initialSelectedId: string, turnState: TurnState) {
  const [state, setState] = useState(() => ({
    attackMode: "normal" as RollMode,
    riderEffects: {} as Record<string, ResolveActionEventEffect>,
    selectedId: initialSelectedId,
    // Seeded from attack.used, not 0, so re-opening the sheet mid Extra Attack (Resume) doesn't grant back already-recorded swings.
    completedSwings: turnState.attack?.used ?? 0,
    assassinateSurprised: false,
  }));
  return {
    ...state,
    setAttackMode: (attackMode: RollMode) => setState((s) => ({ ...s, attackMode })),
    setRiderEffect: (riderId: string, effect: ResolveActionEventEffect) =>
      setState((s) => ({ ...s, riderEffects: { ...s.riderEffects, [riderId]: effect } })),
    // riderEffects is the single source of truth for both the display total and the riders[] merged at commit; clear it every commit or a rider bleeds into the next Extra Attack swing.
    clearRiders: () => setState((s) => ({ ...s, riderEffects: {} })),
    setSelectedId: (selectedId: string) => setState((s) => ({ ...s, selectedId })),
    recordSwingComplete: () => setState((s) => ({ ...s, completedSwings: s.completedSwings + 1 })),
    setAssassinateSurprised: (assassinateSurprised: boolean) => setState((s) => ({ ...s, assassinateSurprised })),
    // Cleared on every commit, same as riderEffects, so a non-toggled swing always starts unchecked.
    clearAssassinateSurprised: () => setState((s) => ({ ...s, assassinateSurprised: false })),
  };
}

interface InlineAttackPickerProps {
  turnState: TurnState & TurnStateActions;
  onClose: () => void;
  onCancel: () => void;
  onLogChanged: () => void;
}

export default function InlineAttackPicker({
  turnState,
  onClose,
  onCancel,
  onLogChanged,
}: InlineAttackPickerProps) {
  const { character } = useCurrentCharacter();

  const forms = buildAttackForms(character);
  const view = pickerView(character, turnState.attack, forms);

  const local = usePickerLocalState(forms[0].id, turnState);
  const armedEntry = forms.find((f) => f.id === local.selectedId) ?? forms[0];

  // No useMemo: forms (and armedEntry within them) are rebuilt every render by buildAttackForms, so memoizing on armedEntry's identity risks a stale snapshot under a mid-combat buff.
  const resolution = weaponToResolution(armedEntry, character.critRange, character.attacksPerAction);
  const attackTotal = turnState.attack?.total ?? 1;
  const resolutionTurnState = attackResolutionTurnState(attackTotal, local.completedSwings);

  const { commit, pending: commitPending, error: commitError } = useResolveActionCommit({
    characterId: character.id,
    onLogChanged,
    onCommitted: (batchId) => {
      local.recordSwingComplete();
      local.clearRiders();
      local.clearAssassinateSurprised();
      // Tags the swing's recordAttack history entry with its audit batch, or turn undo can't revert it server-side (#758).
      turnState.attachBatchId(batchId);
    },
  });
  function handleCommit(rolls: ResolutionRolls) {
    // The server schema requires toHit.verdict === "crit" whenever assassinate is set, so a miss (verdict settled by "it Missed") must never send true.
    const assassinate = local.assassinateSurprised && rolls.toHit?.verdict === "crit";
    commit(resolution, rolls, local.riderEffects, assassinate);
  }

  const { view: rawResolutionView, reset } = useResolution({
    resolution,
    turnState: resolutionTurnState,
    commit: handleCommit,
    manualMode: local.attackMode,
  });
  const resolutionView = guardResolutionView(rawResolutionView);

  const { currentRow } = useAttackTallyBridge(
    turnState,
    armedEntry,
    resolutionView,
    local.completedSwings,
    attackTotal,
    reset,
    commitPending,
  );

  const { roll } = useRoll();

  function handleDamageRider(rider: DamageRider) {
    const spec = resolutionView.isCrit ? critDamageSpec(rider.spec) : rider.spec;
    const result = roll(spec, rider.rollLabel);
    local.setRiderEffect(rider.id, {
      spec: formatRollSpec(result.spec),
      faces: result.dice.map((d) => d.value),
      total: result.total,
      type: rider.damageType ?? armedEntry.damageType,
      kind: "damage",
      crit: resolutionView.isCrit,
      source: rider.logSource,
    });
    if (currentRow) turnState.addTallyDamageRider(currentRow.id, result.total);
  }

  const maneuverView = buildManeuverView(resolutionView, armedEntry, currentRow, turnState, (effect) =>
    local.setRiderEffect(MANEUVER_DAMAGE_RIDER_ID, effect),
  );

  const isMobile = useIsBelowMd();

  const tallyStrip = (
    <AttackTallyStrip
      rows={turnState.attackTally}
      onSetVerdict={turnState.setTallyVerdict}
      source="action"
    />
  );
  const maneuversDisclosure = (
    <ManeuversPanel
      show={view.showManeuvers}
      character={character}
      turnState={turnState}
      maneuverView={maneuverView}
      attacksExhausted={view.attacksExhausted}
    />
  );
  const sneakAttack = (
    <SneakAttackPanel
      turnState={turnState}
      currentRow={currentRow}
      sneak={character.sneakAttack}
      riderEffects={local.riderEffects}
      onDamageRider={handleDamageRider}
    />
  );
  const stunningStrike = (
    <HitGatedSection currentRow={currentRow} turnState={turnState} Section={StunningStrikeSection} />
  );
  const quiveringPalm = (
    <QuiveringPalmSection turnState={turnState} currentRow={currentRow} />
  );
  const assassinate = (
    <AssassinateSection
      resolutionView={resolutionView}
      surprised={local.assassinateSurprised}
      onSurprisedChange={local.setAssassinateSurprised}
    />
  );
  const damageRiders = (
    <DamageRidersPanel
      resolutionView={resolutionView}
      armedEntry={armedEntry}
      riderTotals={riderTotalsOf(local.riderEffects)}
      onDamageRider={handleDamageRider}
    />
  );
  // Locked once a to-hit roll exists: the roll was built off the armed form's bonus, so switching forms underneath it would desync the weapon from the number already on the die.
  function handleSelectForm(id: string) {
    if (resolutionView.toHitRoll) return;
    local.setSelectedId(id);
  }

  const stepCard = (
    <div className="flex flex-col gap-2">
      {isMobile && <AttackKickerPips attack={turnState.attack} />}
      <AttackingWithRow forms={forms} selectedId={armedEntry.id} onSelect={handleSelectForm} />
      <AttackFormSummary selected={armedEntry} />
      <ResolutionRail view={resolutionView} />
      {damageRiders}
      {commitError && <p className="text-xs font-semibold text-garnet-700">{commitError}</p>}
    </div>
  );
  // Keyed off completedSwings, not turnState.attack.used, which increments the instant to-hit rolls — that would flip the footer to "Done" while ResolutionRail's own completion tap is still pending.
  const preRoll = local.completedSwings === 0 && !resolutionView.toHitRoll;
  const attacksRemain = !preRoll && local.completedSwings < attackTotal;
  const footer = (
    <AttackSheetFooter
      preRoll={preRoll}
      attacksRemain={attacksRemain}
      onCancel={onCancel}
      onClose={onClose}
    />
  );
  const weaponRow = (
    <WeaponRollModeRow hasWeapon={view.hasWeapon} mode={local.attackMode} onSelect={local.setAttackMode} />
  );

  if (isMobile) {
    return (
      <div className="flex flex-col gap-2">
        {tallyStrip}
        {weaponRow}
        {stepCard}
        {maneuversDisclosure}
        {sneakAttack}
        {stunningStrike}
        {assassinate}
        {quiveringPalm}
        {footer}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {weaponRow}
        {stepCard}
        {footer}
      </div>
      <div className="flex w-60 shrink-0 flex-col gap-2">
        <AttackKickerPips attack={turnState.attack} />
        {tallyStrip}
        {maneuversDisclosure}
        {sneakAttack}
        {stunningStrike}
        {assassinate}
        {quiveringPalm}
      </div>
    </div>
  );
}
