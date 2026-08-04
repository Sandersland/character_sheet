// DB-backed proof that seedSpecies (#1679) is idempotent — `prisma db seed`
// run twice must not duplicate rows or thrash stale-row deletes. Runs against
// the real seeded catalog (the template every vitest worker clones already
// ran seedSpecies once via seed.ts's main()), so this re-invokes it directly
// rather than building a throwaway fixture — seed.ts self-invokes main() at
// module load and can't be re-run from a test, but seedSpecies itself is a
// plain exported function.
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { seedSpecies } from "../seed-species.js";
import { SPECIES } from "../species-data.js";

const totalVariants = SPECIES.reduce((sum, s) => sum + (s.variants?.length ?? 0), 0);

describe("seedSpecies idempotency (#1679)", () => {
  it("running seedSpecies twice leaves row counts unchanged", async () => {
    await seedSpecies(prisma);
    const speciesCountAfterFirst = await prisma.species.count();
    const variantCountAfterFirst = await prisma.speciesVariant.count();

    await seedSpecies(prisma);
    const speciesCountAfterSecond = await prisma.species.count();
    const variantCountAfterSecond = await prisma.speciesVariant.count();

    expect(speciesCountAfterSecond).toBe(speciesCountAfterFirst);
    expect(variantCountAfterSecond).toBe(variantCountAfterFirst);
    expect(speciesCountAfterFirst).toBe(SPECIES.length);
    expect(variantCountAfterFirst).toBe(totalVariants);
  });

  it("re-seeding preserves catalog row identity (ids are stable across runs, not recreated)", async () => {
    const before = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2014" } });
    await seedSpecies(prisma);
    const after = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2014" } });
    expect(after.id).toBe(before.id);
  });
});

describe("seeded roster served per edition, directly off the DB", () => {
  it("2014 roster excludes every 2024 exclusive", async () => {
    const rows = await prisma.species.findMany({ where: { edition: "EDITION_2014" }, select: { name: true } });
    const names = rows.map((r) => r.name);
    expect(names).not.toContain("Aasimar");
    expect(names).not.toContain("Goliath");
    expect(names).not.toContain("Orc");
  });

  it("2024 roster excludes every 2014 exclusive", async () => {
    const rows = await prisma.species.findMany({ where: { edition: "EDITION_2024" }, select: { name: true } });
    const names = rows.map((r) => r.name);
    expect(names).not.toContain("Half-Elf");
    expect(names).not.toContain("Half-Orc");
  });

  it("canary: seeded Dwarf speed differs by edition (25 ft 2014 / 30 ft 2024)", async () => {
    const dwarf2014 = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2014" } });
    const dwarf2024 = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2024" } });
    expect(dwarf2014.speed).toBe(25);
    expect(dwarf2024.speed).toBe(30);
  });

  it("Hill Dwarf's ability increase is additive on top of the parent Dwarf row's", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({
      where: { slug: "dwarf", edition: "EDITION_2014" },
      include: { variants: true },
    });
    expect(dwarf.abilityIncreases).toEqual([{ ability: "constitution", amount: 2 }]);
    const hillDwarf = dwarf.variants.find((v) => v.slug === "hill");
    expect(hillDwarf?.abilityIncreases).toEqual([{ ability: "wisdom", amount: 1 }]);
  });

  it("Wood Elf's speedOverride is seeded (35 ft, over Elf's own 30 ft)", async () => {
    const elf = await prisma.species.findFirstOrThrow({
      where: { slug: "elf", edition: "EDITION_2014" },
      include: { variants: true },
    });
    expect(elf.speed).toBe(30);
    const woodElf = elf.variants.find((v) => v.slug === "wood");
    expect(woodElf?.speedOverride).toBe(35);
  });

  it("Dragonborn carries 10 draconic ancestry variants in both editions", async () => {
    const dragonborn2014 = await prisma.species.findFirstOrThrow({
      where: { slug: "dragonborn", edition: "EDITION_2014" },
      include: { variants: true },
    });
    const dragonborn2024 = await prisma.species.findFirstOrThrow({
      where: { slug: "dragonborn", edition: "EDITION_2024" },
      include: { variants: true },
    });
    expect(dragonborn2014.variants).toHaveLength(10);
    expect(dragonborn2024.variants).toHaveLength(10);
  });
});
