// Writes to InventoryCapabilityUse.used and InventoryItem.usesRemaining — the
// SOLE home for this runtime state since #1649 dropped the InventoryCapability/
// InventoryConsumableDetail tables these functions used to sit beside as a
// dual-write mirror (#1648, epic #1644). Names kept as `mirror*` rather than
// renamed: every call site already refers to them, and there is nothing left
// to mirror against — read that prefix as historical, not descriptive.
//
// Each write is atomic (updateMany/increment) so a concurrent spender can't
// race a read-modify-write. capabilityKey is a capability's stable snapshot
// key (`capabilities[].key` in buildInventorySnapshot's output) — an opaque
// string, not tied to any live row's id.
//
// These filter on capabilityKey ALONE while the unique constraint is
// (inventoryItemId, capabilityKey): keys are per-acquisition UUIDs, so a key
// identifies one row in practice, and the rest sweep's batch form is
// deliberately cross-item. That is a deliberate trade, not an oversight — but
// it means a caller that already knows its inventoryItemId should scope by it
// rather than call these, which is why the spellcasting overdraw guard does
// its own updateMany instead.
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
