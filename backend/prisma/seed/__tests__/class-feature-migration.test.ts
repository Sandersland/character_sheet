// DB-backed migration-correctness suite for #1522/#1523: ClassFeature is a
// mechanical move of DerivedFeature[] text out of twelve lib/classes/*.ts
// modules into seeded rows — no rules content changes, no reader wired up yet
// (#1524). Modelled on granted-ability-fork-reseed.test.ts: seed-class-
// features.ts exports seedClassFeatures(prisma) precisely so this file can
// call it in-process (seed.ts's OWN families can't be re-run this way —
// main() self-invokes at module load and exports nothing).
//
// The template DB vitest.global-setup.ts clones from already ran `prisma db
// seed` once, so every row asserted against below is the REAL seeded catalog,
// not a fixture — this suite is a positive control on that real seed, the
// same shape validate.test.ts uses for assertSeedContentValid.
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { CLASS_FEATURES, collectRawFeatures, type ClassFeatureSeedRow } from "../class-features.js";
import { seedClassFeatures } from "../seed-class-features.js";

// Independently re-derives the expected count from the RAW (pre-expansion)
// feature list, rather than trusting CLASS_FEATURES.length as its own proof —
// so this test catches CLASS_FEATURES's own expansion going wrong, not only a
// seeding bug. Never hardcodes 522: the registry may move under this branch.
function expectedRowCount(): number {
  const raw = collectRawFeatures();
  const tagged = raw.filter((r) => r.feature.edition !== undefined).length;
  const untagged = raw.length - tagged;
  return untagged * 2 + tagged;
}

describe("ClassFeature migration — row count (#1523)", () => {
  it("the seeded table holds exactly the row count derived from the registry", async () => {
    const expected = expectedRowCount();
    expect(expected).toBe(CLASS_FEATURES.length);

    const actual = await prisma.classFeature.count();
    expect(actual).toBe(expected);
  });

  // Mutation proof (manual, recorded in the PR): temporarily removing one
  // entry from a class module's FEATURES array (e.g. fighter.ts's "Indomitable")
  // makes expectedRowCount() and CLASS_FEATURES.length both drop by 2 (an
  // untagged row), while the DB count (seeded before the edit) stays at the
  // old total — this assertion is what goes red and names the mismatch.
  it("every (class, subclass, name, edition) CLASS_FEATURES declares exists in the table — names the first missing tuple", async () => {
    const dbKeys = new Set(
      (
        await prisma.classFeature.findMany({
          select: { name: true, level: true, edition: true, classId: true, subclassId: true, class: { select: { name: true } }, subclass: { select: { slug: true } } },
        })
      ).map((r) => `${r.class.name}::${r.subclass?.slug ?? "null"}::${r.name}::${r.edition}`),
    );

    const missing: string[] = [];
    for (const row of CLASS_FEATURES) {
      const key = `${row.className}::${row.subclassSlug ?? "null"}::${row.name}::${row.edition}`;
      if (!dbKeys.has(key)) missing.push(key);
    }
    expect(missing, `missing ClassFeature row(s): ${missing.join(", ")}`).toEqual([]);
  });
});

describe("ClassFeature migration — untagged rows are byte-identical across editions (#1523)", () => {
  it("every untagged source feature produced an EDITION_2014 and EDITION_2024 row with equal level and description", async () => {
    // Grouping CLASS_FEATURES by name alone would ALSO catch the 10
    // already-forked rows (each already-forked feature is TWO raw entries —
    // one per edition — so it too groups to length 2, but its two
    // descriptions are SUPPOSED to differ). Must start from the raw,
    // pre-expansion feature list and select only the ones with no `edition`
    // tag at all, then look up their two expanded rows.
    const rawUntagged = collectRawFeatures().filter((r) => r.feature.edition === undefined);
    expect(rawUntagged.length).toBeGreaterThan(0);

    const byKey = new Map<string, ClassFeatureSeedRow[]>();
    for (const row of CLASS_FEATURES) {
      const key = `${row.className}::${row.subclassSlug ?? "null"}::${row.name}::${row.level}`;
      const group = byKey.get(key) ?? [];
      group.push(row);
      byKey.set(key, group);
    }

    for (const raw of rawUntagged) {
      const key = `${raw.className}::${raw.subclassSlug ?? "null"}::${raw.feature.name}::${raw.feature.level}`;
      const pair = byKey.get(key) ?? [];
      expect(pair, `${key} should have expanded to exactly 2 rows`).toHaveLength(2);
      const editions = pair.map((r) => r.edition).sort();
      expect(editions).toEqual(["EDITION_2014", "EDITION_2024"]);
      expect(pair[0].description).toBe(pair[1].description);
    }
  });
});

