// TRANSITIONAL guard (#1645, epic #1644): ItemCapability must be a verbatim
// copy of CampaignItemCapability's column set, because #1646 copies rows
// between them with a straight INSERT … SELECT. A single missed column would
// silently drop data for every DM-authored magic item, and the table grew to
// ~40 columns across five migrations — far past what a diff review catches.
// Compared as sets read from information_schema, so a hand-transcription slip
// fails here rather than in production.
//
// DELETE THIS FILE in #1646, which drops CampaignItemCapability: at that point
// the parity it checks no longer has two sides and this suite goes red.
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

const CASCADE_FIXTURE_NAME = "Capability Parity Fixture";

// The cascade test deletes its own row as the assertion. If an earlier expect
// throws, that delete never runs and the NEXT run dies on P2002 — a test that
// poisons itself. Cleanup belongs here, where a failure cannot skip it.
afterEach(async () => {
  await prisma.item.deleteMany({ where: { name: CASCADE_FIXTURE_NAME } });
});

type Column = { column_name: string; data_type: string; udt_name: string; is_nullable: string };

async function columnsOf(table: string): Promise<Column[]> {
  return prisma.$queryRaw<Column[]>`
    SELECT column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_name = ${table} AND table_schema = current_schema()
    ORDER BY column_name`;
}

// The parent FK is the ONE column that legitimately differs.
const withoutParent = (cols: Column[], fk: string) => cols.filter((c) => c.column_name !== fk);

describe("ItemCapability mirrors CampaignItemCapability (#1645)", () => {
  it("carries every column, with matching types and nullability", async () => {
    const source = withoutParent(await columnsOf("CampaignItemCapability"), "campaignItemId");
    const target = withoutParent(await columnsOf("ItemCapability"), "itemId");

    expect(target.length).toBeGreaterThan(0);
    expect(target).toEqual(source);
  });

  it("parents to Item and cascades on delete", async () => {
    const item = await prisma.item.create({
      data: {
        name: CASCADE_FIXTURE_NAME,
        category: "gear",
        scope: "GLOBAL",
        scopeKey: "global",
        capabilities: { create: [{ kind: "passiveBonus", target: "ac", op: "add", value: 1 }] },
      },
      include: { capabilities: true },
    });
    expect(item.capabilities).toHaveLength(1);

    await prisma.item.delete({ where: { id: item.id } });

    expect(await prisma.itemCapability.findMany({ where: { itemId: item.id } })).toEqual([]);
  });
});

describe("Item magic-item columns (#1645)", () => {
  it("defaults are inert, so seeded catalog rows are unaffected", async () => {
    const row = await prisma.item.findUniqueOrThrow({
      where: { scopeKey_name: { scopeKey: "global", name: "Longsword" } },
    });

    expect(row.rarity).toBeNull();
    expect(row.requiresAttunement).toBe(false);
    expect(row.attunementPrereqKind).toBeNull();
    expect(row.isUnique).toBe(false);
    expect(row.dmNotes).toBeNull();
  });
});
