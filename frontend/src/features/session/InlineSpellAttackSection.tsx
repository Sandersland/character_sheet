/**
 * InlineSpellAttackSection — attack-roll cantrips (Fire Bolt) surfaced inside the
 * attack sheet (#734). Reuses the existing spell-attack engine rather than a new
 * roller: the to-hit d20 uses `spellcasting.spellAttackBonus`, damage uses
 * `computeCastSpec`, and the cast commits via `applySpellcastingTransactions`.
 *
 * A spell attack branches the economy AWAY from the weapon Extra-Attack counter:
 * it never calls `recordAttack`. On cast it calls `commitActionSpell(0)`, which
 * spends the action, tears down attack mode, and records `spellCastThisTurn.action`
 * for the 5e leveled-spell interlock (Decision #8). `attackType:"save"` cantrips
 * (Sacred Flame) stay in the normal spell picker — filtered out here.
 */

import { useState } from "react";

import { useRoll } from "@/features/dice/RollContext";
import { applySpellcastingTransactions } from "@/api/client";
import { formatRollSpec, isNaturalTwenty } from "@/lib/dice";
import { computeCastSpec } from "@/lib/spellCast";
import { isAttackCantrip } from "@/lib/spellMeta";
import { useRollLogger } from "@/features/session/useRollLogger";
import SpellAttackRow from "@/features/session/SpellAttackRow";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character, Spell } from "@/types/character";
import type { RollResult } from "@/lib/dice";

interface InlineSpellAttackSectionProps {
  character: Character;
  sessionId: string;
  turnState: TurnState & TurnStateActions;
  onUpdate: (c: Character) => void;
  onLogChanged: () => void;
}

/** Formatted damage preview for a cantrip at character level (e.g. "1d10 fire"). */
function damageLabelFor(spell: Spell, character: Character): string {
  const spec = computeCastSpec(spell, character, 0);
  if (!spec) return "—";
  return `${formatRollSpec(spec)}${spell.damageType ? ` ${spell.damageType}` : ""}`;
}

export default function InlineSpellAttackSection({
  character,
  sessionId,
  turnState,
  onUpdate,
  onLogChanged,
}: InlineSpellAttackSectionProps) {
  const { roll } = useRoll();
  const logRollSafe = useRollLogger(character.id, sessionId, onLogChanged);

  const [attackRolled, setAttackRolled] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAttack, setLastAttack] = useState<Record<string, RollResult | null>>({});
  const [lastDamage, setLastDamage] = useState<Record<string, RollResult | null>>({});

  const cantrips = (character.spellcasting?.spells ?? []).filter(isAttackCantrip);
  if (cantrips.length === 0) return null;

  const attackBonus = character.spellcasting?.spellAttackBonus ?? 0;

  function handleAttack(spell: Spell) {
    const spec = { count: 1, faces: 20, modifier: attackBonus };
    const result = roll(spec, `${spell.name} spell attack`);
    logRollSafe("attack", spell.name, result, spec);
    setLastAttack((prev) => ({ ...prev, [spell.id]: result }));
    setAttackRolled((prev) => ({ ...prev, [spell.id]: true }));
    // Lock in the commitment: mark an attack made this turn so the sheet's
    // "Back" (action refund) is no longer offered — otherwise the player could
    // peek the spell-attack d20 and cancel for free (same guard weapons get).
    turnState.recordAttack();
  }

  // Roll the cantrip's damage (if any), returning the total to send to the server.
  // A nat-20 to-hit auto-doubles the damage dice, mirroring the weapon attack sheet.
  function rollDamage(spell: Spell): number {
    const base = computeCastSpec(spell, character, 0);
    if (!base) return 0;
    const spec = isNaturalTwenty(lastAttack[spell.id]) ? { ...base, crit: true } : base;
    const result = roll(spec, `${spell.name} — damage`);
    logRollSafe("damage", spell.name, result, spec, spell.damageType ?? undefined);
    setLastDamage((prev) => ({ ...prev, [spell.id]: result }));
    return result.total;
  }

  async function handleCast(spell: Spell) {
    if (busyId) return;
    setBusyId(spell.id);
    setError(null);
    const damageTotal = rollDamage(spell);
    try {
      const updated = await applySpellcastingTransactions(character.id, [
        { type: "castSpell", entryId: spell.id, roll: damageTotal },
      ]);
      onUpdate(updated);
      // The Attack action was already spent when the sheet opened (enterAttackMode).
      // grantExtraAction refunds that pre-commit so commitActionSpell's own
      // decrement nets to ZERO — recording the cantrip + tearing down attack mode
      // without a double-spend on Action-Surge turns (a plain commitActionSpell
      // here would burn two actions for one cantrip).
      turnState.grantExtraAction();
      turnState.commitActionSpell(0);
      setAttackRolled((prev) => ({ ...prev, [spell.id]: false }));
    } catch (e) {
      console.error("cantrip cast failed", e);
      setError("Cast failed — try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col divide-y divide-parchment-200">
      <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-parchment-600">
        Spell attacks
      </p>
      {cantrips.map((spell) => (
        <SpellAttackRow
          key={spell.id}
          spell={spell}
          attackBonus={attackBonus}
          damageLabel={damageLabelFor(spell, character)}
          attackRolled={attackRolled[spell.id] ?? false}
          busy={busyId === spell.id}
          lastAttack={lastAttack[spell.id] ?? null}
          lastDamage={lastDamage[spell.id] ?? null}
          onAttack={() => handleAttack(spell)}
          onCast={() => handleCast(spell)}
        />
      ))}
      {error && <p className="pt-2 text-xs text-garnet-700">{error}</p>}
    </div>
  );
}
