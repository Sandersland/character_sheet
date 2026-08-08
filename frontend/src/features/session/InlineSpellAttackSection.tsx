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

import { useRef, useState } from "react";

import { useRoll } from "@/features/dice/RollContext";
import { applySpellcastingTransactions } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import { autoVerdict } from "@/lib/attackTallySummary";
import { formatRollSpec, isNaturalOne, isNaturalTwenty, keptD20 } from "@/lib/dice";
import { randomId } from "@/lib/ids";
import { computeCastSpec } from "@/lib/spellCast";
import { isAttackCantrip } from "@/lib/spellMeta";
import { useRollLogger } from "@/features/session/useRollLogger";
import SpellAttackRow from "@/features/session/SpellAttackRow";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { Spell } from "@/types/character";
import type { RollResult } from "@/lib/dice";

interface InlineSpellAttackSectionProps {
  sessionId: string;
  turnState: TurnState & TurnStateActions;
  onLogChanged: () => void;
}

/** Formatted damage preview for a cantrip (e.g. "1d10 fire") — looks up the
 *  served slotLevel-0 roll (#1381), so it doesn't need the character at all. */
function damageLabelFor(spell: Spell): string {
  const spec = computeCastSpec(spell, 0);
  if (!spec) return "—";
  return `${formatRollSpec(spec)}${spell.damageType ? ` ${spell.damageType}` : ""}`;
}

export default function InlineSpellAttackSection({
  sessionId,
  turnState,
  onLogChanged,
}: InlineSpellAttackSectionProps) {
  const { character } = useCurrentCharacter();
  const { roll } = useRoll();
  const logRollSafe = useRollLogger(character.id, sessionId, onLogChanged);

  const [attackRolled, setAttackRolled] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastAttack, setLastAttack] = useState<Record<string, RollResult | null>>({});
  const [lastDamage, setLastDamage] = useState<Record<string, RollResult | null>>({});

  // swingId correlates this cantrip's attack roll with its cast's damage roll
  // as one swing (#1235/#1360), mirroring useAttackRolls' swingIdRef — a ref
  // (not state) so it survives from handleAttack to the later handleCast click
  // without a re-render, regenerated per attack so a re-roll never reuses a
  // stale id.
  const swingIdRef = useRef<Record<string, string>>({});

  const castMutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (ops: Parameters<typeof applySpellcastingTransactions>[1]) =>
      applySpellcastingTransactions(character.id, ops),
    toCharacter: (c) => c,
    fallbackMessage: "Cast failed — try again.",
  });

  const cantrips = (character.spellcasting?.spells ?? []).filter(isAttackCantrip);
  if (cantrips.length === 0) return null;

  const attackBonus = character.spellcasting?.spellAttackBonus ?? 0;

  function handleAttack(spell: Spell) {
    const spec = { count: 1, faces: 20, modifier: attackBonus };
    const result = roll(spec, `${spell.name} spell attack`);
    const attack = {
      total: result.total,
      keptFace: keptD20(result)?.value ?? null,
      nat20: isNaturalTwenty(result),
      nat1: isNaturalOne(result),
      // #1120: Champion's crit-range widening is "weapon attacks and Unarmed
      // Strikes" only (SRD 5.1/5.2) — a spell attack never qualifies, so this
      // stays the literal nat20 rule, never the character's served critRange.
      criticalHit: isNaturalTwenty(result),
    };
    // Fresh id per attack (#1235/#1360) — rollDamage reads it back via spell.id.
    const swingId = randomId();
    swingIdRef.current[spell.id] = swingId;
    logRollSafe("attack", spell.name, result, spec, undefined, {
      swingId,
      verdict: autoVerdict(attack),
      nat20: attack.nat20,
      nat1: attack.nat1,
      crit: attack.nat20,
    });
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
    const base = computeCastSpec(spell, 0);
    if (!base) return 0;
    const nat20 = isNaturalTwenty(lastAttack[spell.id]);
    const nat1 = isNaturalOne(lastAttack[spell.id]);
    const spec = nat20 ? { ...base, crit: true } : base;
    const result = roll(spec, `${spell.name} — damage`);
    // Shares the attack's swingId (#1360) — rolling damage is an implicit hit
    // call (same rule useAttackRolls.handleDamage documents) UNLESS the attack
    // die already decided miss/crit — a nat-1 attack still carries verdict
    // "miss" onto the damage event, not "hit".
    logRollSafe("damage", spell.name, result, spec, spell.damageType ?? undefined, {
      swingId: swingIdRef.current[spell.id],
      verdict: nat1 ? "miss" : nat20 ? "crit" : "hit",
      crit: nat20,
    });
    setLastDamage((prev) => ({ ...prev, [spell.id]: result }));
    return result.total;
  }

  async function handleCast(spell: Spell) {
    if (busyId) return;
    setBusyId(spell.id);
    const damageTotal = rollDamage(spell);
    try {
      await castMutation.mutateAsync([{ type: "castSpell", entryId: spell.id, roll: damageTotal }]);
      // Consumed only once the cast actually commits (#1360) — a rejected
      // mutateAsync falls to the catch below and offers a retry on the same
      // row (no re-roll), so the entry must survive to back that retry's
      // damage roll. A failed-then-retried cast logs two damage events
      // sharing one swingId, correctly — both belong to the one attack.
      delete swingIdRef.current[spell.id];
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
          damageLabel={damageLabelFor(spell)}
          attackRolled={attackRolled[spell.id] ?? false}
          busy={busyId === spell.id}
          lastAttack={lastAttack[spell.id] ?? null}
          lastDamage={lastDamage[spell.id] ?? null}
          onAttack={() => handleAttack(spell)}
          onCast={() => handleCast(spell)}
        />
      ))}
      {castMutation.error && <p className="pt-2 text-xs text-garnet-700">{castMutation.error}</p>}
    </div>
  );
}
