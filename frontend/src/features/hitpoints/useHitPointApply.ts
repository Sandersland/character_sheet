import { useState } from "react";

import { applyHitPointOperations } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character, ConcentrationCheck, HitPointOperation } from "@/types/character";
import type { HpMode } from "@/lib/hpAmount";
import type { PendingConcentrationSave } from "@/features/hitpoints/ConcentrationSaveModal";
import { useAutoRollConcentrationPref } from "@/features/hitpoints/concentrationPreference";
import { buildHpOps } from "@/lib/hitPointOps";

export interface ConcentrationNote {
  text: string;
  held: boolean;
}

function concentrationMessage(check: ConcentrationCheck): ConcentrationNote {
  if (check.reason === "death") {
    return { text: `Lost concentration on ${check.spellName} (dropped to 0 HP)`, held: false };
  }
  const roll = `${check.total} vs DC ${check.dc}`;
  return check.held
    ? { text: `Concentration save: ${roll} — held ${check.spellName}`, held: true }
    : { text: `Concentration save: ${roll} — lost ${check.spellName}`, held: false };
}

export function useHitPointApply(character: Character) {
  const [concentrationNote, setConcentrationNote] = useState<ConcentrationNote | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingConcentrationSave | null>(null);

  const [autoRollConcentration] = useAutoRollConcentrationPref();

  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (ops: HitPointOperation[]) => applyHitPointOperations(character.id, ops),
    toCharacter: (r) => r.character,
    fallbackMessage: "Something went wrong — try again",
  });

  async function submit(
    ops: HitPointOperation[],
    opts: { silentConcentration?: boolean } = {},
  ): Promise<boolean> {
    try {
      const { concentrationChecks } = await mutation.mutateAsync(ops);
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
    } catch {
      return false;
    }
  }

  async function handleApply(
    mode: HpMode,
    value: number,
    damage?: { damageType?: string; applyResistance?: boolean },
  ): Promise<boolean> {
    const ops = buildHpOps(mode, value, { ...damage, autoRollConcentration });
    if (!ops) return false;
    return submit(ops);
  }

  async function resolveConcentrationSave(roll: number) {
    if (!pendingSave) return;
    await submit(
      [{ type: "concentrationSave", entryId: pendingSave.entryId, roll, damage: pendingSave.damage }],
      { silentConcentration: true },
    );
  }

  return {
    pending: mutation.isPending,
    error: mutation.error,
    concentrationNote,
    pendingSave,
    setPendingSave,
    submit,
    handleApply,
    resolveConcentrationSave,
  };
}
