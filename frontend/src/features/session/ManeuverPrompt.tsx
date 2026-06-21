/**
 * ManeuverPrompt — inline Battle Master maneuver die spend, rendered inside
 * each weapon row of InlineAttackPicker.
 *
 * Only visible when the character has a superiorityDice pool with remaining > 0
 * and at least one maneuver known. Presents three sections:
 *
 *   1. Add to Attack (Precision Attack) — shown after an attack roll is made.
 *   2. Add to Damage — shown after a damage roll; lists applicable maneuvers.
 *   3. Apply Effect  — save-based / special maneuvers; spends the die and
 *      shows a DM narration reminder (no roll augment).
 *
 * On spend: rolls 1dX from pool.die via rollSpec, calls applyResourceTransactions,
 * then invokes onUpdate with the refreshed character and onRollsUpdated with the
 * new auto-summed total.
 *
 * Styling: compact gold-tinted strip — gold = resources in the design system.
 */

import { useState } from "react";

import { rollSpec } from "@/lib/dice";
import { mechanicsFor } from "@/lib/maneuvers";
import { applyResourceTransactions } from "@/api/client";
import type { Character } from "@/types/character";
import type { RollResult } from "@/lib/dice";

interface ManeuverPromptProps {
  character: Character;
  /** The last attack roll result for this weapon row (null = not yet rolled). */
  lastAttackRoll: RollResult | null;
  /** The last damage roll result for this weapon row (null = not yet rolled). */
  lastDamageRoll: RollResult | null;
  /**
   * Called with updated totals after a die is spent and auto-summed.
   * Pass null for a total that wasn't changed.
   */
  onRollsUpdated: (newAttackTotal: number | null, newDamageTotal: number | null) => void;
  onUpdate: (c: Character) => void;
}

export default function ManeuverPrompt({
  character,
  lastAttackRoll,
  lastDamageRoll,
  onRollsUpdated,
  onUpdate,
}: ManeuverPromptProps) {
  // ── All hooks at the top — no hooks after early returns ───────────────────

  const [busy, setBusy] = useState(false);
  const [spentFor, setSpentFor] = useState<string | null>(null);
  const [effectMessage, setEffectMessage] = useState<string | null>(null);
  const [selectedDamageManeuver, setSelectedDamageManeuver] = useState("");

  // ── Derive pool and maneuver list ─────────────────────────────────────────

  const pool = character.resources?.pools?.find((p) => p.key === "superiorityDice");
  const maneuversKnown = character.resources?.maneuversKnown ?? [];

  // Guard: only render when the character is a Battle Master with dice left.
  if (!pool || pool.total === 0 || pool.remaining === 0 || maneuversKnown.length === 0) {
    return null;
  }

  const diceFaces = pool.die ? parseInt(pool.die.replace("d", ""), 10) : 8;
  const dieLabel = pool.die ?? "d8";

  // Partition known maneuvers by mechanic class.
  const addToAttackManeuvers = maneuversKnown.filter(
    (m) => mechanicsFor(m.name).mechanic === "addToAttack",
  );
  const addToDamageManeuvers = maneuversKnown.filter(
    (m) => mechanicsFor(m.name).mechanic === "addToDamage",
  );
  const effectManeuvers = maneuversKnown.filter((m) => {
    const mech = mechanicsFor(m.name).mechanic;
    return mech === "saveBased" || mech === "special";
  });

  // Resolved current damage maneuver selection — fall back to first if state is stale.
  const activeDamageManeuver =
    addToDamageManeuvers.some((m) => m.name === selectedDamageManeuver)
      ? selectedDamageManeuver
      : (addToDamageManeuvers[0]?.name ?? "");

  // Show sections only when the relevant roll has been made.
  const showAttackSection = lastAttackRoll !== null && addToAttackManeuvers.length > 0;
  const showDamageSection = lastDamageRoll !== null && addToDamageManeuvers.length > 0;
  const showEffectSection = effectManeuvers.length > 0;

  // Nothing to show if no sections apply.
  if (!showAttackSection && !showDamageSection && !showEffectSection) {
    return null;
  }

  // ── Spend helper ──────────────────────────────────────────────────────────

  async function spend(maneuverName: string): Promise<number> {
    const dieResult = rollSpec({ count: 1, faces: diceFaces }).total;
    setBusy(true);
    try {
      const updated = await applyResourceTransactions(character.id, [
        { type: "spendResource", key: "superiorityDice", amount: 1, roll: dieResult },
      ]);
      onUpdate(updated);
      setSpentFor(maneuverName);
    } finally {
      setBusy(false);
    }
    return dieResult;
  }

  async function handlePrecision() {
    if (busy || !lastAttackRoll) return;
    const dieResult = await spend("Precision Attack");
    onRollsUpdated(lastAttackRoll.total + dieResult, null);
  }

  async function handleDamage(maneuverName: string) {
    if (busy || !lastDamageRoll) return;
    const dieResult = await spend(maneuverName);
    onRollsUpdated(null, lastDamageRoll.total + dieResult);
  }

  async function handleEffect(maneuverName: string) {
    if (busy) return;
    const dieResult = await spend(maneuverName);
    setEffectMessage(`Tell your DM: ${maneuverName} — rolled ${dieResult} on ${dieLabel}`);
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5 rounded-control border border-gold-200 bg-gold-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gold-700">
        Superiority Die ({dieLabel}, {pool.remaining} left)
      </p>

      {/* ── Add to Attack ───────────────────────────────────────────────── */}
      {showAttackSection && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gold-800">Add to Attack:</span>
          {addToAttackManeuvers.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={busy || spentFor === m.name}
              onClick={handlePrecision}
              className="rounded-control border border-gold-300 bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {m.name} +{dieLabel}
            </button>
          ))}
        </div>
      )}

      {/* ── Add to Damage ───────────────────────────────────────────────── */}
      {showDamageSection && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gold-800">Add to Damage:</span>
          {addToDamageManeuvers.length === 1 ? (
            <button
              type="button"
              disabled={busy || spentFor === addToDamageManeuvers[0].name}
              onClick={() => handleDamage(addToDamageManeuvers[0].name)}
              className="rounded-control border border-gold-300 bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {addToDamageManeuvers[0].name} +{dieLabel}
            </button>
          ) : (
            <>
              <select
                value={activeDamageManeuver}
                onChange={(e) => setSelectedDamageManeuver(e.target.value)}
                disabled={busy}
                className="rounded-control border border-gold-300 bg-white px-1.5 py-0.5 text-xs text-parchment-800 focus:outline-none focus:ring-1 focus:ring-gold-400"
                aria-label="Select maneuver to add to damage"
              >
                {addToDamageManeuvers.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !activeDamageManeuver || spentFor === activeDamageManeuver}
                onClick={() => handleDamage(activeDamageManeuver)}
                className="rounded-control border border-gold-300 bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Spend {dieLabel}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Apply Effect (save-based / special) ────────────────────────── */}
      {showEffectSection && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gold-800">Apply Effect:</span>
          {effectManeuvers.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={busy || spentFor === m.name}
              onClick={() => handleEffect(m.name)}
              className="rounded-control border border-gold-300 bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {m.name} ({dieLabel})
            </button>
          ))}
        </div>
      )}

      {/* ── DM narration reminder ───────────────────────────────────────── */}
      {effectMessage && (
        <p className="text-xs italic text-gold-700">{effectMessage}</p>
      )}
    </div>
  );
}
