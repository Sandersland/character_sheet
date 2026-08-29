// seed.ts self-invokes main() at module load and exports nothing, so this calls upsertEditionRow/staleCatalogRowsWhere directly with the exact args seedSpells passes (#1710).
// staleCatalogRowsWhere matches everything NOT in the seeded list; every destructive call here is scoped via extraWhere to this file's own names, or it would delete the real catalog.
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { makeCatalogEntry } from "@/test-support/catalog-entry.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

import { staleCatalogRowsWhere } from "../prune.js";

const NAME = "Zzz Spell Fork Probe (#1710)";
const UNSEEDED_NAME = "Zzz Spell Fork Probe Unrelated (#1710)";
const ONLY_THIS_FILES_ROWS = { name: { in: [NAME, UNSEEDED_NAME] } };

// null edition here still resolves catalogEntryId to EDITION_2024 — CatalogEntry.edition is required, with no shared/null concept (#1796).
const row = async (name: string, edition: "EDITION_2014" | "EDITION_2024" | null, description: string) => ({
  name,
  level: 1,
  school: "evocation" as const,
  castingTime: "1 action",
  range: "30 ft",
  duration: "Instantaneous",
  description,
  edition,
  catalogEntryId: await makeCatalogEntry({ name, edition: edition ?? "EDITION_2024" }),
});

afterEach(async () => {
  // Deleting the CatalogEntry cascades the Spell row (ON DELETE CASCADE, #1796); the reverse cascade doesn't exist.
  await prisma.catalogEntry.deleteMany({ where: ONLY_THIS_FILES_ROWS });
});

// Fails if any test leaked past its own names and wiped the real catalog.
afterAll(async () => {
  const fireball = await prisma.spell.findFirst({ where: { name: "Fireball" } });
  expect(fireball, "the real seeded Spell catalog must survive this suite").not.toBeNull();
});

// #1796 moved uniqueness off Spell onto the linked CatalogEntry's business key; a genuine 2014/2024 fork is still two independent Spell rows, each with its own CatalogEntry.
describe("Spell fork rows (#1710) — two independent rows behind two independent CatalogEntry ids (#1796)", () => {
  it("admits one row per edition under the same name", async () => {
    await prisma.spell.create({ data: await row(NAME, "EDITION_2014", "2014 text") });
    await prisma.spell.create({ data: await row(NAME, "EDITION_2024", "2024 text") });

    const descriptions = (await prisma.spell.findMany({ where: { name: NAME }, orderBy: { description: "asc" } })).map(
      (s) => s.description,
    );
    expect(descriptions).toEqual(["2014 text", "2024 text"]);
  });

  // seedSpells' old `.upsert({ where: { name } })` matched on name alone, so the second edition's write would have overwritten its sibling.
  it("upsertEditionRow run twice updates each edition in place and leaves the sibling untouched", async () => {
    const twentyFourteen = await prisma.spell.create({ data: await row(NAME, "EDITION_2014", "2014 text") });
    const data = await row(NAME, "EDITION_2024", "2024 text");
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
  // Direction A: each row's own edition is in the seeded list, so both forks survive across repeated runs.
  it("per-row editions preserve both forks, stably across repeated (idempotent) runs", async () => {
    await prisma.spell.create({ data: await row(NAME, "EDITION_2014", "2014 text") });
    await prisma.spell.create({ data: await row(NAME, "EDITION_2024", "2024 text") });
    await prisma.spell.create({ data: await row(UNSEEDED_NAME, "EDITION_2024", "Retired") });

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

  // A seeded list with edition: null gives both partitions notIn: [], deleting every row — the trap a forgotten `edition:` in seedSpells' map would reintroduce.
  it("an all-NULL seeded list deletes both forks", async () => {
    await prisma.spell.create({ data: await row(NAME, "EDITION_2014", "2014 text") });
    await prisma.spell.create({ data: await row(NAME, "EDITION_2024", "2024 text") });

    await prisma.spell.deleteMany({
      where: staleCatalogRowsWhere("name", [{ identity: NAME, edition: null }], ONLY_THIS_FILES_ROWS),
    });

    expect(await prisma.spell.findMany({ where: { name: NAME } })).toEqual([]);
  });

  // seedSpells' seeded list is [...SPELLS, ...SPELLS_2014] (#1710); forgetting the SPELLS_2014 half empties the 2014 partition's notIn and wipes those rows on the next reseed.
  it("an all-2024-only seeded list (SPELLS_2014 omitted from the union) deletes an existing 2014 row", async () => {
    await prisma.spell.create({ data: await row(NAME, "EDITION_2014", "2014 text") });
    await prisma.spell.create({ data: await row(UNSEEDED_NAME, "EDITION_2024", "2024 text") });

    const seededAs2024Only = [{ identity: UNSEEDED_NAME, edition: "EDITION_2024" as const }];
    await prisma.spell.deleteMany({ where: staleCatalogRowsWhere("name", seededAs2024Only, ONLY_THIS_FILES_ROWS) });

    const surviving = (await prisma.spell.findMany({ where: ONLY_THIS_FILES_ROWS })).map((s) => `${s.name}::${s.edition}`);
    expect(surviving).toEqual([`${UNSEEDED_NAME}::EDITION_2024`]);
  });
});
