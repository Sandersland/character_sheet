// DB-backed proof for #1430's Action fork: the widened (key, edition)
// constraint, and BOTH directions of the prune seedActions gained in the same
// change. Modelled on granted-ability-fork-reseed.test.ts — seed.ts exports
// nothing and self-invokes main() at module load, so a test cannot import and
// re-run it; calling upsertEditionRow and staleCatalogRowsWhere with the exact
// arguments seedActions passes proves the same properties directly.
//
// Fixture rules: every destructive call is scoped with `extraWhere` to this
// file's own keys. staleCatalogRowsWhere means "everything NOT in the seeded
// list", and seedActions passes NO extraWhere (it owns every Action row), so an
// unscoped call here would eat the whole real action catalog out from under
// every other test in the same vitest worker (see prune.test.ts's header).
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

// Proves the scoping above held: if any test leaked past its own keys, the real
// catalog is gone and this is what goes red.
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

  // The NULLS NOT DISTINCT half. Delete that clause from the migration SQL and
  // this is the only assertion that goes red — Postgres would then treat NULLs
  // as distinct and admit unboundedly many shared rows per key, which is what
  // would let upsertEditionRow's findFirst update one twin and strand the other.
  it("rejects a second edition-NULL row under the same key", async () => {
    await prisma.action.create({ data: row(KEY, null, "Shared") });
    await expect(prisma.action.create({ data: row(KEY, null, "Shared twin") })).rejects.toThrow();
  });

  // seedActions' `.upsert({ where: { key } })` had to become upsertEditionRow:
  // the old form matched on `key` alone, so the second edition's write would
  // have OVERWRITTEN its sibling instead of creating a twin.
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
  // Direction A: the shape seedActions passes. Each row's OWN edition is in the
  // seeded list, so both forks survive, repeatedly.
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

  // Direction B: the partitioning is load-bearing, not decoration. A seeded
  // list that declares the key as SHARED gives the 2014/2024 partitions
  // `notIn: []`, which matches every row in them — so both forks are deleted.
  // This is the #1415 shadow-arts trap, and it is exactly what a forgotten
  // `edition:` in seedActions' map would reintroduce.
  it("an all-NULL seeded list deletes both forks", async () => {
    await prisma.action.create({ data: row(KEY, "EDITION_2014", "Use an Object") });
    await prisma.action.create({ data: row(KEY, "EDITION_2024", "Utilize") });

    await prisma.action.deleteMany({
      where: staleCatalogRowsWhere("key", [{ identity: KEY, edition: null }], ONLY_THIS_FILES_ROWS),
    });

    expect(await prisma.action.findMany({ where: { key: KEY } })).toEqual([]);
  });

  // The identity column is a required first parameter for this reason: Action
  // carries BOTH `name` and `key`, so `"name"` builds a valid-but-wrong notIn
  // that spares the wrong rows — it does not throw the way it would on a model
  // lacking `name`. A defaulted `"name"` would make that the silent default.
  it("the wrong identity column silently spares the wrong rows", async () => {
    await prisma.action.create({ data: row(KEY, "EDITION_2024", "Utilize") });
    await prisma.action.create({ data: row(UNSEEDED_KEY, "EDITION_2024", "Utilize") });

    // Declares the KEY row as seeded — but keyed on `name`, both rows share the
    // name "Utilize", so the genuinely-retired row survives too.
    await prisma.action.deleteMany({
      where: staleCatalogRowsWhere("name", [{ identity: "Utilize", edition: "EDITION_2024" }], ONLY_THIS_FILES_ROWS),
    });
    expect(await prisma.action.count({ where: ONLY_THIS_FILES_ROWS })).toBe(2);

    // Keyed on `key`, as seedActions does, the retired row goes.
    await prisma.action.deleteMany({
      where: staleCatalogRowsWhere("key", [{ identity: KEY, edition: "EDITION_2024" }], ONLY_THIS_FILES_ROWS),
    });
    expect((await prisma.action.findMany({ where: ONLY_THIS_FILES_ROWS })).map((a) => a.key)).toEqual([KEY]);
  });
});
