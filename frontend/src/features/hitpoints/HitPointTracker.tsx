import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GiBleedingWound, GiHealthPotion } from "react-icons/gi";
import type { IconType } from "react-icons";

import { applyHitPointOperations } from "@/api/client";
import { rollDie } from "@/lib/dice";
import { dieFaces } from "@/lib/hitDice";
import type { Character, ConcentrationCheck, HitPointOperation } from "@/types/character";
import Card from "@/components/ui/Card";
import MeterBar from "@/components/ui/MeterBar";
import ConcentrationSaveModal from "@/features/hitpoints/ConcentrationSaveModal";
import DeathSaveTracker from "@/features/hitpoints/DeathSaveTracker";
import LevelUpModal from "@/features/hitpoints/LevelUpModal";
import type { PendingConcentrationSave } from "@/features/hitpoints/ConcentrationSaveModal";
import { useAutoRollConcentrationPref } from "@/features/hitpoints/concentrationPreference";

interface HitPointTrackerProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

// ---- HP action control ----------------------------------------------------

type HpMode = "damage" | "heal" | "temp";

// Per-mode segment icon, verb, button tone, and field aria-label.
const HP_MODES: {
  mode: HpMode;
  label: string;
  icon: IconType | LucideIcon;
  verb: string;
  fieldLabel: string;
  buttonClass: string;
}[] = [
  {
    mode: "damage",
    label: "Damage",
    icon: GiBleedingWound,
    verb: "Apply damage",
    fieldLabel: "Damage amount",
    buttonClass: "bg-garnet-700 text-parchment-50 hover:bg-garnet-800",
  },
  {
    mode: "heal",
    label: "Heal",
    icon: GiHealthPotion,
    verb: "Heal",
    fieldLabel: "Heal amount",
    buttonClass: "bg-vitality-700 text-parchment-50 hover:bg-vitality-800",
  },
  {
    mode: "temp",
    label: "Temp HP",
    icon: Shield,
    verb: "Set temp HP",
    fieldLabel: "Temporary hit points",
    buttonClass: "bg-gold-400 text-ink hover:bg-gold-500",
  },
];

// ---- Main component -------------------------------------------------------

