// Lives outside inventory.ts so the rest handler can import it without a cycle — inventory.ts imports applyHealInTx from the hitpoints rest handler for consumable healing.
import type { Prisma } from "@/generated/prisma/client.js";
import {
  activatedRechargeRest,
  capabilityColumnsFromSnapshot,
  readCapability,
  type ActivatedEffectCapability,
} from "./capabilities.js";
import { readInventorySnapshot } from "./inventory-snapshot-read.js";
import { logEvent } from "@/lib/activity/events.js";

// #543: perRest(short) recharges on short|long; everything else on long only. The seeded buff is cleared separately by the rest's buff sweep.
export async function resetActivatedUsesForRestInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  restType: "short" | "long",
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const items = await tx.inventoryItem.findMany({
    where: { characterId, activatedUsesSpent: { gt: 0 } },
    include: { capabilityUses: true },
  });
  const toReset: { id: string; name: string; previousSpent: number }[] = [];
  for (const item of items) {
    const usedByKey = new Map(item.capabilityUses.map((u) => [u.capabilityKey, u.used]));
    const capabilities = readInventorySnapshot(item).capabilities.map((c) =>
      capabilityColumnsFromSnapshot(c, usedByKey.get(c.key) ?? 0),
    );
    // Type-predicate filter, not a bare cast: an opaque row with kind="activatedEffect" but no activation must not slip through, or activatedRechargeRest would spuriously recharge it.
    const cap = capabilities
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
