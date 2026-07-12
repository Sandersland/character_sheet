// Attack sheet: equipped-weapon cards (deduped by name) + a shared Damage card,
// then Unarmed/Improvised rows, attack-option maneuvers, and attack cantrips (#734).

import { useState } from "react";

import { useRoll } from "@/features/dice/RollContext";
import {
  attacksExhausted as computeAttacksExhausted,
  buildEquippedWeaponEntries,
  buildImprovisedEntry,
  buildUnarmedEntry,
  critDamageSpec,
  hasSuperiorityDice,
} from "@/lib/attackMath";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import { useRollLogger } from "@/features/session/useRollLogger";
import AttackRow from "@/features/session/AttackRow";
import AttackOptionRow from "@/features/session/AttackOptionRow";
import { AttackCounter } from "@/features/session/TurnControls";
import InlineSpellAttackSection from "@/features/session/InlineSpellAttackSection";
import WeaponAttackCard from "@/features/session/WeaponAttackCard";
import WeaponDamageCard from "@/features/session/WeaponDamageCard";
import type { AttackEntry, DamageRider } from "@/lib/attackMath";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import { isNaturalTwenty } from "@/lib/dice";
import type { Character, ManeuverEntry } from "@/types/character";
import type { RollResult } from "@/lib/dice";

interface InlineAttackPickerProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  /** Active session id — attack/damage rolls are logged against it. */
  sessionId: string;
  onClose: () => void;
  /**
   * Called when the player cancels before rolling any attacks — refunds the
   * action and returns to the action menu.
   */
  onCancel: () => void;
  /** Required for ManeuverPrompt to push resource spend results back up to the page. */
  onUpdate: (c: Character) => void;
  /** Called after a roll is logged so the Session Log can refresh. */
  onLogChanged: () => void;
}

/** Whether an attackOption maneuver row's "Use" button is enabled, and why not. */
function attackOptionEnabled(
  m: ManeuverEntry,
  pool: { remaining: number } | null | undefined,
  exhausted: boolean,
  bonusActionUsed: boolean,
): { enabled: boolean; reason?: string } {
  if (!pool || pool.remaining === 0) {
    return { enabled: false, reason: "No superiority dice remaining." };
  }
  if (exhausted) {
    return { enabled: false, reason: "No attacks remaining to forfeit." };
  }
  if (m.actionSlot === "bonusAction" && bonusActionUsed) {
    return { enabled: false, reason: "Bonus action already used." };
  }
  return { enabled: true };
}

/**
 * Owns the per-row roll state (last attack/damage results, rider totals,
 * maneuver auto-sum overrides) and the roll handlers. Extracted from the
 * component so its state cluster and branching are scored — and testable —
 * as their own unit.
 */
