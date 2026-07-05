/**
 * ManeuverPrompt — inline Battle Master maneuver die spend, rendered inside
 * each weapon row of InlineAttackPicker.
 *
 * Only shows maneuvers whose placement is "attackRoll" or "damageRoll" (i.e.
 * those that genuinely augment *this* weapon's attack or damage roll). Maneuvers
 * routed to "attackOption" (Commander's Strike), "reaction" (Parry/Riposte), or
 * "effect" (Evasive Footwork) are handled at the TurnHub / InlineAttackPicker
 * level and do NOT appear here.
 *
 * Two sections:
 *   1. Add to Attack (Precision Attack) — shown after an attack roll is made.
 *   2. Add to Damage — shown after a damage roll; lists applicable maneuvers.
 *
 * Styling: compact gold-tinted strip — gold = resources in the design system.
 */

import { useState } from "react";

import { useManeuverDie } from "@/features/session/useManeuverDie";
import type { Character, ManeuverEntry } from "@/types/character";
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

  const { pool, dieLabel, busy, spend } = useManeuverDie(character, onUpdate);
  const [spentFor, setSpentFor] = useState<string | null>(null);
  const [selectedDamageManeuver, setSelectedDamageManeuver] = useState("");

  // ── Derive maneuver lists ─────────────────────────────────────────────────

  const maneuversKnown = character.resources?.maneuversKnown ?? [];

  // Guard: only render when the character is a Battle Master with dice left.
  if (!pool || pool.total === 0 || pool.remaining === 0 || maneuversKnown.length === 0) {
    return null;
  }

  // Show only maneuvers that belong in the weapon row. Placement travels on the
  // known-maneuver entry (catalog snapshot); custom/legacy default to damageRoll.
  const attackRollManeuvers = maneuversKnown.filter(
    (m) => (m.placement ?? "damageRoll") === "attackRoll",
  );
  const damageRollManeuvers = maneuversKnown.filter(
    (m) => (m.placement ?? "damageRoll") === "damageRoll",
  );

  // Show sections only when the relevant roll has been made.
  const showAttackSection = lastAttackRoll !== null && attackRollManeuvers.length > 0;
  const showDamageSection = lastDamageRoll !== null && damageRollManeuvers.length > 0;

  if (!showAttackSection && !showDamageSection) {
    return null;
  }

  // Resolved current damage maneuver selection — fall back to first if state is stale.
  const activeDamageManeuver =
    damageRollManeuvers.some((m) => m.name === selectedDamageManeuver)
      ? selectedDamageManeuver
      : (damageRollManeuvers[0]?.name ?? "");

  // ── Spend handlers ────────────────────────────────────────────────────────

  async function handlePrecision(m: ManeuverEntry) {
    if (busy || !lastAttackRoll) return;
    const dieResult = await spend(m.id);
    setSpentFor(m.name);
    onRollsUpdated(lastAttackRoll.total + dieResult, null);
  }

  async function handleDamage(m: ManeuverEntry) {
    if (busy || !lastDamageRoll) return;
    const dieResult = await spend(m.id);
    setSpentFor(m.name);
    onRollsUpdated(null, lastDamageRoll.total + dieResult);
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5 rounded-control border border-gold-200 bg-gold-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gold-800">
        Superiority Die ({dieLabel}, {pool.remaining} left)
      </p>

      {/* ── Add to Attack ───────────────────────────────────────────────── */}
      {showAttackSection && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gold-800">Add to Attack:</span>
          {attackRollManeuvers.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={busy || spentFor === m.name}
              onClick={() => handlePrecision(m)}
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
          {damageRollManeuvers.length === 1 ? (
            <button
              type="button"
              disabled={busy || spentFor === damageRollManeuvers[0].name}
              onClick={() => handleDamage(damageRollManeuvers[0])}
              className="rounded-control border border-gold-300 bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {damageRollManeuvers[0].name} +{dieLabel}
            </button>
          ) : (
            <>
              <select
                value={activeDamageManeuver}
                onChange={(e) => setSelectedDamageManeuver(e.target.value)}
                disabled={busy}
                className="rounded-control border border-gold-300 bg-parchment-50 px-1.5 py-0.5 text-xs text-parchment-800 focus:outline-none focus:ring-1 focus:ring-gold-400"
                aria-label="Select maneuver to add to damage"
              >
                {damageRollManeuvers.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !activeDamageManeuver || spentFor === activeDamageManeuver}
                onClick={() => {
                  const m = damageRollManeuvers.find((d) => d.name === activeDamageManeuver);
                  if (m) void handleDamage(m);
                }}
                className="rounded-control border border-gold-300 bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Spend {dieLabel}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
