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
import { applyInventoryTransactions, logRoll } from "@/api/client";
import { formatRollSpec } from "@/lib/dice";
import {
  attacksExhausted as computeAttacksExhausted,
  buildAttackEntries,
  hasSuperiorityDice,
} from "@/lib/attackMath";
import { maneuverPlacement, mechanicsFor } from "@/lib/maneuvers";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import AttackRow from "@/features/session/AttackRow";
import AttackOptionRow from "@/features/session/AttackOptionRow";
import EquipWeaponPanel from "@/features/session/EquipWeaponPanel";
import type { AttackEntry } from "@/lib/attackMath";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";
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

  // Persist a roll to the Session Log (best-effort — never blocks play).
  function logRollSafe(
    kind: "attack" | "damage",
    source: string,
    result: RollResult,
    spec: { count: number; faces: number; modifier: number },
    damageType?: string,
  ) {
    logRoll(character.id, sessionId, {
      kind,
      source,
      total: result.total,
      specLabel: formatRollSpec(spec),
      damageType,
      faces: result.dice.filter((d) => !d.dropped).map((d) => d.value),
    })
      .then(onLogChanged)
      .catch((e) => console.error("roll log failed", e));
  }

  const { pool, dieLabel, busy: dieBusy, spend } = useManeuverDie(character, onUpdate);

  // Per-weapon last roll results (keyed by item.id, "unarmed", or "improvised").
  const [lastAttackRolls, setLastAttackRolls] = useState<Record<string, RollResult | null>>({});
  const [lastDamageRolls, setLastDamageRolls] = useState<Record<string, RollResult | null>>({});

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
        (m) => maneuverPlacement(m.name) === "attackOption",
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

  // Handler for "attackOption" maneuver rows (e.g. Commander's Strike).
  async function handleAttackOption(maneuverName: string) {
    if (dieBusy || attacksExhausted || !pool || pool.remaining === 0) return;
    const mech = mechanicsFor(maneuverName);
    const dieResult = await spend();
    // Consume the slot specified by the maneuver (Commander's Strike → bonus action).
    if (mech.slot === "bonusAction" && !turnState.bonusActionUsed) {
      turnState.consumeBonusAction();
    } else if (mech.slot === "reaction" && !turnState.reactionUsed) {
      turnState.consumeReaction();
    }
    // Forfeit one of the Attack action's attacks.
    turnState.recordAttack();
    setManeuverMessages((prev) => ({
      ...prev,
      [maneuverName]: `${maneuverName} — tell an ally to use their reaction to make an attack, adding +${dieResult} (${dieLabel}) to the damage roll.`,
    }));
  }

  // Determine whether a given attackOption row's "Use" button is enabled.
  function attackOptionEnabled(maneuverName: string): { enabled: boolean; reason?: string } {
    if (!pool || pool.remaining === 0) {
      return { enabled: false, reason: "No superiority dice remaining." };
    }
    if (attacksExhausted) {
      return { enabled: false, reason: "No attacks remaining to forfeit." };
    }
    const mech = mechanicsFor(maneuverName);
    if (mech.slot === "bonusAction" && turnState.bonusActionUsed) {
      return { enabled: false, reason: "Bonus action already used." };
    }
    return { enabled: true };
  }

  return (
    <div className="flex flex-col divide-y divide-parchment-200">
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
          onAttack={handleAttack}
          onDamage={handleDamage}
          onRollsUpdated={makeOnRollsUpdated(entry.id)}
          onUpdate={onUpdate}
        />
      ))}

      {/* ── Attack-option maneuvers (e.g. Commander's Strike) ────────────────── */}
      {attackOptionManeuvers.map((m) => {
        const { enabled, reason } = attackOptionEnabled(m.name);
        return (
          <AttackOptionRow
            key={m.id}
            name={m.name}
            enabled={enabled}
            reason={reason}
            message={maneuverMessages[m.name]}
            dieLabel={dieLabel}
            dieBusy={dieBusy}
            onUse={handleAttackOption}
          />
        );
      })}

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
