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
import { maneuverPlacement, mechanicsFor } from "@/lib/maneuvers";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import ManeuverPrompt from "@/features/session/ManeuverPrompt";
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

// Gate: only show maneuver affordances when the character has a Battle Master die pool.
function hasSuperiorityDice(character: Character): boolean {
  return (
    character.resources?.pools?.some(
      (p) => p.key === "superiorityDice" && p.total > 0,
    ) ?? false
  );
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

  const { unarmedStrike, improvisedWeapon } = character;
  const showManeuvers = hasSuperiorityDice(character);

  // Attacks are exhausted when the counter has reached total (used >= total).
  // When attack is null (Flurry/Opportunity context), there is no counter → always allow.
  const attacksExhausted = turnState.attack !== null && turnState.attack.used >= turnState.attack.total;

  // "attackOption" maneuvers (Commander's Strike, etc.) — shown when in attack context.
  const attackOptionManeuvers = showManeuvers && turnState.attack !== null
    ? (character.resources?.maneuversKnown ?? []).filter(
        (m) => maneuverPlacement(m.name) === "attackOption",
      )
    : [];

  // Unarmed damage display — flat value when faces === 1 (baseline), or die notation.
  const unarmedDamageSpec = {
    count: unarmedStrike.damage.count,
    faces: unarmedStrike.damage.faces,
    modifier: unarmedStrike.damage.modifier,
  };
  const unarmedDamageDisplay =
    unarmedStrike.damage.faces === 1
      ? Math.max(1, 1 + unarmedStrike.damage.modifier)
      : `1d${unarmedStrike.damage.faces}${unarmedStrike.damage.modifier !== 0 ? ` + ${unarmedStrike.damage.modifier}` : ""}`;

  const improvisedDamageSpec = {
    count: improvisedWeapon.damage.count,
    faces: improvisedWeapon.damage.faces,
    modifier: improvisedWeapon.damage.modifier,
  };

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
        <p className="pb-3 text-sm text-parchment-500">
          {unequippedWeapons.length > 0
            ? "No weapons equipped. Equip one below, or use the Inventory tab."
            : "No weapons equipped. Add a weapon from the Inventory tab, then equip it here."}
        </p>
      )}

      {/* ── Equip an owned-but-unequipped weapon, inline ─────────────────────── */}
      {unequippedWeapons.length > 0 && (
        <div className="flex flex-col gap-1.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
            Equip a weapon
          </p>
          {unequippedWeapons.map((item) => (
            <div key={item.id} className="flex items-center justify-between">
              <p className="text-sm text-parchment-700">{item.name}</p>
              <button
                type="button"
                disabled={equipping !== null}
                onClick={() => handleEquip(item.id)}
                className="rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {equipping === item.id ? "Equipping…" : "Equip"}
              </button>
            </div>
          ))}
        </div>
      )}

      {equippedWeapons.map((item) => {
        const w = item.weapon!;
        const damageSpec = w.damage
          ? { count: w.damage.damageDiceCount, faces: w.damage.damageDiceFaces, modifier: w.damage.damageModifier }
          : { count: w.damageDiceCount, faces: w.damageDiceFaces, modifier: w.damageModifier };
        const damageLabel = `${formatRollSpec(damageSpec)} ${w.damage?.damageType ?? w.damageType}`;
        const gripLabel =
          w.damage?.grip === "versatile-two-handed" || w.damage?.grip === "two-handed"
            ? " (two-handed)"
            : "";

        const atkOverride = attackTotals[item.id];
        const dmgOverride = damageTotals[item.id];

        return (
          <div key={item.id} className="flex flex-col gap-1.5 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-parchment-900">{item.name}</p>
                <p className="text-xs text-parchment-500">
                  Attack: +{w.attackBonus ?? 0} · Damage: {damageLabel}{gripLabel}
                </p>
                {/* Auto-summed overrides display */}
                {atkOverride !== null && atkOverride !== undefined && (
                  <p className="text-xs font-semibold text-gold-800">
                    Attack total: {atkOverride} <span className="font-normal opacity-70">(+maneuver)</span>
                  </p>
                )}
                {dmgOverride !== null && dmgOverride !== undefined && (
                  <p className="text-xs font-semibold text-gold-800">
                    Damage total: {dmgOverride} <span className="font-normal opacity-70">(+maneuver)</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={attacksExhausted}
                  onClick={() => {
                    const spec = { count: 1, faces: 20, modifier: w.attackBonus ?? 0 };
                    const result = roll(spec, `${item.name} attack`);
                    logRollSafe("attack", item.name, result, spec);
                    setLastAttackRolls((prev) => ({ ...prev, [item.id]: result }));
                    // Clear any previous override when re-rolling
                    setAttackTotals((prev) => ({ ...prev, [item.id]: null }));
                    turnState.recordAttack();
                  }}
                  title={attacksExhausted ? "No attacks remaining" : undefined}
                  className="rounded-control border border-garnet-200 bg-garnet-50 px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Attack
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const dmgType = w.damage?.damageType ?? w.damageType;
                    const result = roll(damageSpec, `${item.name} damage (${dmgType})`);
                    logRollSafe("damage", item.name, result, damageSpec, dmgType);
                    setLastDamageRolls((prev) => ({ ...prev, [item.id]: result }));
                    // Clear any previous override when re-rolling
                    setDamageTotals((prev) => ({ ...prev, [item.id]: null }));
                  }}
                  className="rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
                >
                  Damage
                </button>
              </div>
            </div>
            {showManeuvers && (
              <ManeuverPrompt
                character={character}
                lastAttackRoll={lastAttackRolls[item.id] ?? null}
                lastDamageRoll={lastDamageRolls[item.id] ?? null}
                onRollsUpdated={makeOnRollsUpdated(item.id)}
                onUpdate={onUpdate}
              />
            )}
          </div>
        );
      })}

      {/* Unarmed strike */}
      <div className="flex flex-col gap-1.5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-parchment-900">Unarmed Strike</p>
            <p className="text-xs text-parchment-500">
              Attack: +{unarmedStrike.attackBonus} · Damage: {unarmedDamageDisplay} bludgeoning
            </p>
            {attackTotals["unarmed"] !== null && attackTotals["unarmed"] !== undefined && (
              <p className="text-xs font-semibold text-gold-800">
                Attack total: {attackTotals["unarmed"]} <span className="font-normal opacity-70">(+maneuver)</span>
              </p>
            )}
            {damageTotals["unarmed"] !== null && damageTotals["unarmed"] !== undefined && (
              <p className="text-xs font-semibold text-gold-800">
                Damage total: {damageTotals["unarmed"]} <span className="font-normal opacity-70">(+maneuver)</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={attacksExhausted}
              onClick={() => {
                const spec = { count: 1, faces: 20, modifier: unarmedStrike.attackBonus };
                const result = roll(spec, "Unarmed strike attack");
                logRollSafe("attack", "Unarmed Strike", result, spec);
                setLastAttackRolls((prev) => ({ ...prev, unarmed: result }));
                setAttackTotals((prev) => ({ ...prev, unarmed: null }));
                turnState.recordAttack();
              }}
              title={attacksExhausted ? "No attacks remaining" : undefined}
              className="rounded-control border border-garnet-200 bg-garnet-50 px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Attack
            </button>
            <button
              type="button"
              onClick={() => {
                const result = roll(unarmedDamageSpec, "Unarmed strike damage (bludgeoning)");
                logRollSafe("damage", "Unarmed Strike", result, unarmedDamageSpec, "bludgeoning");
                setLastDamageRolls((prev) => ({ ...prev, unarmed: result }));
                setDamageTotals((prev) => ({ ...prev, unarmed: null }));
              }}
              className="rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
            >
              Damage
            </button>
          </div>
        </div>
        {showManeuvers && (
          <ManeuverPrompt
            character={character}
            lastAttackRoll={lastAttackRolls["unarmed"] ?? null}
            lastDamageRoll={lastDamageRolls["unarmed"] ?? null}
            onRollsUpdated={makeOnRollsUpdated("unarmed")}
            onUpdate={onUpdate}
          />
        )}
      </div>

      {/* Improvised weapon */}
      <div className="flex flex-col gap-1.5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-parchment-900">Improvised Weapon</p>
            <p className="text-xs text-parchment-500">
              Attack: {improvisedWeapon.attackBonus >= 0 ? "+" : ""}
              {improvisedWeapon.attackBonus} · Damage:{" "}
              {formatRollSpec(improvisedDamageSpec)} bludgeoning
              {!improvisedWeapon.proficient && (
                <span className="ml-1 italic text-parchment-600">(no proficiency)</span>
              )}
            </p>
            {attackTotals["improvised"] !== null && attackTotals["improvised"] !== undefined && (
              <p className="text-xs font-semibold text-gold-800">
                Attack total: {attackTotals["improvised"]} <span className="font-normal opacity-70">(+maneuver)</span>
              </p>
            )}
            {damageTotals["improvised"] !== null && damageTotals["improvised"] !== undefined && (
              <p className="text-xs font-semibold text-gold-800">
                Damage total: {damageTotals["improvised"]} <span className="font-normal opacity-70">(+maneuver)</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={attacksExhausted}
              onClick={() => {
                const spec = { count: 1, faces: 20, modifier: improvisedWeapon.attackBonus };
                const result = roll(spec, "Improvised weapon attack");
                logRollSafe("attack", "Improvised Weapon", result, spec);
                setLastAttackRolls((prev) => ({ ...prev, improvised: result }));
                setAttackTotals((prev) => ({ ...prev, improvised: null }));
                turnState.recordAttack();
              }}
              title={attacksExhausted ? "No attacks remaining" : undefined}
              className="rounded-control border border-garnet-200 bg-garnet-50 px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Attack
            </button>
            <button
              type="button"
              onClick={() => {
                const result = roll(improvisedDamageSpec, "Improvised weapon damage (bludgeoning)");
                logRollSafe("damage", "Improvised Weapon", result, improvisedDamageSpec, "bludgeoning");
                setLastDamageRolls((prev) => ({ ...prev, improvised: result }));
                setDamageTotals((prev) => ({ ...prev, improvised: null }));
              }}
              className="rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
            >
              Damage
            </button>
          </div>
        </div>
        {showManeuvers && (
          <ManeuverPrompt
            character={character}
            lastAttackRoll={lastAttackRolls["improvised"] ?? null}
            lastDamageRoll={lastDamageRolls["improvised"] ?? null}
            onRollsUpdated={makeOnRollsUpdated("improvised")}
            onUpdate={onUpdate}
          />
        )}
      </div>

      {/* ── Attack-option maneuvers (e.g. Commander's Strike) ────────────────── */}
      {attackOptionManeuvers.map((m) => {
        const { enabled, reason } = attackOptionEnabled(m.name);
        const message = maneuverMessages[m.name];
        return (
          <div key={m.id} className="flex flex-col gap-1.5 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-parchment-900">{m.name}</p>
                <p className="text-xs text-parchment-500">
                  Forfeit 1 attack · Costs bonus action · Spend {dieLabel}
                </p>
                {message && (
                  <p className="mt-1 text-xs italic text-gold-700">{message}</p>
                )}
              </div>
              <button
                type="button"
                disabled={!enabled || dieBusy}
                onClick={() => handleAttackOption(m.name)}
                title={reason}
                className="rounded-control border border-gold-300 bg-gold-50 px-2.5 py-1 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Use
              </button>
            </div>
          </div>
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
