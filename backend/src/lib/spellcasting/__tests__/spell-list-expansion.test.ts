// DB-backed proof for #1631's read path — over the REAL seeded
// SubclassSpellListExpansion rows (The Fiend/The Archfey/The Great Old One),
// same "link against live seed content" style as granted-spells-domains.test.ts.
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { loadSubclassSpellListExpansionIds } from "@/lib/spellcasting/spell-list-expansion.js";

async function requireSubclassId(className: string, subclassName: string, edition: "EDITION_2014" | "EDITION_2024" | null): Promise<string> {
  const classRow = await prisma.characterClass.findUniqueOrThrow({ where: { name: className }, select: { id: true } });
  const sub = await prisma.subclass.findFirstOrThrow({
    where: { classId: classRow.id, name: subclassName, edition },
    select: { id: true },
  });
  return sub.id;
}

describe("loadSubclassSpellListExpansionIds (#1631)", () => {
  it("returns the ten Fiend spell ids for a 2014 character, none for a 2024 character", async () => {
    const fiendId = await requireSubclassId("Warlock", "The Fiend", null);
    const ids2014 = await loadSubclassSpellListExpansionIds(fiendId, "EDITION_2014");
    const ids2024 = await loadSubclassSpellListExpansionIds(fiendId, "EDITION_2024");
    expect(ids2014).toHaveLength(10);
    expect(ids2024).toEqual([]);
  });

  it("returns the ten Archfey spell ids for a 2014 character", async () => {
    const archfeyId = await requireSubclassId("Warlock", "The Archfey", "EDITION_2014");
    const ids = await loadSubclassSpellListExpansionIds(archfeyId, "EDITION_2014");
    expect(ids).toHaveLength(10);
  });

  it("returns the ten Great Old One spell ids for a 2014 character", async () => {
    const greatOldOneId = await requireSubclassId("Warlock", "The Great Old One", "EDITION_2014");
    const ids = await loadSubclassSpellListExpansionIds(greatOldOneId, "EDITION_2014");
    expect(ids).toHaveLength(10);
  });

  it("returns an empty set for a null/absent subclassId", async () => {
    expect(await loadSubclassSpellListExpansionIds(null, "EDITION_2014")).toEqual([]);
    expect(await loadSubclassSpellListExpansionIds(undefined, "EDITION_2014")).toEqual([]);
  });

  it("returns an empty set for a subclass with no list-expansion rows (Life Domain)", async () => {
    const lifeDomainId = await requireSubclassId("Cleric", "Life Domain", null);
    expect(await loadSubclassSpellListExpansionIds(lifeDomainId, "EDITION_2014")).toEqual([]);
  });
});
