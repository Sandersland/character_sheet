import { useState } from "react";

import { applyHitPointOperations } from "@/api/client";
import type { Character, ConcentrationCheck, HitPointOperation } from "@/types/character";
import type { HpMode } from "@/lib/hpAmount";
import type { PendingConcentrationSave } from "@/features/hitpoints/ConcentrationSaveModal";
import { useAutoRollConcentrationPref } from "@/features/hitpoints/concentrationPreference";
import { buildHpOps } from "@/lib/hitPointOps";

export interface ConcentrationNote {
  text: string;
  held: boolean;
}

/** Build the player-facing text for a resolved concentration check (issue #41). */
function concentrationMessage(check: ConcentrationCheck): ConcentrationNote {
  if (check.reason === "death") {
    return { text: `Lost concentration on ${check.spellName} (dropped to 0 HP)`, held: false };
  }
  const roll = `${check.total} vs DC ${check.dc}`;
  return check.held
    ? { text: `Concentration save: ${roll} — held ${check.spellName}`, held: true }
    : { text: `Concentration save: ${roll} — lost ${check.spellName}`, held: false };
}

/**
 * The shared HP-apply engine behind both surfaces (#768): submits op batches
 * through applyHitPointOperations, swaps the character, and surfaces the
 * concentration check identically (auto-roll banner vs deferred roll modal).
 * The Rest tab (HitPointTracker) and the session HP sheet both consume this, so
 * damage/heal/temp + concentration behave the same everywhere.
 */
export function useHitPointApply(character: Character, onUpdate: (character: Character) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [concentrationNote, setConcentrationNote] = useState<ConcentrationNote | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingConcentrationSave | null>(null);

  // Only spellcasters can concentrate, so the toggle is only shown for them.
  const isSpellcaster = character.spellcasting !== undefined;
  const [autoRollConcentration, setAutoRollConcentration] = useAutoRollConcentrationPref();

  /**
   * Submit a batch of operations, returns true on success. `silentConcentration`
   * skips the inline banner/modal handling — used when the save modal is already
   * showing the result itself (issue #76).
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
        const last = concentrationChecks.at(-1);
        if (last?.status === "pending") {
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
    const ops = buildHpOps(mode, value, { ...damage, autoRollConcentration });
    if (!ops) return false;
    return submit(ops);
  }

  // The save die settled in the modal — persist it with the natural d20 (issue #76).
  async function resolveConcentrationSave(roll: number) {
    if (!pendingSave) return;
    await submit(
      [{ type: "concentrationSave", entryId: pendingSave.entryId, roll, damage: pendingSave.damage }],
      { silentConcentration: true },
    );
  }

  return {
    pending,
    error,
    concentrationNote,
    pendingSave,
    setPendingSave,
    isSpellcaster,
    autoRollConcentration,
    setAutoRollConcentration,
    submit,
    handleApply,
    resolveConcentrationSave,
  };
}
