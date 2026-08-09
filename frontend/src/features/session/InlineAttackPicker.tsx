// Attack sheet (#811, rewired to the shared resolver #1827 Slice 5 / #1832):
// weapons now drive `useResolution`/`ResolutionRail` (#1831) instead of the
// bespoke `useAttackRolls`/`AttackStepCard` pair — an "Attacking with" form
// selector, the shared numbered step-rail (Roll to hit → Call it → Damage),
// the "This action" tally strip, and a collapsed Battle Master maneuvers
// disclosure. Weapons-only as of #1833: attack cantrips (#734/#786) left this
// sheet for the Cast-a-Spell picker (InlineSpellPicker) — Attack and Cast a
// Spell are the mutually-exclusive Action choices they are in 5e. At md+ the
// sheet widens (~42rem) and the counter + tally + maneuvers move into a right
// rail beside the step card so the step column never scrolls — placement
// switches via useIsBelowMd (single mount per widget, like BottomSheet's own
// breakpoint gating).
//
// `useAttackRolls`/`AttackStepCard` are retired (#1845): InlineOffHandPicker/
// InlineFlurryPicker (useBonusAttackSheet) now drive this same
// useResolution/ResolutionRail pair too — every weapon/bonus-swing picker
// shares one resolver.
//
// One real behavior gap from the migration: `ResolutionRail`'s completion
// model requires a swing fully resolved (hit-and-damaged, or missed) before
// advancing — there is no "Skip, roll the next attack, leave this one
// unresolved" affordance the old AttackStepCard offered. That escape hatch
// doesn't exist in the shared rail (#1831) and stays out of scope — #1845
// carried the same gap into the bonus-action pickers rather than reproducing
// AttackStepCard's Skip link, matching this file's own accepted shape.

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
import { buildManeuverView } from "@/features/session/maneuverViewBridge";
import type { AttackEntryView } from "@/features/session/maneuverViewBridge";
import AttackTallyStrip from "@/features/session/AttackTallyStrip";
import AttackSheetFooter from "@/features/session/AttackSheetFooter";
import ManeuversDisclosure from "@/features/session/ManeuversDisclosure";
import SneakAttackSection from "@/features/session/SneakAttackSection";
import StunningStrikeSection from "@/features/session/StunningStrikeSection";
import QuiveringPalmSection from "@/features/session/QuiveringPalmSection";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { Character } from "@/types/character";

// Pure per-render derivations for the picker shell, extracted so the component
// stays a composition layer (the pre-#811 pattern, kept). `preRoll`/
// `attacksRemain` (the footer's own two flags) are deliberately NOT derived
// here — see the component body's own comment: they read `completedSwings`/
// `resolutionView`, not `turnState.attack`, so the footer's "Done" and the
// rail's own "Done" (ResolutionRail, #1831) never render at the same time.
function pickerView(character: Character, attack: TurnState["attack"], forms: AttackEntry[]) {
  return {
    // buildAttackForms always appends Unarmed + Improvised, so any other id is a weapon.
    hasWeapon: forms.some((f) => f.id !== "unarmed" && f.id !== "improvised"),
    showManeuvers: hasSuperiorityDice(character),
    attacksExhausted: computeAttacksExhausted(attack),
  };
}

// With a weapon: the sheet's ADV/DIS control (#958); without: the empty hint.
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

// The "Attacking with" form selector — hosted here (not inside ResolutionRail,
// which is weapon/spell-generic) and locked once a to-hit roll exists for the
// current swing, mirroring the old card's per-swing binding (you declare your
// weapon before you swing).
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

// The armed form's stats preview ("+5 to hit · 1d8+3 piercing") — ported from
// the old AttackStepCard's SelectedFormSummary (#786; the shared core lives in
// railPrimitives.tsx, #1832 fallow-flagged clone extraction). ResolutionRail
// (generic across weapon/spell shapes) doesn't reproduce this on its own, and
// unlike AttackStepCard's own summary, this one has no roll-mode chip — the
// rail already renders it (ResolutionRail's own ToHitStepContent).
function AttackFormSummary({ selected }: { selected: AttackEntry }) {
  return (
    <span className="min-w-0">
      <AttackFormSummaryCore selected={selected} />
    </span>
  );
}

// Post-hit rider sections (SneakAttackSection, StunningStrikeSection) share
// the exact same "render only once a hit row exists" gate and prop shape —
// one generic wrapper instead of two near-identical `currentRow && (<X .../>)`
// JSX branches (fallow flagged InlineAttackPicker's own complexity, #1832
// review: every inline `&&` in the component body is a decision point on
// BOTH its cyclomatic and cognitive score).
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

