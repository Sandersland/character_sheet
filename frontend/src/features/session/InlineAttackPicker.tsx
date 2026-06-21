/**
 * InlineAttackPicker — inline weapon list for the TurnHub's attack resolution.
 *
 * Renders equipped weapons, Unarmed Strike, and Improvised Weapon. Each row
 * has Attack and Damage roll buttons. Clicking Attack rolls the d20+bonus,
 * then calls turnState.recordAttack() to decrement the Extra Attack counter.
 * When the counter reaches zero (attack becomes null), onClose() fires so
 * the TurnHub clears the active resolution.
 *
 * Retains the last attack and damage RollResult per weapon row in local state
 * so ManeuverPrompt can receive them as props. Auto-summed maneuver totals
 * override the displayed roll total when a Battle Master spends a superiority die.
 *
 * Style: matches the existing AttacksPanel aesthetic — divide-y rows,
 * garnet attack buttons, parchment damage buttons.
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { useRoll } from "@/features/dice/RollContext";
import { formatRollSpec } from "@/lib/dice";
import ManeuverPrompt from "@/features/session/ManeuverPrompt";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";
import type { RollResult } from "@/lib/dice";

interface InlineAttackPickerProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  onClose: () => void;
  /** Required for ManeuverPrompt to push resource spend results back up to the page. */
  onUpdate: (c: Character) => void;
}

// Gate: only show ManeuverPrompt when the character has a Battle Master die pool.
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
  onClose,
  onUpdate,
}: InlineAttackPickerProps) {
  const { roll } = useRoll();

  // Per-weapon last roll results (keyed by item.id, "unarmed", or "improvised").
  const [lastAttackRolls, setLastAttackRolls] = useState<Record<string, RollResult | null>>({});
  const [lastDamageRolls, setLastDamageRolls] = useState<Record<string, RollResult | null>>({});

  // Auto-summed override totals set by ManeuverPrompt after a die spend.
  // When non-null, displayed instead of the raw roll total.
  const [attackTotals, setAttackTotals] = useState<Record<string, number | null>>({});
  const [damageTotals, setDamageTotals] = useState<Record<string, number | null>>({});

  // Guard so the initial null state of turnState.attack doesn't fire onClose
  // before the player even takes their first attack.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
  }, []);

  // When the attack counter is exhausted (transitions non-null → null), close.
  useEffect(() => {
    if (!mountedRef.current) return;
    if (turnState.attack === null) {
      onClose();
    }
    // onClose is stable — intentionally omitted from deps to avoid re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnState.attack]);

  const equippedWeapons = character.inventory.filter(
    (item) => item.category === "weapon" && item.equipped && item.weapon,
  );

  const { unarmedStrike, improvisedWeapon } = character;
  const showManeuvers = hasSuperiorityDice(character);

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

  return (
    <div className="flex flex-col divide-y divide-parchment-200">
      {equippedWeapons.length === 0 && (
        <p className="pb-3 text-sm text-parchment-500">
          No weapons equipped. Go to your{" "}
          <Link
            to={`/characters/${character.id}`}
            className="text-garnet-700 hover:underline"
          >
            character sheet
          </Link>{" "}
          and use the Equip button on a weapon.
        </p>
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
                  onClick={() => {
                    const result = roll(
                      { count: 1, faces: 20, modifier: w.attackBonus ?? 0 },
                      `${item.name} attack`,
                    );
                    setLastAttackRolls((prev) => ({ ...prev, [item.id]: result }));
                    // Clear any previous override when re-rolling
                    setAttackTotals((prev) => ({ ...prev, [item.id]: null }));
                    turnState.recordAttack();
                  }}
                  className="rounded-control border border-garnet-200 bg-garnet-50 px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-100"
                >
                  Attack
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const result = roll(
                      damageSpec,
                      `${item.name} damage (${w.damage?.damageType ?? w.damageType})`,
                    );
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
              onClick={() => {
                const result = roll(
                  { count: 1, faces: 20, modifier: unarmedStrike.attackBonus },
                  "Unarmed strike attack",
                );
                setLastAttackRolls((prev) => ({ ...prev, unarmed: result }));
                setAttackTotals((prev) => ({ ...prev, unarmed: null }));
                turnState.recordAttack();
              }}
              className="rounded-control border border-garnet-200 bg-garnet-50 px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-100"
            >
              Attack
            </button>
            <button
              type="button"
              onClick={() => {
                const result = roll(unarmedDamageSpec, "Unarmed strike damage (bludgeoning)");
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
                <span className="ml-1 italic text-parchment-400">(no proficiency)</span>
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
              onClick={() => {
                const result = roll(
                  { count: 1, faces: 20, modifier: improvisedWeapon.attackBonus },
                  "Improvised weapon attack",
                );
                setLastAttackRolls((prev) => ({ ...prev, improvised: result }));
                setAttackTotals((prev) => ({ ...prev, improvised: null }));
                turnState.recordAttack();
              }}
              className="rounded-control border border-garnet-200 bg-garnet-50 px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-100"
            >
              Attack
            </button>
            <button
              type="button"
              onClick={() => {
                const result = roll(
                  improvisedDamageSpec,
                  "Improvised weapon damage (bludgeoning)",
                );
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
    </div>
  );
}
