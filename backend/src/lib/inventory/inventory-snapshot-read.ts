// The ONE place InventoryItem.snapshot is parsed (#1649, epic #1644). Every
// reader needs the same typed blob; parsing inline at each call site would
// re-run the same zod validation many times per request and scatter the error
// handling. Throwing with the row's id (rather than a bare "invalid snapshot")
// is what makes a bad row identifiable in a log instead of just "invalid" —
// the row an operator needs to go look at.
import { inventorySnapshotSchema, type InventorySnapshot } from "@character-sheet/contracts";

export function readInventorySnapshot(row: { id: string; snapshot: unknown }): InventorySnapshot {
  const result = inventorySnapshotSchema.safeParse(row.snapshot);
  if (!result.success) {
    throw new Error(`InventoryItem ${row.id} has an invalid snapshot: ${JSON.stringify(result.error.issues)}`);
  }
  return result.data;
}