export default function HitPointTracker({ character, onUpdate }: HitPointTrackerProps) {
  const { hitPoints, hitDice, abilityScores, pendingLevelUps } = character;
  const availableDice = hitDice.total - hitDice.spent;
  const conMod = Math.floor((abilityScores.constitution - 10) / 2);

  // Form field values
  const [mode, setMode] = useState<HpMode>("damage");
  const [amount, setAmount] = useState("");
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
    const value = parseInt(amount, 10);
    if (!value || value <= 0) return;
    // When auto-roll is off (issue #76), the server defers the concentration
    // save and returns a pending check; the player rolls it via the 3D die.
    const ok = await submit([{ type: "damage", amount: value, autoRollConcentration }]);
    if (ok) setAmount("");
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
    const value = parseInt(amount, 10);
    if (!value || value <= 0) return;
    const ok = await submit([{ type: "heal", amount: value }]);
    if (ok) setAmount("");
  }

  async function handleSetTemp() {
    const value = parseInt(amount, 10);
    if (isNaN(value) || value < 0) return;
    const ok = await submit([{ type: "setTemp", amount: value }]);
    if (ok) setAmount("");
  }

  // Dispatch the active mode's submit handler.
  function handleApply() {
    if (mode === "damage") return handleDamage();
    if (mode === "heal") return handleHeal();
    return handleSetTemp();
  }

  // Step the shared amount by ±1, clamped at 0.
  function stepAmount(delta: number) {
    const next = Math.max(0, (parseInt(amount, 10) || 0) + delta);
    setAmount(String(next));
  }

  const activeMode = HP_MODES.find((m) => m.mode === mode)!;
  const ApplyIcon = activeMode.icon;
  // Temp HP accepts 0 (clears temp); damage/heal require a positive amount.
  const applyDisabled =
    pending || (mode === "temp" ? amount === "" : !amount || parseInt(amount, 10) <= 0);

  async function handleShortRest() {
    const n = parseInt(diceToSpend, 10);
    if (!n || n < 1 || n > availableDice) return;
    const faces = dieFaces(hitDice.die);
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
    const faces = dieFaces(hitDice.die);
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
          <DeathSaveTracker
            deathSaves={hitPoints.deathSaves}
            pending={pending}
            onRollDeathSave={handleDeathSaveRoll}
            onStabilize={handleStabilize}
          />
        )}

        {/* ── HP action control (segmented mode + stepper + verb) ── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Mode picker */}
          <div
            role="radiogroup"
            aria-label="Hit point action"
            className="inline-flex rounded-control bg-parchment-100 p-0.5"
          >
            {HP_MODES.map(({ mode: m, label, icon: SegIcon }) => {
              const active = m === mode;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={pending}
                  onClick={() => setMode(m)}
                  className={`inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                    active
                      ? "bg-parchment-50 text-parchment-900 shadow-card"
                      : "text-parchment-600 hover:text-parchment-900"
                  }`}
                >
                  <SegIcon aria-hidden="true" className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Stepper */}
          <div className="inline-flex items-center rounded-control border border-parchment-300 bg-parchment-50">
            <button
              type="button"
              disabled={pending}
              onClick={() => stepAmount(-1)}
              aria-label="Decrease amount"
              className="flex h-8 w-8 items-center justify-center rounded-control text-parchment-600 transition-colors hover:bg-parchment-100 disabled:opacity-50"
            >
              <Minus aria-hidden="true" className="h-4 w-4" />
            </button>
            <input
              type="number"
              min={0}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleApply()}
              placeholder="0"
              disabled={pending}
              aria-label={activeMode.fieldLabel}
              className="w-16 border-0 bg-transparent text-center text-lg tabular-nums text-parchment-900 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => stepAmount(1)}
              aria-label="Increase amount"
              className="flex h-8 w-8 items-center justify-center rounded-control text-parchment-600 transition-colors hover:bg-parchment-100 disabled:opacity-50"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          {/* Contextual primary action */}
          <button
            type="button"
            disabled={applyDisabled}
            onClick={handleApply}
            className={`inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-parchment-200 disabled:text-parchment-400 disabled:hover:bg-parchment-200 ${activeMode.buttonClass}`}
          >
            <ApplyIcon aria-hidden="true" className="h-4 w-4" />
            {activeMode.verb}
          </button>
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
          <div className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
            <span>Short rest — dice to spend</span>
            <div className="flex gap-2">
              <div className="inline-flex items-center rounded-control border border-parchment-300 bg-parchment-50">
                <button
                  type="button"
                  disabled={pending || availableDice === 0}
                  onClick={() =>
                    setDiceToSpend(String(Math.max(1, (parseInt(diceToSpend, 10) || 1) - 1)))
                  }
                  aria-label="Decrease dice to spend"
                  className="flex h-8 w-8 items-center justify-center rounded-control text-parchment-600 transition-colors hover:bg-parchment-100 disabled:opacity-50"
                >
                  <Minus aria-hidden="true" className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={availableDice}
                  step={1}
                  value={diceToSpend}
                  onChange={(e) => setDiceToSpend(e.target.value)}
                  disabled={pending || availableDice === 0}
                  aria-label="Dice to spend"
                  className="w-12 border-0 bg-transparent text-center text-lg tabular-nums text-parchment-900 disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={pending || availableDice === 0}
                  onClick={() =>
                    setDiceToSpend(
                      String(Math.min(availableDice, (parseInt(diceToSpend, 10) || 1) + 1)),
                    )
                  }
                  aria-label="Increase dice to spend"
                  className="flex h-8 w-8 items-center justify-center rounded-control text-parchment-600 transition-colors hover:bg-parchment-100 disabled:opacity-50"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                disabled={pending || availableDice === 0}
                onClick={handleShortRest}
                className="rounded-control bg-parchment-300 px-3 py-1.5 text-sm font-semibold text-parchment-800 transition-colors hover:bg-parchment-400 disabled:opacity-50"
              >
                Rest
              </button>
            </div>
          </div>

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
