/**
 * InlineAttackPicker — inline weapon list for the TurnHub's attack resolution.
 *
 * Renders equipped weapons, Unarmed Strike, Improvised Weapon, and any
 * "attackOption" maneuvers (e.g. Commander's Strike) that consume one of the
 * Attack action's attacks. Each weapon row has Attack and Damage roll buttons.
 *
 * The panel no longer auto-closes when the last attack is recorded. Instead,
 * Attack buttons disable at 0 remaining so the player can still roll damage and
 * spend superiority dice. An explicit "Done" button closes the panel.
 *
 * Maneuvers whose placement is "attackRoll" or "damageRoll" are shown inline
 * beneath their weapon row (ManeuverPrompt). "attackOption" maneuvers are shown
 * as their own rows at the bottom of the list. "reaction" and "effect" maneuvers
 * are handled in TurnHub (Reaction menu and standalone Maneuvers strip).
 *
 * Retains the last attack and damage RollResult per weapon row in local state
 * so ManeuverPrompt can receive them as props. Auto-summed maneuver totals
 * override the displayed roll total when a Battle Master spends a superiority die.
 *
 * Style: matches the existing AttacksPanel aesthetic — divide-y rows,
 * garnet attack buttons, parchment damage buttons.
 */

import { useState } from "react";

