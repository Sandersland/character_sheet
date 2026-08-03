// Mirror writes to InventoryCapabilityUse.used and InventoryItem.usesRemaining
// (#1648, epic #1644). The Inventory*/InventoryConsumableDetail tables stay
// authoritative until #1649 flips the readers — every call site below sits
// beside an existing atomic write to the old location, never replacing it.
//
// Each mirror is itself atomic (updateMany/increment), matching whatever the
// paired old-location write already is: reading the old value and writing the
// new one back would reintroduce the race the column layout exists to avoid.
// capabilityKey is the source InventoryCapability row's id — the same id
// buildInventorySnapshot writes into the snapshot entry's `key`.
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

// Batch form of mirrorCapabilityUsedSet(..., 0) — the rest-sweep reset path
// touches many capability rows in one pass.
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
