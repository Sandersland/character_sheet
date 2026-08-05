// DB-backed proof for #1710's Spell fork: the widened (name, edition)
// constraint, and BOTH directions of the prune seedSpells gains in the same
// change. Modelled on action-fork-reseed.test.ts — seed.ts exports nothing
// and self-invokes main() at module load, so a test cannot import and re-run
// it; calling upsertEditionRow and staleCatalogRowsWhere with the exact
// arguments seedSpells passes proves the same properties directly.
//
// Fixture rules: every destructive call is scoped with `extraWhere` to this
// file's own names. staleCatalogRowsWhere means "everything NOT in the
// seeded list", and seedSpells passes NO extraWhere (it owns every Spell
// row), so an unscoped call here would eat the whole real spell catalog out
// from under every other test in the same vitest worker (see
// prune.test.ts's header).
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

import { staleCatalogRowsWhere } from "../prune.js";

const NAME = "Zzz Spell Fork Probe (#1710)";
const UNSEEDED_NAME = "Zzz Spell Fork Probe Unrelated (#1710)";
const ONLY_THIS_FILES_ROWS = { name: { in: [NAME, UNSEEDED_NAME] } };

const row = (name: string, edition: "EDITION_2014" | "EDITION_2024" | null, description: string) => ({
  name,
  level: 1,
  school: "evocation" as const,
  castingTime: "1 action",
  range: "30 ft",
  duration: "Instantaneous",
  description,
  edition,
});

afterEach(async () => {
  await prisma.spell.deleteMany({ where: ONLY_THIS_FILES_ROWS });
});

// Proves the scoping above held: if any test leaked past its own names, the
// real catalog is gone and this is what goes red.
afterAll(async () => {
  const fireball = await prisma.spell.findFirst({ where: { name: "Fireball" } });
  expect(fireball, "the real seeded Spell catalog must survive this suite").not.toBeNull();
});

describe("Spell @@unique([name, edition]) with NULLS NOT DISTINCT (#1710)", () => {
  it("admits one row per edition under the same name", async () => {
    await prisma.spell.create({ data: row(NAME, "EDITION_2014", "2014 text") });
    await prisma.spell.create({ data: row(NAME, "EDITION_2024", "2024 text") });

    const descriptions = (await prisma.spell.findMany({ where: { name: NAME }, orderBy: { description: "asc" } })).map(
      (s) => s.description,
    );
    expect(descriptions).toEqual(["2014 text", "2024 text"]);
  });

  // The NULLS NOT DISTINCT half. Delete that clause from the migration SQL
  // and this is the only assertion that goes red — Postgres would then treat
  // NULLs as distinct and admit unboundedly many shared rows per name, which
  // is what would let upsertEditionRow's findFirst update one twin and
  // strand the other.
  it("rejects a second edition-NULL row under the same name", async () => {
    await prisma.spell.create({ data: row(NAME, null, "Shared") });
    await expect(prisma.spell.create({ data: row(NAME, null, "Shared twin") })).rejects.toThrow();
  });

  // seedSpells' plain `.upsert({ where: { name } })` had to become
  // upsertEditionRow: the old form matched on `name` alone, so the second
  // edition's write would have OVERWRITTEN its sibling instead of creating a
  // twin.
  it("upsertEditionRow run twice updates each edition in place and leaves the sibling untouched", async () => {
    const twentyFourteen = await prisma.spell.create({ data: row(NAME, "EDITION_2014", "2014 text") });
    const data = row(NAME, "EDITION_2024", "2024 text");
    for (let run = 0; run < 2; run += 1) {
      await upsertEditionRow(prisma.spell, { name: NAME, edition: "EDITION_2024" }, data, data);
    }

    const rows = await prisma.spell.findMany({ where: { name: NAME }, orderBy: { description: "asc" } });
    expect(rows.map((s) => `${s.edition}::${s.description}`)).toEqual(["EDITION_2014::2014 text", "EDITION_2024::2024 text"]);
    // Same id ⇒ the 2014 row was never touched, let alone rewritten.
    expect(rows.find((s) => s.edition === "EDITION_2014")!.id).toBe(twentyFourteen.id);
  });
});