// Battle Master maneuvers disclosure, gated on the character having a
// superiority-die pool — extracted alongside HitGatedSection for the same
// reason (moves the `&&` branch off InlineAttackPicker's own score). Also
// owns its OWN useManeuverDie call (only this panel needs it) rather than
// receiving `die` as a prop — one less hook-density point on the parent.
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

// The economy shim useResolution spends against (#1831 review comment 2):
// Extra Attack's real economy spend already happened via enterAttackMode
// (useTurnActions.handleAttackAction, BEFORE this sheet mounts) — the
// Extra-Attack counter (turnState.attack) is what actually gates/advances a
// swing, so `consumeAction` is deliberately inert: a real spend here would
// double-decrement `actionsRemaining` under Action Surge.
//
// `actionsRemaining` is `attackTotal - completedSwings`, NOT derived from
// `turnState.attack.used` — `used` increments the moment to-hit is rolled
// (the provisional-row effect below), matching the kicker's pre-#1832
// display timing, but useResolution's `disabled` gates EVERY handler
// (onRollEffect/onCallCrit/onComplete, not just onRollToHit) — deriving it
// from `used` would self-disable the swing's own remaining steps the instant
// it started. `completedSwings` only advances in handleCommit, once a swing
// is actually done. `consume*` is the shared INERT_RESOLUTION_CONSUMERS
// (useResolution.ts, #1848 review) — InlineSpellPicker's own
// spellResolutionTurnState spreads the SAME constant rather than a second
// verbatim-copied trio, so a future ResolutionTurnState consume method can't
// be added to one shim and missed on the other.
function attackResolutionTurnState(attackTotal: number, completedSwings: number): ResolutionTurnState {
  return {
    actionsRemaining: attackTotal - completedSwings,
    bonusActionUsed: true,
    reactionUsed: true,
    ...INERT_RESOLUTION_CONSUMERS,
  };
}

// Two driving-layer guards over the shared ResolutionView (#1831) — neither
// edits useResolution.ts, which this slice drives but does not own:
//
// 1. #1831 review (NICE): once damage is already rolled, a later "Crit!" tap
//    must not silently flag `effect.crit: true` over non-doubled dice — inert
//    once `effectRoll` exists.
// 2. `onRollEffect` is gated only on the economy slot + a called miss inside
//    useResolution, not on a to-hit roll existing at all — ResolutionRail's
//    Damage button visually stays enabled before Roll to hit (a pre-existing
//    #1831 shape this slice didn't introduce), so this guard at least keeps
//    the STATE ordering honest: rolling damage before any to-hit is inert.
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

// Bundles the picker's own local UI state — the ADV/DIS choice (#958), rolled
// rider effects, the armed form, and the completed-swings counter — into ONE
// useState instead of four (fallow flagged InlineAttackPicker's own
// complexity, #1832 review: every hook call this component makes directly
// adds cognitive weight). `completedSwings`' lazy initializer mirrors its
// own prior comment: seeded from `attack.used` (not 0) so re-opening the
// sheet mid Extra Attack (Resume) doesn't grant back already-recorded
// swings — a sheet closed mid-swing (to-hit rolled, never completed) leaves
// its row unresolved in the tally, same as the pre-#1832 "Skip" affordance did.
//
// `riderEffects` (#1843) is keyed by rider id (overwrite-on-reroll, same as
// the pre-#1843 riderTotals map) and is the single source of truth for BOTH
// the DamageRiderList display total AND the riders[] array merged into the
// swing's resolveAction op at commit — `clearRiders` resets it after every
// commit so a rider rolled on swing 1 of an Extra Attack sequence never rides
// along into swing 2's op.
function usePickerLocalState(initialSelectedId: string, turnState: TurnState) {
  const [state, setState] = useState(() => ({
    attackMode: "normal" as RollMode,
    riderEffects: {} as Record<string, ResolveActionEventEffect>,
    selectedId: initialSelectedId,
    completedSwings: turnState.attack?.used ?? 0,
  }));
  return {
    ...state,
    setAttackMode: (attackMode: RollMode) => setState((s) => ({ ...s, attackMode })),
    setRiderEffect: (riderId: string, effect: ResolveActionEventEffect) =>
      setState((s) => ({ ...s, riderEffects: { ...s.riderEffects, [riderId]: effect } })),
    clearRiders: () => setState((s) => ({ ...s, riderEffects: {} })),
    setSelectedId: (selectedId: string) => setState((s) => ({ ...s, selectedId })),
    recordSwingComplete: () => setState((s) => ({ ...s, completedSwings: s.completedSwings + 1 })),
  };
}

interface InlineAttackPickerProps {
  turnState: TurnState & TurnStateActions;
  onClose: () => void;
  /**
   * Called when the player cancels before rolling any attacks — refunds the
   * action and returns to the action menu.
   */
  onCancel: () => void;
  /** Called after a roll is logged so the Session Log can refresh. */
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

