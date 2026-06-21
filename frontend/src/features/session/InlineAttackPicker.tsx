/**
 * InlineAttackPicker — inline weapon list for the TurnHub's attack resolution.
 *
 * Renders equipped weapons, Unarmed Strike, and Improvised Weapon. Each row
 * has Attack and Damage roll buttons. Clicking Attack rolls the d20+bonus,
 * then calls turnState.recordAttack() to decrement the Extra Attack counter.
 * When the counter reaches zero (attack becomes null), onClose() fires so
 * the TurnHub clears the active resolution.
 *
 * Retains the last damage RollResult per weapon row in local state so
 * PR4's ManeuverPrompt can receive it as a prop.
 *
 * Style: matches the existing AttacksPanel aesthetic — divide-y rows,
 * garnet attack buttons, parchment damage buttons.
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { useRoll } from "@/features/dice/RollContext";
import { formatRollSpec } from "@/lib/dice";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";
import type { RollResult } from "@/lib/dice";

interface InlineAttackPickerProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  onClose: () => void;
}

export default function InlineAttackPicker({
  character,
  turnState,
  onClose,
}: InlineAttackPickerProps) {
  const { roll } = useRoll();

  // Track the last damage roll per weapon (by item id or key string) for PR4.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [lastDamageRolls, setLastDamageRolls] = useState<Record<string, RollResult | null>>({});

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

        return (
          <div key={item.id} className="flex flex-col gap-1.5 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-parchment-900">{item.name}</p>
                <p className="text-xs text-parchment-500">
                  Attack: +{w.attackBonus ?? 0} · Damage: {damageLabel}{gripLabel}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    roll(
                      { count: 1, faces: 20, modifier: w.attackBonus ?? 0 },
                      `${item.name} attack`,
                    );
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
                  }}
                  className="rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
                >
                  Damage
                </button>
              </div>
            </div>
            {/* PR4: ManeuverPrompt goes here, receiving lastDamageRoll={lastDamageRolls[item.id] ?? null} */}
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
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                roll(
                  { count: 1, faces: 20, modifier: unarmedStrike.attackBonus },
                  "Unarmed strike attack",
                );
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
              }}
              className="rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
            >
              Damage
            </button>
          </div>
        </div>
        {/* PR4: ManeuverPrompt goes here, receiving lastDamageRoll={lastDamageRolls["unarmed"] ?? null} */}
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
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                roll(
                  { count: 1, faces: 20, modifier: improvisedWeapon.attackBonus },
                  "Improvised weapon attack",
                );
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
              }}
              className="rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
            >
              Damage
            </button>
          </div>
        </div>
        {/* PR4: ManeuverPrompt goes here, receiving lastDamageRoll={lastDamageRolls["improvised"] ?? null} */}
      </div>
    </div>
  );
}
