/**
 * Quivering Palm (SRD 5.2, Monk L17) — pure roll-spec helper for the Trigger
 * step (#1245). The 10d12 Force damage is the monk's OWN supernatural effect
 * (like Second Wind/Deflect Attacks' redirect, see deflectAttacks.ts), so it's
 * rolled client-side and sent as the total; the server only supplies the Con
 * save outcome (full/half) via triggerQuiveringPalmTransaction.
 */

import type { RollSpec } from "@/lib/dice";

export function quiveringPalmDamageRoll(): RollSpec {
  return { count: 10, faces: 12 };
}