  // Both cheap pure computations off render-fresh values — no useMemo: forms
  // (and armedEntry within them) are rebuilt every render by buildAttackForms,
  // so memoizing on armedEntry's identity would risk serving a stale
  // attack/damage snapshot if the character's numbers changed under the same
  // weapon id (e.g. a mid-combat buff).
  const resolution = weaponToResolution(armedEntry, character.critRange, character.attacksPerAction);
  const attackTotal = turnState.attack?.total ?? 1;
  const resolutionTurnState = attackResolutionTurnState(attackTotal, local.completedSwings);

  // Fires the resolveAction transaction and advances the completed-swings
  // count — the two things left to do at completion. Recording the tally row
  // happens EARLIER, the instant to-hit rolls (see useAttackTallyBridge):
  // SneakAttack/StunningStrike/QuiveringPalm/ManeuversDisclosure all need
  // `currentRow` DURING the swing, not just after it commits, mirroring the
  // pre-#1832 useAttackRolls timing. `clearRiders` always fires so a swing's
  // rider state never bleeds into the NEXT Extra Attack swing, rolled or not.
  const { commit } = useResolveActionCommit({
    characterId: character.id,
    onLogChanged,
    onCommitted: () => {
      local.recordSwingComplete();
      local.clearRiders();
    },
  });
  function handleCommit(rolls: ResolutionRolls) {
    commit(resolution, rolls, local.riderEffects);
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
  );

  const { roll } = useRoll();

  // On-hit dice riders (Flame Tongue +2d6 fire, #1235) route into the SAME
  // resolveAction event as the swing's own effect (#1843) — riders[] is an
  // additive sibling to effect (a genuinely different damage TYPE, not
  // another same-type instance), so this no longer writes its own roll-log
  // event (retired #1822/#1823 regression: a rider used to render as an
  // orphaned second feed row that undo couldn't reach). The rolled term is
  // held in local.riderEffects (overwrite-on-reroll, same as the pre-#1843
  // riderTotals map) and merged into the op at handleCommit.
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
    });
    if (currentRow) turnState.addTallyDamageRider(currentRow.id, result.total);
  }

  const maneuverView = buildManeuverView(resolutionView, armedEntry, currentRow, turnState);

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
  const sneakAttack = <HitGatedSection currentRow={currentRow} turnState={turnState} Section={SneakAttackSection} />;
  const stunningStrike = (
    <HitGatedSection currentRow={currentRow} turnState={turnState} Section={StunningStrikeSection} />
  );
  // Unlike the hit-gated riders above, Quivering Palm's Trigger isn't tied to a
  // hit this turn (it ends a prior Set, any time as a Magic action) — so this
  // mounts unconditionally rather than gating on currentRow; the section itself
  // gates Set on currentRow and Trigger on the active flag (#1245).
  const quiveringPalm = (
    <QuiveringPalmSection turnState={turnState} currentRow={currentRow} />
  );
  const damageRiders = (
    <DamageRidersPanel
      resolutionView={resolutionView}
      armedEntry={armedEntry}
      riderTotals={riderTotalsOf(local.riderEffects)}
      onDamageRider={handleDamageRider}
    />
  );
  // Locks the "Attacking with" selector once a to-hit roll exists for the
  // current swing — the already-rolled toHitState was built off the ARMED
  // form's bonus at roll time, so switching forms underneath it would
  // desync the displayed weapon from the number already on the die.
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
    </div>
  );
  // The footer's own two flags — keyed off `completedSwings`, NOT
  // `turnState.attack.used` (pickerView no longer computes these): `used`
  // increments the instant to-hit rolls (useAttackTallyBridge), which would
  // otherwise flip the footer to "Done" WHILE the swing is still being
  // resolved — showing two identically-labeled "Done" buttons at once (the
  // footer's own, and ResolutionRail's own completion tap). `preRoll`
  // additionally checks `!resolutionView.toHitRoll` so "Cancel — refund
  // action" disappears the instant a roll happens, same as before.
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

  // Mobile: one column in journey order. md+: the step card keeps the left
  // column and the counter/tally/maneuvers form the right rail (final-spec
  // frame 12) so the step column never scrolls. Cantrips left this sheet in
  // #1833 — the Attack sheet is weapons-only; Attack and Cast a Spell are the
  // mutually-exclusive Action choices they are in 5e.
  if (isMobile) {
    return (
      <div className="flex flex-col gap-2">
        {tallyStrip}
        {weaponRow}
        {stepCard}
        {maneuversDisclosure}
        {sneakAttack}
        {stunningStrike}
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
        {quiveringPalm}
      </div>
    </div>
  );
}
