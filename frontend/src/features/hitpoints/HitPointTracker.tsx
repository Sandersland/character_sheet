import { useEffect, useRef, useState } from "react";

import { applyHitPointOperations } from "@/api/client";
import { rollDie } from "@/lib/dice";
import type { Character, ConcentrationCheck, HitPointOperation } from "@/types/character";
import Card from "@/components/ui/Card";
import MeterBar from "@/components/ui/MeterBar";
import Modal from "@/components/ui/Modal";
import ConcentrationSaveModal from "@/features/hitpoints/ConcentrationSaveModal";
import type { PendingConcentrationSave } from "@/features/hitpoints/ConcentrationSaveModal";
import { useAutoRollConcentrationPref } from "@/features/hitpoints/concentrationPreference";

interface HitPointTrackerProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

// ---- Sub-components -------------------------------------------------------

function DeathSavePips({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "success" | "failure";
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-xs text-parchment-600">{label}:</span>
      <div className="flex gap-1.5">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            aria-hidden="true"
            className={`h-4 w-4 rounded-full border ${
              i < count
                ? tone === "success"
                  ? "border-arcane-600 bg-arcane-500"
                  : "border-garnet-700 bg-garnet-600"
                : "border-parchment-400 bg-parchment-100"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function LevelUpModal({
  hitDie,
  conMod,
  pending,
  onConfirm,
  onClose,
}: {
  hitDie: string;
  conMod: number;
  pending: boolean;
  onConfirm: (method: "average" | "roll") => void;
  onClose: () => void;
}) {
  const faces = Number(hitDie.replace(/^d/i, ""));
  // Fixed average per 5e PHB: floor(faces/2) + 1; then add Con modifier and clamp at 1.
  const averageGain = Math.max(1, Math.floor(faces / 2) + 1 + conMod);
  const minRoll = Math.max(1, 1 + conMod);
  const maxRoll = Math.max(1, faces + conMod);
  const conLabel = conMod >= 0 ? `+${conMod}` : String(conMod);

  return (
    <Modal title="Level Up" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-parchment-700">
          Choose how to gain hit points for this level ({hitDie} {conLabel} Con):
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm("average")}
            className="flex items-center justify-between rounded-card border border-parchment-300 bg-parchment-50 px-4 py-3 text-left transition-colors hover:bg-parchment-100 disabled:opacity-50"
          >
            <div>
              <p className="font-semibold text-parchment-900">Take average</p>
              <p className="text-xs text-parchment-600">
                Predictable — {Math.floor(faces / 2) + 1} ({conLabel} Con)
              </p>
            </div>
            <span className="font-display text-2xl font-semibold text-arcane-800">
              +{averageGain}
            </span>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm("roll")}
            className="flex items-center justify-between rounded-card border border-parchment-300 bg-parchment-50 px-4 py-3 text-left transition-colors hover:bg-parchment-100 disabled:opacity-50"
          >
            <div>
              <p className="font-semibold text-parchment-900">Roll {hitDie}</p>
              <p className="text-xs text-parchment-600">
                Luck-based — {conLabel} Con applied
              </p>
            </div>
            <span className="text-sm text-parchment-600">
              {minRoll}–{maxRoll} HP
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---- Main component -------------------------------------------------------

export default function HitPointTracker({ character, onUpdate }: HitPointTrackerProps) {
  const { hitPoints, hitDice, abilityScores, pendingLevelUps } = character;
  const availableDice = hitDice.total - hitDice.spent;
  const conMod = Math.floor((abilityScores.constitution - 10) / 2);

  // Form field values
  const [damageValue, setDamageValue] = useState("");
  const [healValue, setHealValue] = useState("");
  const [tempValue, setTempValue] = useState("");
  const [diceToSpend, setDiceToSpend] = useState("1");

  // Modal / pending state
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advancementCallout, setAdvancementCallout] = useState(false);
  // Transient banner for a resolved concentration save (issue #41).
  const [concentrationNote, setConcentrationNote] = useState<{
    text: string;
    held: boolean;
  } | null>(null);
  // A deferred manual concentration save awaiting the player's roll (issue #76),
  // surfaced in a modal. Only one is tracked at a time — a fresh qualifying
  // damage overwrites it.
  const [pendingSave, setPendingSave] = useState<PendingConcentrationSave | null>(null);

  // "Auto-roll concentration saves" preference (issue #76). Only spellcasters
  // can concentrate, so the toggle is only shown for them.
  const isSpellcaster = character.spellcasting !== undefined;
  const [autoRollConcentration, setAutoRollConcentration] = useAutoRollConcentrationPref();

  // Detect when a level-up unlocks a new advancement slot.
  const prevAdvancementTotal = useRef(character.advancementSlots.total);
  useEffect(() => {
    const newTotal = character.advancementSlots.total;
    if (newTotal > prevAdvancementTotal.current) {
      setAdvancementCallout(true);
    }
    prevAdvancementTotal.current = newTotal;
  }, [character.advancementSlots.total]);

  const isDying = hitPoints.current === 0;

  /** Build the player-facing text for a concentration check (issue #41). */
  function concentrationMessage(check: ConcentrationCheck): { text: string; held: boolean } {
    if (check.reason === "death") {
      return { text: `Lost concentration on ${check.spellName} (dropped to 0 HP)`, held: false };
    }
    const roll = `${check.total} vs DC ${check.dc}`;
    return check.held
      ? { text: `Concentration save: ${roll} — held ${check.spellName}`, held: true }
      : { text: `Concentration save: ${roll} — lost ${check.spellName}`, held: false };
  }

  /**
   * Submit a batch of operations, returns true on success.
   * `silentConcentration` skips the inline banner/modal handling — used when the
   * concentration-save modal is already showing the result itself (issue #76).
   */
  async function submit(
    ops: HitPointOperation[],
    opts: { silentConcentration?: boolean } = {},
  ): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const { character: updated, concentrationChecks } = await applyHitPointOperations(
        character.id,
        ops,
      );
      onUpdate(updated);
      if (!opts.silentConcentration) {
        // Surface the most recent concentration check (single damage op per
        // submit in practice; if a batch produced several, show the last).
        const last = concentrationChecks.at(-1);
        if (last?.status === "pending") {
          // Manual path (issue #76): a save is deferred — open the roll modal.
          setPendingSave({
            entryId: last.entryId,
            spellName: last.spellName,
            dc: last.dc ?? 0,
            saveBonus: last.saveBonus ?? 0,
            damage: last.damage,
          });
          setConcentrationNote(null);
        } else {
          setConcentrationNote(last ? concentrationMessage(last) : null);
          setPendingSave(null);
        }
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function handleDamage() {
    const amount = parseInt(damageValue, 10);
    if (!amount || amount <= 0) return;
    // When auto-roll is off (issue #76), the server defers the concentration
    // save and returns a pending check; the player rolls it via the 3D die.
    const ok = await submit([{ type: "damage", amount, autoRollConcentration }]);
    if (ok) setDamageValue("");
  }

  /**
   * The save die settled in the modal — persist it with the natural d20 (issue
   * #76). Silent: the modal shows the result, so no inline banner is set.
   */
  async function resolveConcentrationSave(roll: number) {
    if (!pendingSave) return;
    await submit(
      [
        {
          type: "concentrationSave",
          entryId: pendingSave.entryId,
          roll,
          damage: pendingSave.damage,
        },
      ],
      { silentConcentration: true },
    );
  }

  async function handleHeal() {
    const amount = parseInt(healValue, 10);
    if (!amount || amount <= 0) return;
    const ok = await submit([{ type: "heal", amount }]);
    if (ok) setHealValue("");
  }

  async function handleSetTemp() {
    const amount = parseInt(tempValue, 10);
    if (isNaN(amount) || amount < 0) return;
    const ok = await submit([{ type: "setTemp", amount }]);
    if (ok) setTempValue("");
  }

  async function handleShortRest() {
    const n = parseInt(diceToSpend, 10);
    if (!n || n < 1 || n > availableDice) return;
    const faces = Number(hitDice.die.replace(/^d/i, ""));
    const rolls = Array.from({ length: n }, () => rollDie(faces));
    await submit([{ type: "shortRest", rolls }]);
  }

  async function handleLongRest() {
    await submit([{ type: "longRest" }]);
  }

  async function handleDeathSaveRoll() {
    const roll = rollDie(20);
    await submit([{ type: "deathSave", roll }]);
  }

  async function handleStabilize() {
    await submit([{ type: "stabilize" }]);
  }

  async function handleLevelUp(method: "average" | "roll") {
    const faces = Number(hitDice.die.replace(/^d/i, ""));
    const roll = method === "roll" ? rollDie(faces) : undefined;
    const ok = await submit([{ type: "levelUp", method, roll }]);
    if (ok) setLevelUpOpen(false);
    // Advancement callout is triggered by the useEffect watching advancementSlots.total.
  }

  return (
    <Card title="Hit Points">
      <div className="flex flex-col gap-4 p-4">
        {/* ── HP display ── */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <p className="font-display text-xl font-semibold leading-none text-garnet-800">
              {hitPoints.current}
              <span className="text-sm font-normal text-parchment-600">
                {" "}
                / {hitPoints.max}
                {hitPoints.temp > 0 && (
                  <span className="text-gold-800"> (+{hitPoints.temp} temp)</span>
                )}
              </span>
            </p>
            <span className="text-xs text-parchment-600">
              {availableDice}/{hitDice.total}
              {hitDice.die} available
            </span>
          </div>
          <MeterBar
            current={hitPoints.current}
            max={hitPoints.max}
            tone="garnet"
            label={`${hitPoints.current} of ${hitPoints.max} hit points`}
          />
        </div>

        {/* ── Death save tracker (shown at 0 HP) ── */}
        {isDying && (
          <div className="rounded-card border border-garnet-300 bg-garnet-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-garnet-800">
              {hitPoints.deathSaves.failures >= 3
                ? "Character Dead"
                : hitPoints.deathSaves.successes === 0 && hitPoints.deathSaves.failures === 0 && !pending
                  ? "Unconscious — Roll Death Saves"
                  : "Death Saves"}
            </p>
            <div className="flex flex-col gap-1.5">
              <DeathSavePips
                label="Successes"
                count={hitPoints.deathSaves.successes}
                tone="success"
              />
              <DeathSavePips
                label="Failures"
                count={hitPoints.deathSaves.failures}
                tone="failure"
              />
            </div>
            {hitPoints.deathSaves.failures < 3 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleDeathSaveRoll}
                  className="rounded-control bg-garnet-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:cursor-not-allowed disabled:bg-parchment-200 disabled:text-parchment-400 disabled:hover:bg-parchment-200"
                >
                  Roll death save (d20)
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleStabilize}
                  className="text-sm font-semibold text-garnet-700 hover:underline disabled:opacity-50"
                >
                  Stabilize
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Damage / Heal / Temp HP controls ── */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Damage */}
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
            Damage
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                step={1}
                value={damageValue}
                onChange={(e) => setDamageValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleDamage()}
                placeholder="0"
                disabled={pending}
                className="w-20 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-sm tabular-nums text-parchment-900 disabled:opacity-50"
              />
              <button
                type="button"
                disabled={pending || !damageValue}
                onClick={handleDamage}
                className="rounded-control bg-garnet-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:cursor-not-allowed disabled:bg-parchment-200 disabled:text-parchment-400 disabled:hover:bg-parchment-200"
              >
                Apply
              </button>
            </div>
          </label>

          {/* Heal */}
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
            Heal
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                step={1}
                value={healValue}
                onChange={(e) => setHealValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleHeal()}
                placeholder="0"
                disabled={pending}
                className="w-20 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-sm tabular-nums text-parchment-900 disabled:opacity-50"
              />
              <button
                type="button"
                disabled={pending || !healValue}
                onClick={handleHeal}
                className="rounded-control bg-arcane-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-arcane-800 disabled:cursor-not-allowed disabled:bg-parchment-200 disabled:text-parchment-400 disabled:hover:bg-parchment-200"
              >
                Heal
              </button>
            </div>
          </label>

          {/* Temporary HP */}
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
            Temp HP
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step={1}
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSetTemp()}
                placeholder="0"
                disabled={pending}
                className="w-20 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-sm tabular-nums text-parchment-900 disabled:opacity-50"
              />
              <button
                type="button"
                disabled={pending || !tempValue}
                onClick={handleSetTemp}
                className="rounded-control bg-gold-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-gold-800 disabled:cursor-not-allowed disabled:bg-parchment-200 disabled:text-parchment-400 disabled:hover:bg-parchment-200"
              >
                Set
              </button>
            </div>
          </label>
        </div>

        {/* ── Concentration save preference (spellcasters only, issue #76) ── */}
        {isSpellcaster && (
          <label className="flex items-center gap-2 text-xs text-parchment-600">
            <input
              type="checkbox"
              checked={autoRollConcentration}
              onChange={(e) => setAutoRollConcentration(e.target.checked)}
              disabled={pending}
              className="h-3.5 w-3.5 rounded border-parchment-400 text-arcane-700 focus:ring-arcane-600"
            />
            Auto-roll concentration saves
          </label>
        )}

        {/* ── Rest controls ── */}
        <div className="flex flex-wrap items-end gap-3 border-t border-parchment-200 pt-3">
          {/* Short rest */}
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
            Short rest — dice to spend
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                max={availableDice}
                step={1}
                value={diceToSpend}
                onChange={(e) => setDiceToSpend(e.target.value)}
                disabled={pending || availableDice === 0}
                className="w-16 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-sm tabular-nums text-parchment-900 disabled:opacity-50"
              />
              <button
                type="button"
                disabled={pending || availableDice === 0}
                onClick={handleShortRest}
                className="rounded-control bg-parchment-300 px-3 py-1.5 text-sm font-semibold text-parchment-800 transition-colors hover:bg-parchment-400 disabled:opacity-50"
              >
                Rest
              </button>
            </div>
          </label>

          {/* Long rest */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
              Long rest
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={handleLongRest}
              className="rounded-control bg-arcane-100 px-3 py-1.5 text-sm font-semibold text-arcane-800 transition-colors hover:bg-arcane-200 disabled:opacity-50"
            >
              Full rest
            </button>
          </div>
        </div>

        {/* ── Level-up affordance ── */}
        {pendingLevelUps > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-card border border-gold-300 bg-gold-50 px-3 py-2">
            <span className="text-sm font-semibold text-gold-800">
              {pendingLevelUps === 1
                ? "Level up available!"
                : `${pendingLevelUps} level-ups available!`}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => setLevelUpOpen(true)}
              className="rounded-control bg-gold-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-gold-800 disabled:cursor-not-allowed disabled:bg-parchment-200 disabled:text-parchment-400 disabled:hover:bg-parchment-200"
            >
              Level up
            </button>
          </div>
        )}

        {/* ── Advancement slot unlocked callout ── */}
        {advancementCallout && (
          <div className="flex items-center justify-between gap-3 rounded-card border border-arcane-300 bg-arcane-50 px-3 py-2">
            <span className="text-sm font-semibold text-arcane-800">
              New advancement slot! Choose an ASI or feat.
            </span>
            <button
              type="button"
              onClick={() => {
                setAdvancementCallout(false);
                document.getElementById("advancement-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="rounded-control bg-arcane-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-arcane-800"
            >
              Go to Advancements
            </button>
          </div>
        )}

        {/* Concentration save result (issue #41, auto-roll path) */}
        {concentrationNote && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-card border px-3 py-2 text-sm font-semibold ${
              concentrationNote.held
                ? "border-arcane-300 bg-arcane-50 text-arcane-800"
                : "border-garnet-300 bg-garnet-50 text-garnet-800"
            }`}
          >
            {concentrationNote.text}
          </div>
        )}

        {/* Error display */}
        {error && (
          <p className="text-xs font-semibold text-garnet-700">{error}</p>
        )}
      </div>

      {/* Level-up modal */}
      {levelUpOpen && (
        <LevelUpModal
          hitDie={hitDice.die}
          conMod={conMod}
          pending={pending}
          onConfirm={handleLevelUp}
          onClose={() => setLevelUpOpen(false)}
        />
      )}

      {/* Manual concentration-save modal (issue #76) */}
      {pendingSave && (
        <ConcentrationSaveModal
          save={pendingSave}
          onResolve={resolveConcentrationSave}
          onClose={() => setPendingSave(null)}
        />
      )}
    </Card>
  );
}
