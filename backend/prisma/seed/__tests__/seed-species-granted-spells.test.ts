// DB-backed proof that seedSpeciesGrantedSpells (#1683) is idempotent and
// resolves its (speciesId, variantId, spellId) targets correctly — mirrors
// seed-species-traits.test.ts's own idempotency proof.
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { seedSpeciesGrantedSpells } from "../seed-species-granted-spells.js";
import { SPECIES_GRANTED_SPELLS } from "../species-granted-spells-data.js";

describe("seedSpeciesGrantedSpells idempotency (#1683)", () => {
  it("running seedSpeciesGrantedSpells twice leaves the row count unchanged and preserves row identity", async () => {
    await seedSpeciesGrantedSpells(prisma);
    const countAfterFirst = await prisma.speciesGrantedSpell.count();
    const before = await prisma.speciesGrantedSpell.findFirstOrThrow({
      where: { spell: { name: "Dancing Lights" } },
    });

    await seedSpeciesGrantedSpells(prisma);
    const countAfterSecond = await prisma.speciesGrantedSpell.count();
    const after = await prisma.speciesGrantedSpell.findFirstOrThrow({ where: { id: before.id } });

    expect(countAfterSecond).toBe(countAfterFirst);
    expect(countAfterFirst).toBe(SPECIES_GRANTED_SPELLS.length);
    expect(after.gateLevel).toBe(before.gateLevel);
  });
});

describe("Drow lineage spell track, directly off the DB", () => {
  it("the Drow variant grants Dancing Lights@1, Faerie Fire@3, Darkness@5, in gate-level order", async () => {
    const drow = await prisma.speciesVariant.findFirstOrThrow({
      where: { slug: "drow", species: { slug: "elf", edition: "EDITION_2024" } },
      include: { grantedSpells: { orderBy: { gateLevel: "asc" }, include: { spell: true } } },
    });
    expect(drow.grantedSpells.map((g) => [g.spell.name, g.gateLevel])).toEqual([
      ["Dancing Lights", 1],
      ["Faerie Fire", 3],
      ["Darkness", 5],
    ]);
  });

  it("the parent Elf species carries no SPECIES-LEVEL grants — every 2024 grant this slice is variant-scoped", async () => {
    // Species.grantedSpells is the plain back-relation (every row FK'd to this
    // speciesId, regardless of variantId — same gotcha activeTraitRows'
    // comment documents for species.traits); filter to variantId === null to
    // ask "species-level", not "this species or any of its variants".
    const elf = await prisma.species.findFirstOrThrow({
      where: { slug: "elf", edition: "EDITION_2024" },
      include: { grantedSpells: true },
    });
    expect(elf.grantedSpells.filter((g) => g.variantId === null)).toHaveLength(0);
  });
});
