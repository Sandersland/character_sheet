// Pure per-mode HP op builder — keeps handleApply's branching out of the hook.

import type { HitPointOperation } from "@/types/character";
import type { HpMode } from "@/features/hitpoints/HpActionControl";

export interface HpApplyMeta {
  damageType?: string;
  applyResistance?: boolean;
  autoRollConcentration?: boolean;
}

/** Build the op batch for an HP apply; null = invalid amount, caller no-ops. */
export function buildHpOps(
  mode: HpMode,
  amount: number,
  meta: HpApplyMeta = {},
): HitPointOperation[] | null {
  if (mode === "damage") {
    if (!amount || amount <= 0) return null;
    return [
      {
        type: "damage",
        amount,
        damageType: meta.damageType,
        applyResistance: meta.applyResistance,
        autoRollConcentration: meta.autoRollConcentration,
      },
    ];
  }
  if (mode === "heal") {
    if (!amount || amount <= 0) return null;
    return [{ type: "heal", amount }];
  }
  // Temp HP accepts 0 (clears temp) but rejects negatives / non-numbers.
  if (isNaN(amount) || amount < 0) return null;
  return [{ type: "setTemp", amount }];
}
