// SRD 5.2 Monk L17 Quivering Palm: the 10d12 Force is the monk's own effect, like formatDeflectAttacksRedirectMessage's redirect — rolled client-side and sent as the total; the server only supplies the Con save outcome via triggerQuiveringPalmTransaction.
import type { RollSpec } from "@/lib/dice";

export function quiveringPalmDamageRoll(): RollSpec {
  return { count: 10, faces: 12 };
}
