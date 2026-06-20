import { useState } from "react";

import { applyHitPointOperations } from "../api/client";
import { rollDie } from "../lib/dice";
import type { Character, HitPointOperation } from "../types/character";
import Card from "./Card";
import MeterBar from "./MeterBar";
import Modal from "./Modal";

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
      <span className="w-20 text-xs text-[var(--color-parchment-600)]">{label}:</span>
      <div className="flex gap-1.5">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            aria-hidden="true"
            className={`h-4 w-4 rounded-full border ${
              i < count
                ? tone === "success"
                  ? "border-[var(--color-arcane-600)] bg-[var(--color-arcane-500)]"
                  : "border-[var(--color-garnet-700)] bg-[var(--color-garnet-600)]"
                : "border-[var(--color-parchment-400)] bg-[var(--color-parchment-100)]"
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
        <p className="text-sm text-[var(--color-parchment-700)]">
          Choose how to gain hit points for this level ({hitDie} {conLabel} Con):
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm("average")}
            className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-parchment-300)] bg-[var(--color-parchment-50)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-parchment-100)] disabled:opacity-50"
          >
            <div>
              <p className="font-semibold text-[var(--color-parchment-900)]">Take average</p>
              <p className="text-xs text-[var(--color-parchment-500)]">
                Predictable — {Math.floor(faces / 2) + 1} ({conLabel} Con)
              </p>
            </div>
            <span className="font-display text-2xl font-semibold text-[var(--color-arcane-800)]">
              +{averageGain}
            </span>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm("roll")}
            className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-parchment-300)] bg-[var(--color-parchment-50)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-parchment-100)] disabled:opacity-50"
          >
            <div>
              <p className="font-semibold text-[var(--color-parchment-900)]">Roll {hitDie}</p>
              <p className="text-xs text-[var(--color-parchment-500)]">
                Luck-based — {conLabel} Con applied
              </p>
            </div>
            <span className="text-sm text-[var(--color-parchment-500)]">
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

  const isDying = hitPoints.current === 0;

  /** Submit a batch of operations, returns true on success. */
  async function submit(ops: HitPointOperation[]): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const updated = await applyHitPointOperations(character.id, ops);
      onUpdate(updated);
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
    const ok = await submit([{ type: "damage", amount }]);
    if (ok) setDamageValue("");
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
  }

  return (
    <Card title="Hit Points">
      <div className="flex flex-col gap-4 p-4">
        {/* ── HP display ── */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <p className="font-display text-xl font-semibold leading-none text-[var(--color-garnet-800)]">
              {hitPoints.current}
              <span className="text-sm font-normal text-[var(--color-parchment-500)]">
                {" "}
                / {hitPoints.max}
                {hitPoints.temp > 0 && (
                  <span className="text-[var(--color-gold-700)]"> (+{hitPoints.temp} temp)</span>
                )}
              </span>
            </p>
            <span className="text-xs text-[var(--color-parchment-500)]">
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
          <div className="rounded-[var(--radius-card)] border border-[var(--color-garnet-300)] bg-[var(--color-garnet-50)] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-garnet-800)]">
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
                  className="rounded-[var(--radius-control)] bg-[var(--color-garnet-700)] px-3 py-1.5 text-sm font-semibold text-[var(--color-parchment-50)] transition-colors hover:bg-[var(--color-garnet-800)] disabled:opacity-50"
                >
                  Roll death save (d20)
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleStabilize}
                  className="text-sm font-semibold text-[var(--color-garnet-700)] hover:underline disabled:opacity-50"
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
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-parchment-500)]">
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
                className="w-20 rounded-[var(--radius-control)] border border-[var(--color-parchment-300)] bg-[var(--color-parchment-50)] px-2 py-1 text-sm tabular-nums text-[var(--color-parchment-900)] disabled:opacity-50"
              />
              <button
                type="button"
                disabled={pending || !damageValue}
                onClick={handleDamage}
                className="rounded-[var(--radius-control)] bg-[var(--color-garnet-700)] px-3 py-1.5 text-sm font-semibold text-[var(--color-parchment-50)] transition-colors hover:bg-[var(--color-garnet-800)] disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </label>

          {/* Heal */}
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-parchment-500)]">
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
                className="w-20 rounded-[var(--radius-control)] border border-[var(--color-parchment-300)] bg-[var(--color-parchment-50)] px-2 py-1 text-sm tabular-nums text-[var(--color-parchment-900)] disabled:opacity-50"
              />
              <button
                type="button"
                disabled={pending || !healValue}
                onClick={handleHeal}
                className="rounded-[var(--radius-control)] bg-[var(--color-arcane-700)] px-3 py-1.5 text-sm font-semibold text-[var(--color-parchment-50)] transition-colors hover:bg-[var(--color-arcane-800)] disabled:opacity-50"
              >
                Heal
              </button>
            </div>
          </label>

          {/* Temporary HP */}
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-parchment-500)]">
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
                className="w-20 rounded-[var(--radius-control)] border border-[var(--color-parchment-300)] bg-[var(--color-parchment-50)] px-2 py-1 text-sm tabular-nums text-[var(--color-parchment-900)] disabled:opacity-50"
              />
              <button
                type="button"
                disabled={pending || !tempValue}
                onClick={handleSetTemp}
                className="rounded-[var(--radius-control)] bg-[var(--color-gold-700)] px-3 py-1.5 text-sm font-semibold text-[var(--color-parchment-50)] transition-colors hover:bg-[var(--color-gold-800)] disabled:opacity-50"
              >
                Set
              </button>
            </div>
          </label>
        </div>

        {/* ── Rest controls ── */}
        <div className="flex flex-wrap items-end gap-3 border-t border-[var(--color-parchment-200)] pt-3">
          {/* Short rest */}
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-parchment-500)]">
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
                className="w-16 rounded-[var(--radius-control)] border border-[var(--color-parchment-300)] bg-[var(--color-parchment-50)] px-2 py-1 text-sm tabular-nums text-[var(--color-parchment-900)] disabled:opacity-50"
              />
              <button
                type="button"
                disabled={pending || availableDice === 0}
                onClick={handleShortRest}
                className="rounded-[var(--radius-control)] bg-[var(--color-parchment-300)] px-3 py-1.5 text-sm font-semibold text-[var(--color-parchment-800)] transition-colors hover:bg-[var(--color-parchment-400)] disabled:opacity-50"
              >
                Rest
              </button>
            </div>
          </label>

          {/* Long rest */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-parchment-500)]">
              Long rest
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={handleLongRest}
              className="rounded-[var(--radius-control)] bg-[var(--color-arcane-100)] px-3 py-1.5 text-sm font-semibold text-[var(--color-arcane-800)] transition-colors hover:bg-[var(--color-arcane-200)] disabled:opacity-50"
            >
              Full rest
            </button>
          </div>
        </div>

        {/* ── Level-up affordance ── */}
        {pendingLevelUps > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--color-gold-300)] bg-[var(--color-gold-50)] px-3 py-2">
            <span className="text-sm font-semibold text-[var(--color-gold-800)]">
              {pendingLevelUps === 1
                ? "Level up available!"
                : `${pendingLevelUps} level-ups available!`}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => setLevelUpOpen(true)}
              className="rounded-[var(--radius-control)] bg-[var(--color-gold-700)] px-3 py-1.5 text-sm font-semibold text-[var(--color-parchment-50)] transition-colors hover:bg-[var(--color-gold-800)] disabled:opacity-50"
            >
              Level up
            </button>
          </div>
        )}

        {/* Error display */}
        {error && (
          <p className="text-xs font-semibold text-[var(--color-garnet-700)]">{error}</p>
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
    </Card>
  );
}