function useAttackRolls({
  roll,
  logRollSafe,
  recordAttack,
}: {
  roll: ReturnType<typeof useRoll>["roll"];
  logRollSafe: ReturnType<typeof useRollLogger>;
  recordAttack: () => void;
}) {
  // Per-row last roll results (keyed by weapon item.id, "unarmed", or "improvised").
  const [lastAttackRolls, setLastAttackRolls] = useState<Record<string, RollResult | null>>({});
  const [lastDamageRolls, setLastDamageRolls] = useState<Record<string, RollResult | null>>({});

  // Last rolled total per on-hit rider id (Flame Tongue +2d6), shown inline.
  const [riderTotals, setRiderTotals] = useState<Record<string, number>>({});

  // Auto-summed override totals set by ManeuverPrompt after a die spend.
  const [attackTotals, setAttackTotals] = useState<Record<string, number | null>>({});
  const [damageTotals, setDamageTotals] = useState<Record<string, number | null>>({});

  // DM-called / expanded-crit-range override per row — OR'd with the auto nat-20.
  const [manualCrit, setManualCrit] = useState<Record<string, boolean>>({});

  // A row rolls crit damage when its to-hit kept a nat 20 OR the manual toggle is on.
  function isRowCrit(rowId: string): boolean {
    return Boolean(manualCrit[rowId]) || isNaturalTwenty(lastAttackRolls[rowId]);
  }

  function toggleManualCrit(rowId: string) {
    setManualCrit((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  }

  // Roll an attack for a row: log it, retain the result, clear any override, spend one attack.
  function handleAttack(entry: AttackEntry) {
    const result = roll(entry.attackSpec, entry.attackRollLabel);
    logRollSafe("attack", entry.logSource, result, entry.attackSpec);
    setLastAttackRolls((prev) => ({ ...prev, [entry.id]: result }));
    setAttackTotals((prev) => ({ ...prev, [entry.id]: null }));
    recordAttack();
  }

  // Roll damage for a row: auto-doubles the dice when the row is a crit (nat 20 or manual).
  function handleDamage(entry: AttackEntry) {
    const spec = isRowCrit(entry.id) ? critDamageSpec(entry.damageSpec) : entry.damageSpec;
    const result = roll(spec, entry.damageRollLabel);
    logRollSafe("damage", entry.logSource, result, spec, entry.damageType);
    setLastDamageRolls((prev) => ({ ...prev, [entry.id]: result }));
    setDamageTotals((prev) => ({ ...prev, [entry.id]: null }));
  }

  // Roll one on-hit dice rider (e.g. Flame Tongue +2d6 fire) as its own typed term.
  // On a crit the rider's dice double too — mirror the parent row's crit state.
  function handleDamageRider(rider: DamageRider, parentEntryId: string | null) {
    const parentCrit = parentEntryId
      ? isRowCrit(parentEntryId) || Boolean(lastDamageRolls[parentEntryId]?.spec.crit)
      : false;
    const spec = parentCrit ? critDamageSpec(rider.spec) : rider.spec;
    const result = roll(spec, rider.rollLabel);
    logRollSafe("damage", rider.logSource, result, spec, rider.damageType);
    setRiderTotals((prev) => ({ ...prev, [rider.id]: result.total }));
  }

  // Callback for ManeuverPrompt — stores auto-sum overrides per row.
  function makeOnRollsUpdated(rowId: string) {
    return (newAtk: number | null, newDmg: number | null) => {
      if (newAtk !== null) {
        setAttackTotals((prev) => ({ ...prev, [rowId]: newAtk }));
      }
      if (newDmg !== null) {
        setDamageTotals((prev) => ({ ...prev, [rowId]: newDmg }));
      }
    };
  }

  return {
    lastAttackRolls,
    lastDamageRolls,
    riderTotals,
    attackTotals,
    damageTotals,
    manualCrit,
    isRowCrit,
    toggleManualCrit,
    handleAttack,
    handleDamage,
    handleDamageRider,
    makeOnRollsUpdated,
  };
}

export default function InlineAttackPicker({
  character,
  turnState,
  sessionId,
  onClose,
  onCancel,
  onUpdate,
  onLogChanged,
}: InlineAttackPickerProps) {
  const { roll } = useRoll();
  const logRollSafe = useRollLogger(character.id, sessionId, onLogChanged);

  const { pool, dieLabel, busy: dieBusy, spend } = useManeuverDie(character, onUpdate);

  const rolls = useAttackRolls({ roll, logRollSafe, recordAttack: turnState.recordAttack });
  const {
    lastAttackRolls,
    lastDamageRolls,
    riderTotals,
    attackTotals,
    damageTotals,
    manualCrit,
    isRowCrit,
    toggleManualCrit,
    handleAttack,
    handleDamage,
    makeOnRollsUpdated,
  } = rolls;

  // Per-maneuver reminder messages (keyed by maneuver name).
  const [maneuverMessages, setManeuverMessages] = useState<Record<string, string>>({});

  const weaponEntries = buildEquippedWeaponEntries(character);
  const unarmedEntry = buildUnarmedEntry(character);
  const improvisedEntry = buildImprovisedEntry(character);

  // The weapon the Damage card rolls for — last weapon rolled/selected, default first.
  const [activeWeaponId, setActiveWeaponId] = useState<string | null>(null);
  const activeEntry =
    weaponEntries.find((e) => e.id === activeWeaponId) ?? weaponEntries[0] ?? null;

  const showManeuvers = hasSuperiorityDice(character);
  const attacksExhausted = computeAttacksExhausted(turnState.attack);

  // "attackOption" maneuvers (Commander's Strike, etc.) — shown when in attack context.
  const attackOptionManeuvers = showManeuvers && turnState.attack !== null
    ? (character.resources?.maneuversKnown ?? []).filter(
        (m) => (m.placement ?? "damageRoll") === "attackOption",
      )
    : [];

  // Roll to hit from a weapon card: make it the active weapon, then roll.
  function handleWeaponRollToHit(entry: AttackEntry) {
    setActiveWeaponId(entry.id);
    handleAttack(entry);
  }

  // Rider rolls mirror the ACTIVE weapon's crit state (see useAttackRolls).
  function handleDamageRider(rider: DamageRider) {
    rolls.handleDamageRider(rider, activeEntry?.id ?? null);
  }

  // Handler for "attackOption" maneuver rows (e.g. Commander's Strike).
  async function handleAttackOption(m: ManeuverEntry) {
    if (dieBusy || attacksExhausted || !pool || pool.remaining === 0) return;
    const dieResult = await spend(m.id);
    if (m.actionSlot === "bonusAction" && !turnState.bonusActionUsed) {
      turnState.consumeBonusAction();
    } else if (m.actionSlot === "reaction" && !turnState.reactionUsed) {
      turnState.consumeReaction();
    }
    // Forfeit one of the Attack action's attacks.
    turnState.recordAttack();
    setManeuverMessages((prev) => ({
      ...prev,
      [m.name]: `${m.name} — tell an ally to use their reaction to make an attack, adding +${dieResult} (${dieLabel}) to the damage roll.`,
    }));
  }

  const preRoll = turnState.attack !== null && turnState.attack.used === 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Live Extra-Attack counter — pips + "N of M remaining". Hidden at total 1
          (the kicker's "1 attack" is enough). */}
      {turnState.attack !== null && turnState.attack.total > 1 && (
        <AttackCounter total={turnState.attack.total} used={turnState.attack.used} label="Attacks" />
      )}

      {weaponEntries.length === 0 && (
        <p className="text-sm text-parchment-600">
          No weapon equipped — use Change on the turn screen.
        </p>
      )}

      {weaponEntries.map((entry) => (
        <WeaponAttackCard
          key={entry.id}
          entry={entry}
          active={activeEntry?.id === entry.id}
          attacksExhausted={attacksExhausted}
          attackTotal={attackTotals[entry.id]}
          lastAttackRoll={lastAttackRolls[entry.id] ?? null}
          onSelect={() => setActiveWeaponId(entry.id)}
          onRollToHit={() => handleWeaponRollToHit(entry)}
        />
      ))}

      {activeEntry && (
        <WeaponDamageCard
          key={activeEntry.id}
          entry={activeEntry}
          showManeuvers={showManeuvers}
          character={character}
          damageTotal={damageTotals[activeEntry.id]}
          lastAttackRoll={lastAttackRolls[activeEntry.id] ?? null}
          lastDamageRoll={lastDamageRolls[activeEntry.id] ?? null}
          riderTotals={riderTotals}
          isCrit={isRowCrit(activeEntry.id)}
          manualCrit={Boolean(manualCrit[activeEntry.id])}
          onDamage={handleDamage}
          onToggleCrit={() => toggleManualCrit(activeEntry.id)}
          onDamageRider={handleDamageRider}
          onRollsUpdated={makeOnRollsUpdated(activeEntry.id)}
          onUpdate={onUpdate}
        />
      )}

      {/* Unarmed Strike + Improvised Weapon stay available, restyled to card language. */}
      {[unarmedEntry, improvisedEntry].map((entry) => (
        <div key={entry.id} className="rounded-card border border-parchment-200 bg-parchment-50 px-3">
          <AttackRow
            entry={entry}
            attacksExhausted={attacksExhausted}
            showManeuvers={showManeuvers}
            character={character}
            attackTotal={attackTotals[entry.id]}
            damageTotal={damageTotals[entry.id]}
            lastAttackRoll={lastAttackRolls[entry.id] ?? null}
            lastDamageRoll={lastDamageRolls[entry.id] ?? null}
            riderTotals={riderTotals}
            isCrit={isRowCrit(entry.id)}
            manualCrit={Boolean(manualCrit[entry.id])}
            onAttack={handleAttack}
            onDamage={handleDamage}
            onToggleCrit={() => toggleManualCrit(entry.id)}
            onDamageRider={handleDamageRider}
            onRollsUpdated={makeOnRollsUpdated(entry.id)}
            onUpdate={onUpdate}
          />
        </div>
      ))}

      {/* ── Attack-option maneuvers (e.g. Commander's Strike) ────────────────── */}
      {attackOptionManeuvers.map((m) => {
        const { enabled, reason } = attackOptionEnabled(m, pool, attacksExhausted, turnState.bonusActionUsed);
        return (
          <AttackOptionRow
            key={m.id}
            name={m.name}
            enabled={enabled}
            reason={reason}
            message={maneuverMessages[m.name]}
            dieLabel={dieLabel}
            dieBusy={dieBusy}
            onUse={() => handleAttackOption(m)}
          />
        );
      })}

      {/* ── Attack-roll cantrips (Fire Bolt) — single transactional cast (#734) ── */}
      <InlineSpellAttackSection
        character={character}
        sessionId={sessionId}
        turnState={turnState}
        onUpdate={onUpdate}
        onLogChanged={onLogChanged}
      />

      {/* ── Cancel (pre-roll, refunds the action) / Done (post-roll) footer ──────
          The "N attacks · no target AC tracked" kicker lives in the sheet header
          (TurnResolutionSheets), not here — one statement per mockup. */}
      <div className="flex flex-col gap-1.5 pt-1">
        <button
          type="button"
          onClick={preRoll ? onCancel : onClose}
          className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
        >
          {preRoll ? "Cancel — refund action" : "Done"}
        </button>
      </div>
    </div>
  );
}
