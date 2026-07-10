// Rest-triggered recharge of activated-item uses. Lives outside lib/inventory.ts
// so the rest handler (lib/hitpoints.ts) can import it without creating a cycle
// (inventory.ts imports applyHealInTx from hitpoints.ts for consumable healing).
import type { Prisma } from "@/generated/prisma/client.js";
import {
  activatedRechargeRest,
  readCapability,
  type ActivatedEffectCapability,
} from "./capabilities.js";
import { logEvent } from "./events.js";

// Resets activatedUsesSpent to 0 for items whose activatedEffect recharges on the
// given rest (#543). perRest(short) recharges on short|long; everything else on
// long only. The seeded buff is cleared separately by the rest's buff sweep.
// Called from the HP rest handler so item uses recharge alongside class resources.
export async function resetActivatedUsesForRestInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  restType: "short" | "long",
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const items = await tx.inventoryItem.findMany({
    where: { characterId, activatedUsesSpent: { gt: 0 } },
    include: { capabilities: true },
  });
  const toReset: { id: string; name: string; previousSpent: number }[] = [];
  for (const item of items) {
    // Type-predicate filter (not a bare cast): an opaque row with kind="activatedEffect"
    // but no activation must not slip through as a malformed ActivatedEffectCapability
    // — activatedRechargeRest would read resourceKind=undefined and spuriously recharge.
    const cap = item.capabilities
      .map(readCapability)
      .find((c): c is ActivatedEffectCapability => c.kind === "activatedEffect" && "activation" in c);
    if (!cap) continue;
    const recharge = activatedRechargeRest(cap);
    if (recharge === null) continue;
    if (restType === "long" || recharge === "short") {
      toReset.push({ id: item.id, name: item.name, previousSpent: item.activatedUsesSpent });
    }
  }
  if (toReset.length === 0) return;

  await tx.inventoryItem.updateMany({
    where: { id: { in: toReset.map((t) => t.id) } },
    data: { activatedUsesSpent: 0 },
  });
  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "activatedRecharged",
    summary: `Recharged ${toReset.length} item${toReset.length !== 1 ? "s" : ""} (${restType} rest)`,
    before: { rechargedCount: toReset.length },
    after: null,
    // recharged carries per-item pre-rest spent so undo restores exactly (no entityId).
    data: { restType, recharged: toReset },
    batchId,
    sessionId,
  });
}
