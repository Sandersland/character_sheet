// One-time migration (#1648, epic #1644): the accompanying migration adds
// InventoryItem.snapshot NULLABLE because the backfill cannot be SQL — the
// capabilities array is a discriminated union whose flat-column mapping lives
// in readCapability (TypeScript), and rebuilding that in jsonb_build_object
// would recreate the exact mirror this epic exists to delete, with no way to
// run inventorySnapshotSchema.parse() over the result. This fills `snapshot`
// through buildInventorySnapshot, the SAME builder Task 4's dual-write calls,
// so a row backfilled here and a row created after this migration land in the
// identical shape.
//
// Fails LOUDLY on the first row buildInventorySnapshot can't represent —
// prints the row id + the zod issues and stops, rather than skipping it. A
// silently-skipped row would stay null and only surface as a NOT NULL
// violation in #1649, far from this cause.
//
// Idempotent: only selects rows whose snapshot is still null, so a second run
// is a no-op over already-backfilled rows.
//
// Imports only lib/ rule functions + prisma (no route/serialize code), per the
// migration-script pattern the sibling scripts in this directory follow.
import { Prisma } from "@/generated/prisma/client.js";
import type { PrismaClient } from "@/generated/prisma/client.js";
import { prisma as defaultPrisma } from "@/lib/core/prisma.js";
import { asCurrency } from "@/lib/inventory/inventory-currency.js";
import { buildInventorySnapshot, type SnapshotSourceRow } from "@/lib/inventory/inventory-snapshot-build.js";

const BATCH_SIZE = 200;

const unbackfilledInclude = {
  weaponDetail: true,
  armorDetail: true,
  consumableDetail: true,
  capabilities: true,
} satisfies Prisma.InventoryItemInclude;

type UnbackfilledRow = Prisma.InventoryItemGetPayload<{ include: typeof unbackfilledInclude }>;

function toSourceRow(row: UnbackfilledRow): SnapshotSourceRow {
  return {
    name: row.name,
    category: row.category,
    weight: row.weight,
    cost: asCurrency(row.cost),
    description: row.description,
    slot: row.slot,
    rarity: row.rarity,
    requiresAttunement: row.requiresAttunement,
    attunementPrereqKind: row.attunementPrereqKind,
    attunementPrereqValue: row.attunementPrereqValue,
    weaponDetail: row.weaponDetail,
    armorDetail: row.armorDetail,
    consumableDetail: row.consumableDetail,
    capabilities: row.capabilities,
  };
}

export interface BackfillResult {
  scannedItems: number;
  backfilledItems: string[];
}

/**
 * Fills InventoryItem.snapshot for every row where it's still null. Pass a
 * Prisma client (the default connects via DATABASE_URL); returns which rows
 * were backfilled. Throws (and stops, without touching later rows) on the
 * first row buildInventorySnapshot rejects.
 */
export async function backfillInventorySnapshot(
  prisma: PrismaClient = defaultPrisma,
): Promise<BackfillResult> {
  const backfilledItems: string[] = [];
  let scannedItems = 0;

  for (;;) {
    // Re-queried each pass (not offset-paged): every row this loop touches
    // drops out of the `snapshot: null` filter, so the working set shrinks on
    // its own and an offset can't drift out from under a concurrent write.
    const rows = await prisma.inventoryItem.findMany({
      // Json columns don't accept a bare `null` filter — `equals: Prisma.DbNull`
      // is "the SQL column is NULL" (distinct from a stored JSON `null`, which
      // snapshot never is: it's either absent or a full InventorySnapshot).
      where: { snapshot: { equals: Prisma.DbNull } },
      include: unbackfilledInclude,
      take: BATCH_SIZE,
      orderBy: { id: "asc" },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      scannedItems++;
      let snapshot;
      try {
        snapshot = buildInventorySnapshot(toSourceRow(row));
      } catch (err) {
        console.error(`backfill-inventory-snapshot: row ${row.id} ("${row.name}") cannot be represented:`);
        console.error(err instanceof Error ? err.message : err);
        throw err;
      }
      await prisma.inventoryItem.update({
        where: { id: row.id },
        data: { snapshot: snapshot as unknown as Prisma.InputJsonValue },
      });
      backfilledItems.push(row.id);
    }
  }

  return { scannedItems, backfilledItems };
}

// Thin CLI: run the backfill against DATABASE_URL and report the outcome.
if (import.meta.url === `file://${process.argv[1]}`) {
  backfillInventorySnapshot()
    .then((result) => {
      console.log(`Scanned ${result.scannedItems} InventoryItem row(s) with a null snapshot; backfilled ${result.backfilledItems.length}.`);
      return defaultPrisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await defaultPrisma.$disconnect();
      process.exit(1);
    });
}
