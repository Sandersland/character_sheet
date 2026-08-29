// #1649: the ONE place InventoryItem.snapshot is parsed; the row id in the thrown message is what makes a bad row identifiable in a log.
import { inventorySnapshotSchema, type InventorySnapshot } from "@character-sheet/contracts";

export function readInventorySnapshot(row: { id: string; snapshot: unknown }): InventorySnapshot {
  const result = inventorySnapshotSchema.safeParse(row.snapshot);
  if (!result.success) {
    throw new Error(`InventoryItem ${row.id} has an invalid snapshot: ${JSON.stringify(result.error.issues)}`);
  }
  return result.data;
}
