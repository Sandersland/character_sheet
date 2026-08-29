import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { makeCatalogEntry } from "@/test-support/catalog-entry.js";

import { seedSpellClassesFor } from "../seed-spell-classes.js";

const SPELL_NAME = "Zzz SpellClass Probe (#1711)";

async function makeSpell(name: string = SPELL_NAME) {
  const catalogEntryId = await makeCatalogEntry({ name });
  return prisma.spell.create({
    data: {
      name, level: 1, school: "evocation", castingTime: "1 action",
      range: "30 ft", duration: "Instantaneous", description: "probe",
      edition: null, catalogEntryId,
    },
  });
}

async function membershipOf(spellId: string): Promise<string[]> {
  const rows = await prisma.spellClass.findMany({ where: { spellId }, orderBy: { className: "asc" } });
  return rows.map((r) => r.className);
}

describe("seedSpellClassesFor (#1711)", () => {
  afterAll(async () => {
    await prisma.spell.deleteMany({ where: { name: SPELL_NAME } });
  });

  it("authors one SpellClass row per class name", async () => {
    const spell = await makeSpell();
    await seedSpellClassesFor(prisma, spell.id, ["wizard", "sorcerer"]);
    expect(await membershipOf(spell.id)).toEqual(["sorcerer", "wizard"]);
    await prisma.spell.delete({ where: { id: spell.id } });
  });

  it("running it twice with the same list is idempotent (no duplicate rows)", async () => {
    const spell = await makeSpell();
    await seedSpellClassesFor(prisma, spell.id, ["wizard"]);
    await seedSpellClassesFor(prisma, spell.id, ["wizard"]);
    expect(await membershipOf(spell.id)).toEqual(["wizard"]);
    await prisma.spell.delete({ where: { id: spell.id } });
  });

  it("prunes a class dropped from the list while keeping the rest, scoped to this spellId only", async () => {
    const spell = await makeSpell();
    const other = await makeSpell(`${SPELL_NAME} sibling`);
    await seedSpellClassesFor(prisma, spell.id, ["wizard", "sorcerer"]);
    await seedSpellClassesFor(prisma, other.id, ["wizard"]);

    await seedSpellClassesFor(prisma, spell.id, ["wizard"]);

    expect(await membershipOf(spell.id)).toEqual(["wizard"]);
    // Prune is scoped by spellId, never a global drop of every stale (spellId, className) pair.
    expect(await membershipOf(other.id)).toEqual(["wizard"]);

    await prisma.spell.deleteMany({ where: { id: { in: [spell.id, other.id] } } });
  });

  it("an empty class list prunes every membership row for that spell", async () => {
    const spell = await makeSpell();
    await seedSpellClassesFor(prisma, spell.id, ["wizard"]);
    await seedSpellClassesFor(prisma, spell.id, []);
    expect(await membershipOf(spell.id)).toEqual([]);
    await prisma.spell.delete({ where: { id: spell.id } });
  });
});
