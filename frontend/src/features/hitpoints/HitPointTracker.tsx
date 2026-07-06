import { useEffect, useRef, useState } from "react";

import { applyHitPointOperations } from "@/api/client";
import { rollDie } from "@/lib/dice";
import { dieFaces } from "@/lib/hitDice";
import { activeResistedDamageTypes } from "@/lib/damageTypes";
import type {
  Character,
  ClassOption,
  ConcentrationCheck,
  HitPointOperation,
  LevelUpTarget,
} from "@/types/character";
import Card from "@/components/ui/Card";
import AdvancementCallout from "@/features/hitpoints/AdvancementCallout";
import ConcentrationSaveModal from "@/features/hitpoints/ConcentrationSaveModal";
import DeathSaveTracker from "@/features/hitpoints/DeathSaveTracker";
import LevelUpCallout from "@/features/hitpoints/LevelUpCallout";
import HpActionControl from "@/features/hitpoints/HpActionControl";
import HpMeter from "@/features/hitpoints/HpMeter";
import type { HpMode } from "@/features/hitpoints/HpActionControl";
import LevelUpModal from "@/features/hitpoints/LevelUpModal";
import RestControls from "@/features/hitpoints/RestControls";
import type { PendingConcentrationSave } from "@/features/hitpoints/ConcentrationSaveModal";
import { useAutoRollConcentrationPref } from "@/features/hitpoints/concentrationPreference";

interface HitPointTrackerProps {
  character: Character;
  /** Reference class list (for the level-up new-class picker); defaults to none. */
  referenceClasses?: ClassOption[];
  onUpdate: (character: Character) => void;
}

export default function HitPointTracker({
  character,
  referenceClasses = [],
  onUpdate,
}: HitPointTrackerProps) {
  const { hitPoints, hitDice, abilityScores, pendingLevelUps } = character;
  const availableDice = hitDice.total - hitDice.spent;
  const conMod = Math.floor((abilityScores.constitution - 10) / 2);

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

  // Apply the active HP mode; returns true on success so the child clears its field.
  async function handleApply(
    mode: HpMode,
    value: number,
    damage?: { damageType?: string; applyResistance?: boolean },
  ): Promise<boolean> {
    if (mode === "damage") {
      if (!value || value <= 0) return false;
      // When auto-roll is off (issue #76), the server defers the concentration
      // save and returns a pending check; the player rolls it via the 3D die.
      // damageType + applyResistance (#456) drive server-side resistance halving.
      return submit([
        {
          type: "damage",
          amount: value,
          damageType: damage?.damageType,
          applyResistance: damage?.applyResistance,
          autoRollConcentration,
        },
      ]);
    }
    if (mode === "heal") {
      if (!value || value <= 0) return false;
      return submit([{ type: "heal", amount: value }]);
    }
    if (isNaN(value) || value < 0) return false;
    return submit([{ type: "setTemp", amount: value }]);
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

  async function handleShortRest(n: number) {
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

  async function handleLevelUp(method: "average" | "roll", target: LevelUpTarget | undefined) {
    // Roll bounds follow the ADVANCING class's hit die, which may differ from the
    // primary (position-0) die once multiclassing is in play.
    const advancingName =
      target?.kind === "new"
        ? referenceClasses.find((c) => c.id === target.classId)?.name
        : character.classes?.find((e) => e.id === target?.classEntryId)?.name;
    const advancingDie =
      referenceClasses.find((c) => c.name === advancingName)?.hitDie ?? hitDice.die;
    const roll = method === "roll" ? rollDie(dieFaces(advancingDie)) : undefined;
    const ok = await submit([{ type: "levelUp", method, roll, target }]);
    if (ok) setLevelUpOpen(false);
    // Advancement callout is triggered by the useEffect watching advancementSlots.total.
  }

  return (
    <Card title="Hit Points">
      <div className="flex flex-col gap-4 p-4">
        {/* ── HP display ── */}
        <HpMeter
          current={hitPoints.current}
          max={hitPoints.max}
          temp={hitPoints.temp}
          availableDice={availableDice}
          hitDiceTotal={hitDice.total}
          die={hitDice.die}
        />

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
        <HpActionControl
          pending={pending}
          onApply={handleApply}
          resistedTypes={[...activeResistedDamageTypes(character.activeEffects?.buffs ?? [])]}
        />

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
        <RestControls
          availableDice={availableDice}
          pending={pending}
          onShortRest={handleShortRest}
          onLongRest={handleLongRest}
        />

        {/* ── Level-up affordance ── */}
        {pendingLevelUps > 0 && (
          <LevelUpCallout
            pendingLevelUps={pendingLevelUps}
            pending={pending}
            onLevelUp={() => setLevelUpOpen(true)}
          />
        )}

        {/* ── Advancement slot unlocked callout ── */}
        {advancementCallout && (
          <AdvancementCallout
            onGoToAdvancements={() => {
              setAdvancementCallout(false);
              document.getElementById("advancement-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
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
          character={character}
          referenceClasses={referenceClasses}
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