describe("ClassFeature migration — the 5 already-forked pairs were not duplicated (#1523)", () => {
  it("Cleric Domain Spells: exactly one row per (subclass, edition), descriptions differ between editions", async () => {
    const rows = await prisma.classFeature.findMany({
      where: { name: "Domain Spells", class: { name: "Cleric" } },
      select: { level: true, edition: true, description: true, subclass: { select: { name: true } } },
    });
    expect(rows).toHaveLength(4); // Life Domain + Trickery Domain, x2 editions each

    for (const subclassName of ["Life Domain", "Trickery Domain"]) {
      const pair = rows.filter((r) => r.subclass?.name === subclassName);
      expect(pair).toHaveLength(1 * 2);
      expect(pair.every((r) => r.level === 1)).toBe(true);
      const [r2014, r2024] = [pair.find((r) => r.edition === "EDITION_2014"), pair.find((r) => r.edition === "EDITION_2024")];
      expect(r2014).toBeDefined();
      expect(r2024).toBeDefined();
      expect(r2014!.description).not.toBe(r2024!.description);
    }
  });

  it("Warlock Expanded Spell List: exactly one row per (subclass, edition), descriptions differ between editions", async () => {
    const rows = await prisma.classFeature.findMany({
      where: { name: "Expanded Spell List", class: { name: "Warlock" } },
      select: { level: true, edition: true, description: true, subclass: { select: { name: true } } },
    });
    expect(rows).toHaveLength(6); // The Fiend + The Archfey + The Great Old One, x2 editions each

    for (const subclassName of ["The Fiend", "The Archfey", "The Great Old One"]) {
      const pair = rows.filter((r) => r.subclass?.name === subclassName);
      expect(pair).toHaveLength(2);
      expect(pair.every((r) => r.level === 1)).toBe(true);
      const [r2014, r2024] = [pair.find((r) => r.edition === "EDITION_2014"), pair.find((r) => r.edition === "EDITION_2024")];
      expect(r2014).toBeDefined();
      expect(r2024).toBeDefined();
      expect(r2014!.description).not.toBe(r2024!.description);
    }
  });
});

describe("ClassFeature migration — every descriptor column is NULL/default across all 522 rows (#1523)", () => {
  it("no row has a populated descriptor column yet — mechanics wiring belongs to #1528+", async () => {
    const rows = await prisma.classFeature.findMany();
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(row.resourceKey, row.name).toBeNull();
      expect(row.resourceLabel, row.name).toBeNull();
      expect(row.resourceRecharge, row.name).toBeNull();
      expect(row.resourceTotals, row.name).toBeNull();
      expect(row.resourceDieTiers, row.name).toBeNull();
      expect(row.activationCost, row.name).toBeNull();
      expect(row.resolverKind, row.name).toBeNull();
      expect(row.requiresUnarmored, row.name).toBe(false);
      expect(row.regrants, row.name).toEqual([]);
      expect(row.costKind, row.name).toBeNull();
      expect(row.costPoolKey, row.name).toBeNull();
      expect(row.costBase, row.name).toBeNull();
      expect(row.costPerStep, row.name).toBeNull();
      expect(row.effectKind, row.name).toBeNull();
      expect(row.effectDiceCount, row.name).toBeNull();
      expect(row.effectDiceFaces, row.name).toBeNull();
      expect(row.effectDieSource, row.name).toBeNull();
      expect(row.effectModifier, row.name).toBeNull();
      expect(row.effectModifierSource, row.name).toBeNull();
      expect(row.damageType, row.name).toBeNull();
      expect(row.attackType, row.name).toBeNull();
      expect(row.saveAbility, row.name).toBeNull();
      expect(row.saveEffect, row.name).toBeNull();
      expect(row.buffTarget, row.name).toBeNull();
      expect(row.buffModifier, row.name).toBeNull();
      expect(row.derivedStat, row.name).toBeNull();
      expect(row.derivedStatTiers, row.name).toBeNull();
    }
  });
});

describe("ClassFeature migration — every description is byte-identical to its TS source row (#1523)", () => {
  it("a sample of untagged and tagged rows match their CLASS_FEATURES source exactly", async () => {
    // Full-table exhaustive check (cheap at 522 rows) rather than a sample —
    // "byte-identical, no reflowing, no copy-editing" is the whole point.
    const dbRows = await prisma.classFeature.findMany({
      select: { name: true, level: true, description: true, edition: true, class: { select: { name: true } }, subclass: { select: { slug: true } } },
    });
    const dbByKey = new Map(
      dbRows.map((r) => [`${r.class.name}::${r.subclass?.slug ?? "null"}::${r.name}::${r.edition}`, r.description]),
    );

    for (const row of CLASS_FEATURES) {
      const key = `${row.className}::${row.subclassSlug ?? "null"}::${row.name}::${row.edition}`;
      expect(dbByKey.get(key), key).toBe(row.description);
    }
  });
});

describe("ClassFeature migration — seedClassFeatures is idempotent (#1523)", () => {
  it("running it again against an already-seeded table leaves the count unchanged and raises no P2002", async () => {
    const before = await prisma.classFeature.count();
    await expect(seedClassFeatures(prisma)).resolves.toBeUndefined();
    const after = await prisma.classFeature.count();
    expect(after).toBe(before);
  });

  it("a changed source row's description/level updates the SAME row in place on reseed, never a sibling", async () => {
    const canonical = CLASS_FEATURES.find(
      (r) => r.className === "Fighter" && r.subclassSlug === null && r.name === "Second Wind" && r.edition === "EDITION_2024",
    );
    if (!canonical) throw new Error("fixture assumption broken: Fighter's base-class Second Wind (2024) row is missing from CLASS_FEATURES");

    const target = await prisma.classFeature.findFirstOrThrow({
      where: { name: "Second Wind", class: { name: "Fighter" }, subclassId: null, edition: "EDITION_2024" },
    });

    await prisma.classFeature.update({ where: { id: target.id }, data: { description: "TEMPORARILY MUTATED FOR TEST" } });

    await seedClassFeatures(prisma);

    const rows = await prisma.classFeature.findMany({
      where: { name: "Second Wind", class: { name: "Fighter" }, subclassId: null, edition: "EDITION_2024" },
    });
    // Same row updated in place — not a second row created alongside the
    // (never-deleted) mutated one.
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(target.id);
    expect(rows[0].description).toBe(canonical.description);
  });
});