describe("seedSpells' prune — both directions (#1710)", () => {
  // Direction A: the shape seedSpells passes. Each row's OWN edition is in
  // the seeded list, so both forks survive, repeatedly.
  it("per-row editions preserve both forks, stably across repeated (idempotent) runs", async () => {
    await prisma.spell.create({ data: row(NAME, "EDITION_2014", "2014 text") });
    await prisma.spell.create({ data: row(NAME, "EDITION_2024", "2024 text") });
    await prisma.spell.create({ data: row(UNSEEDED_NAME, "EDITION_2024", "Retired") });

    const seeded = [
      { identity: NAME, edition: "EDITION_2014" as const },
      { identity: NAME, edition: "EDITION_2024" as const },
    ];
    for (let run = 0; run < 2; run += 1) {
      await prisma.spell.deleteMany({ where: staleCatalogRowsWhere("name", seeded, ONLY_THIS_FILES_ROWS) });
    }

    const surviving = (await prisma.spell.findMany({ where: ONLY_THIS_FILES_ROWS })).map((s) => `${s.name}::${s.edition}`);
    expect(surviving.sort()).toEqual([`${NAME}::EDITION_2014`, `${NAME}::EDITION_2024`]);
  });

  // Direction B (the empty-partition `notIn: []` trap): a seeded list that
  // declares the name as SHARED (edition: null) gives the 2014/2024
  // partitions `notIn: []`, which matches every row in them — so an
  // all-2024 seeded spells.ts must NOT be expressed this way, or it would
  // delete every 2014 row a content slice ever adds. This is exactly what a
  // forgotten `edition:` in seedSpells' map would reintroduce.
  it("an all-NULL seeded list deletes both forks", async () => {
    await prisma.spell.create({ data: row(NAME, "EDITION_2014", "2014 text") });
    await prisma.spell.create({ data: row(NAME, "EDITION_2024", "2024 text") });

    await prisma.spell.deleteMany({
      where: staleCatalogRowsWhere("name", [{ identity: NAME, edition: null }], ONLY_THIS_FILES_ROWS),
    });

    expect(await prisma.spell.findMany({ where: { name: NAME } })).toEqual([]);
  });

  // The regression this codebase specifically risks: seedSpells' seeded list
  // is `[...SPELLS, ...SPELLS_2014]` (#1710) — two arrays concatenated, not
  // one. If a future refactor forgets the SPELLS_2014 half, the 2014
  // partition's `notIn` goes empty for every name a spells-2014/*.ts content
  // slice ever adds, and this is what silently wipes them on the very next
  // reseed. "per-row editions preserve both forks" above is the converse:
  // proof that concatenating BOTH arrays (the real seedSpells shape) is what
  // avoids this.
  it("an all-2024-only seeded list (SPELLS_2014 omitted from the union) deletes an existing 2014 row", async () => {
    await prisma.spell.create({ data: row(NAME, "EDITION_2014", "2014 text") });
    await prisma.spell.create({ data: row(UNSEEDED_NAME, "EDITION_2024", "2024 text") });

    const seededAs2024Only = [{ identity: UNSEEDED_NAME, edition: "EDITION_2024" as const }];
    await prisma.spell.deleteMany({ where: staleCatalogRowsWhere("name", seededAs2024Only, ONLY_THIS_FILES_ROWS) });

    const surviving = (await prisma.spell.findMany({ where: ONLY_THIS_FILES_ROWS })).map((s) => `${s.name}::${s.edition}`);
    expect(surviving).toEqual([`${UNSEEDED_NAME}::EDITION_2024`]);
  });
});