import { useRoll } from "@/features/dice/RollContext";
import { applyInventoryTransactions } from "@/api/client";
import {
  attacksExhausted as computeAttacksExhausted,
  buildAttackEntries,
  critDamageSpec,
  hasSuperiorityDice,
} from "@/lib/attackMath";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import { useRollLogger } from "@/features/session/useRollLogger";
import AttackRow from "@/features/session/AttackRow";
import AttackOptionRow from "@/features/session/AttackOptionRow";
import InlineSpellAttackSection from "@/features/session/InlineSpellAttackSection";
import EquipWeaponPanel from "@/features/session/EquipWeaponPanel";
import type { AttackEntry, DamageRider } from "@/lib/attackMath";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
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

  // Per-weapon last roll results (keyed by item.id, "unarmed", or "improvised").
  const [lastAttackRolls, setLastAttackRolls] = useState<Record<string, RollResult | null>>({});
  const [lastDamageRolls, setLastDamageRolls] = useState<Record<string, RollResult | null>>({});

  // Last rolled total per on-hit rider id (Flame Tongue +2d6), shown inline.
  const [riderTotals, setRiderTotals] = useState<Record<string, number>>({});

  // Auto-summed override totals set by ManeuverPrompt after a die spend.
  // When non-null, displayed instead of the raw roll total.
  const [attackTotals, setAttackTotals] = useState<Record<string, number | null>>({});
  const [damageTotals, setDamageTotals] = useState<Record<string, number | null>>({});

  // Per-maneuver reminder messages (keyed by maneuver name).
  const [maneuverMessages, setManeuverMessages] = useState<Record<string, string>>({});

  const equippedWeapons = character.inventory.filter(
    (item) => item.category === "weapon" && item.equipped && item.weapon,
  );

  // Weapons the player owns but hasn't equipped — surfaced inline so a freshly
  // created (or just-unequipped) character can arm up without leaving the
  // attack flow for the Inventory tab.
  const unequippedWeapons = character.inventory.filter(
    (item) => item.category === "weapon" && !item.equipped && item.weapon,
  );

  // Tracks the inventoryItemId currently being equipped (disables its button).
  const [equipping, setEquipping] = useState<string | null>(null);

  // Equip a weapon through the same audited setEquipped op the Inventory tab
  // uses; the returned character refreshes the picker so the weapon appears
  // in the equipped list immediately.
  async function handleEquip(inventoryItemId: string) {
    if (equipping) return;
    setEquipping(inventoryItemId);
    try {
      const updated = await applyInventoryTransactions(character.id, [
        { type: "setEquipped", inventoryItemId, equipped: true },
      ]);
      onUpdate(updated);
      onLogChanged();
    } catch (e) {
      console.error("equip failed", e);
    } finally {
      setEquipping(null);
    }
  }

  const showManeuvers = hasSuperiorityDice(character);

  const attacksExhausted = computeAttacksExhausted(turnState.attack);

  const attackEntries = buildAttackEntries(character);

  // "attackOption" maneuvers (Commander's Strike, etc.) — shown when in attack context.
  const attackOptionManeuvers = showManeuvers && turnState.attack !== null
    ? (character.resources?.maneuversKnown ?? []).filter(
        (m) => (m.placement ?? "damageRoll") === "attackOption",
      )
    : [];

  // Roll an attack for a row: log it, retain the result, clear any override, spend one attack.
  function handleAttack(entry: AttackEntry) {
    const result = roll(entry.attackSpec, entry.attackRollLabel);
    logRollSafe("attack", entry.logSource, result, entry.attackSpec);
    setLastAttackRolls((prev) => ({ ...prev, [entry.id]: result }));
    setAttackTotals((prev) => ({ ...prev, [entry.id]: null }));
    turnState.recordAttack();
  }

  // Roll damage for a row: log it, retain the result, clear any override.
  function handleDamage(entry: AttackEntry) {
    const result = roll(entry.damageSpec, entry.damageRollLabel);
    logRollSafe("damage", entry.logSource, result, entry.damageSpec, entry.damageType);
    setLastDamageRolls((prev) => ({ ...prev, [entry.id]: result }));
    setDamageTotals((prev) => ({ ...prev, [entry.id]: null }));
  }

  // Roll critical damage for a row: same path as handleDamage but on the doubled
  // (crit) weapon-dice spec, so the toast + Session Log read "(crit)" honestly.
  function handleCritDamage(entry: AttackEntry) {
    const spec = critDamageSpec(entry.damageSpec);
    const result = roll(spec, entry.damageRollLabel);
    logRollSafe("damage", entry.logSource, result, spec, entry.damageType);
    setLastDamageRolls((prev) => ({ ...prev, [entry.id]: result }));
    setDamageTotals((prev) => ({ ...prev, [entry.id]: null }));
  }

  // Roll one on-hit dice rider (e.g. Flame Tongue +2d6 fire) as its own typed
  // damage term through the shared dice engine + Session Log, carrying its type.
  // On a crit the rider's dice double too (Flame Tongue +2d6 → +4d6): mirror the
  // parent row's last damage roll — if that was rolled on a crit spec, roll this
  // rider on the crit spec as well, so the Critical button doubles ALL of the
  // attack's damage dice, not just the weapon's.
  function handleDamageRider(rider: DamageRider) {
    const parent = attackEntries.find((e) => e.damageRiders.some((r) => r.id === rider.id));
    const parentCrit = parent ? Boolean(lastDamageRolls[parent.id]?.spec.crit) : false;
    const spec = parentCrit ? critDamageSpec(rider.spec) : rider.spec;
    const result = roll(spec, rider.rollLabel);
    logRollSafe("damage", rider.logSource, result, spec, rider.damageType);
    setRiderTotals((prev) => ({ ...prev, [rider.id]: result.total }));
  }

  // Callback for ManeuverPrompt — stores auto-sum overrides per weapon.
  function makeOnRollsUpdated(weaponId: string) {
    return (newAtk: number | null, newDmg: number | null) => {
      if (newAtk !== null) {
        setAttackTotals((prev) => ({ ...prev, [weaponId]: newAtk }));
      }
      if (newDmg !== null) {
        setDamageTotals((prev) => ({ ...prev, [weaponId]: newDmg }));
      }
    };
  }

  // Handler for "attackOption" maneuver rows (e.g. Commander's Strike). The
  // action slot the maneuver consumes travels on the entry (catalog snapshot).
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

  // Determine whether a given attackOption row's "Use" button is enabled.
  function attackOptionEnabled(m: ManeuverEntry): { enabled: boolean; reason?: string } {
    if (!pool || pool.remaining === 0) {
      return { enabled: false, reason: "No superiority dice remaining." };
    }
    if (attacksExhausted) {
      return { enabled: false, reason: "No attacks remaining to forfeit." };
    }
    if (m.actionSlot === "bonusAction" && turnState.bonusActionUsed) {
      return { enabled: false, reason: "Bonus action already used." };
    }
    return { enabled: true };
  }

  return (
    <div className="flex flex-col divide-y divide-parchment-200">
      {/* Extra Attack count for this Attack action (server-derived). */}
      <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-parchment-600">
        Attacks: {character.attacksPerAction}
      </p>

      {equippedWeapons.length === 0 && attackOptionManeuvers.length === 0 && (
        <p className="pb-3 text-sm text-parchment-600">
          {unequippedWeapons.length > 0
            ? "No weapons equipped. Equip one below, or use the Inventory tab."
            : "No weapons equipped. Add a weapon from the Inventory tab, then equip it here."}
        </p>
      )}

      {/* ── Equip an owned-but-unequipped weapon, inline ─────────────────────── */}
      <EquipWeaponPanel weapons={unequippedWeapons} equipping={equipping} onEquip={handleEquip} />

      {attackEntries.map((entry) => (
        <AttackRow
          key={entry.id}
          entry={entry}
          attacksExhausted={attacksExhausted}
          showManeuvers={showManeuvers}
          character={character}
          attackTotal={attackTotals[entry.id]}
          damageTotal={damageTotals[entry.id]}
          lastAttackRoll={lastAttackRolls[entry.id] ?? null}
          lastDamageRoll={lastDamageRolls[entry.id] ?? null}
          riderTotals={riderTotals}
          onAttack={handleAttack}
          onDamage={handleDamage}
          onCritDamage={handleCritDamage}
          onDamageRider={handleDamageRider}
          onRollsUpdated={makeOnRollsUpdated(entry.id)}
          onUpdate={onUpdate}
        />
      ))}

      {/* ── Attack-option maneuvers (e.g. Commander's Strike) ────────────────── */}
      {attackOptionManeuvers.map((m) => {
        const { enabled, reason } = attackOptionEnabled(m);
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

      {/* ── Back / Done footer ────────────────────────────────────────────────── */}
      {/*
        Back is shown when no attack has been rolled yet — pressing it refunds
        the action so the player can choose a different one.
        Done is shown once at least one attack roll has been recorded — at that
        point the action is committed and cannot be returned.
      */}
      <div className="pt-3">
        {turnState.attack !== null && turnState.attack.used === 0 ? (
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
          >
            ← Back
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
