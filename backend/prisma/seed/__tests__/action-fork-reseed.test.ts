// seed.ts self-invokes main() at module load and exports nothing, so this calls upsertEditionRow/staleCatalogRowsWhere directly with the exact args seedActions passes (#1430).
// staleCatalogRowsWhere matches everything NOT in the seeded list; every destructive call here is scoped via extraWhere to this file's own keys, or it would delete the real catalog.
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

import { staleCatalogRowsWhere } from "../prune.js";

const KEY = "zzzActionForkProbe1430";
const UNSEEDED_KEY = "zzzActionForkProbeUnrelated1430";
const ONLY_THIS_FILES_ROWS = { key: { in: [KEY, UNSEEDED_KEY] } };

const row = (key: string, edition: "EDITION_2014" | "EDITION_2024" | null, name: string) => ({
  key,
  name,
  description: name,
  cost: "action" as const,
  universal: true,
  edition,
});

afterEach(async () => {
  await prisma.action.deleteMany({ where: ONLY_THIS_FILES_ROWS });
});

// Fails if any test leaked past its own keys and wiped the real catalog.
afterAll(async () => {
  const dodge = await prisma.action.findFirst({ where: { key: "dodge" } });
  expect(dodge, "the real seeded Action catalog must survive this suite").not.toBeNull();
});

describe("Action @@unique([key, edition]) with NULLS NOT DISTINCT (#1430)", () => {
  it("admits one row per edition under the same key", async () => {
    await prisma.action.create({ data: row(KEY, "EDITION_2014", "Use an Object") });
    await prisma.action.create({ data: row(KEY, "EDITION_2024", "Utilize") });

    const names = (await prisma.action.findMany({ where: { key: KEY }, orderBy: { name: "asc" } })).map((a) => a.name);
    expect(names).toEqual(["Use an Object", "Utilize"]);
  });

  // NULLS NOT DISTINCT: without it Postgres treats NULLs as distinct, admitting unbounded shared rows per key and letting upsertEditionRow's findFirst strand a twin.
  it("rejects a second edition-NULL row under the same key", async () => {
    await prisma.action.create({ data: row(KEY, null, "Shared") });
    await expect(prisma.action.create({ data: row(KEY, null, "Shared twin") })).rejects.toThrow();
  });

  // seedActions' old `.upsert({ where: { key } })` matched on key alone, so the second edition's write would have overwritten its sibling.
  it("upsertEditionRow run twice updates each edition in place and leaves the sibling untouched", async () => {
    const twentyFourteen = await prisma.action.create({ data: row(KEY, "EDITION_2014", "Use an Object") });
    const data = row(KEY, "EDITION_2024", "Utilize");
    for (let run = 0; run < 2; run += 1) {
      await upsertEditionRow(prisma.action, { key: KEY, edition: "EDITION_2024" }, data, data);
    }

    const rows = await prisma.action.findMany({ where: { key: KEY }, orderBy: { name: "asc" } });
    expect(rows.map((a) => `${a.edition}::${a.name}`)).toEqual([
      "EDITION_2014::Use an Object",
      "EDITION_2024::Utilize",
    ]);
    // Same id ⇒ the 2014 row was never touched, let alone rewritten.
    expect(rows.find((a) => a.edition === "EDITION_2014")!.id).toBe(twentyFourteen.id);
  });
});

describe("seedActions' prune — both directions (#1430)", () => {
  // Direction A: each row's own edition is in the seeded list, so both forks survive across repeated runs.
  it("per-row editions preserve both forks, stably across repeated (idempotent) runs", async () => {
    await prisma.action.create({ data: row(KEY, "EDITION_2014", "Use an Object") });
    await prisma.action.create({ data: row(KEY, "EDITION_2024", "Utilize") });
    await prisma.action.create({ data: row(UNSEEDED_KEY, "EDITION_2024", "Retired") });

    const seeded = [
      { identity: KEY, edition: "EDITION_2014" as const },
      { identity: KEY, edition: "EDITION_2024" as const },
    ];
    for (let run = 0; run < 2; run += 1) {
      await prisma.action.deleteMany({ where: staleCatalogRowsWhere("key", seeded, ONLY_THIS_FILES_ROWS) });
    }

    const surviving = (await prisma.action.findMany({ where: ONLY_THIS_FILES_ROWS })).map((a) => `${a.key}::${a.edition}`);
    expect(surviving.sort()).toEqual([`${KEY}::EDITION_2014`, `${KEY}::EDITION_2024`]);
  });

  // A seeded list with edition: null gives both partitions notIn: [], deleting every row — the #1415 shadow-arts trap a forgotten `edition:` in seedActions' map would reintroduce.
  it("an all-NULL seeded list deletes both forks", async () => {
    await prisma.action.create({ data: row(KEY, "EDITION_2014", "Use an Object") });
    await prisma.action.create({ data: row(KEY, "EDITION_2024", "Utilize") });

    await prisma.action.deleteMany({
      where: staleCatalogRowsWhere("key", [{ identity: KEY, edition: null }], ONLY_THIS_FILES_ROWS),
    });

    expect(await prisma.action.findMany({ where: { key: KEY } })).toEqual([]);
  });

  // Action carries both name and key, so identity column has no default: "name" builds a valid-but-wrong notIn that silently spares the wrong rows.
  it("the wrong identity column silently spares the wrong rows", async () => {
    await prisma.action.create({ data: row(KEY, "EDITION_2024", "Utilize") });
    await prisma.action.create({ data: row(UNSEEDED_KEY, "EDITION_2024", "Utilize") });

    await prisma.action.deleteMany({
      where: staleCatalogRowsWhere("name", [{ identity: "Utilize", edition: "EDITION_2024" }], ONLY_THIS_FILES_ROWS),
    });
    expect(await prisma.action.count({ where: ONLY_THIS_FILES_ROWS })).toBe(2);

    await prisma.action.deleteMany({
      where: staleCatalogRowsWhere("key", [{ identity: KEY, edition: "EDITION_2024" }], ONLY_THIS_FILES_ROWS),
    });
    expect((await prisma.action.findMany({ where: ONLY_THIS_FILES_ROWS })).map((a) => a.key)).toEqual([KEY]);
  });
});
