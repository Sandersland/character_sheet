// #1649: InventoryCapabilityUse.used/InventoryItem.usesRemaining are the SOLE home for this state; the `mirror*` names are historical (there's nothing left to mirror against).
// Each write is atomic (updateMany/increment) so a concurrent spender can't race a read-modify-write.
// These filter on capabilityKey ALONE (not the (inventoryItemId, capabilityKey) unique constraint) — deliberate, since capabilityKey is per-acquisition; a caller that already knows its inventoryItemId should scope by it instead (see the spellcasting overdraw guard).
import type { Prisma } from "@/generated/prisma/client.js";

export async function mirrorCapabilityUsedSet(
  tx: Prisma.TransactionClient,
  capabilityKey: string,
  used: number,
): Promise<void> {
  await tx.inventoryCapabilityUse.updateMany({ where: { capabilityKey }, data: { used } });
}

export async function mirrorCapabilityUsedIncrement(
  tx: Prisma.TransactionClient,
  capabilityKey: string,
  delta: number,
): Promise<void> {
  await tx.inventoryCapabilityUse.updateMany({ where: { capabilityKey }, data: { used: { increment: delta } } });
}

// Batch form of mirrorCapabilityUsedSet(..., 0) for the rest-sweep reset path.
export async function mirrorCapabilityUsedResetMany(
  tx: Prisma.TransactionClient,
  capabilityKeys: string[],
): Promise<void> {
  if (capabilityKeys.length === 0) return;
  await tx.inventoryCapabilityUse.updateMany({ where: { capabilityKey: { in: capabilityKeys } }, data: { used: 0 } });
}

export async function mirrorUsesRemaining(
  tx: Prisma.TransactionClient,
  inventoryItemId: string,
  usesRemaining: number | null,
): Promise<void> {
  await tx.inventoryItem.updateMany({ where: { id: inventoryItemId }, data: { usesRemaining } });
}
