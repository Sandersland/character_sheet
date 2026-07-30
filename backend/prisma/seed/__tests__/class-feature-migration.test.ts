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

import { CLASS_FEATURES } from "../class-features.js";
import { seedClassFeatures } from "../seed-class-features.js";

describe("ClassFeature migration — row count (#1523)", () => {
  it("the seeded table holds exactly the row count CLASS_FEATURES derives from the registry", async () => {
    // CLASS_FEATURES itself is not a literal — it's built at import time by
    // walking all twelve lib/classes/*.ts modules (class-features.ts), so
    // asserting the DB count against CLASS_FEATURES.length compares two
    // genuinely independent numbers (a live Postgres COUNT vs. a static-source
    // derivation), never a hardcoded 522.
    const actual = await prisma.classFeature.count();
    expect(actual).toBe(CLASS_FEATURES.length);
  });

  // Mutation proof (manual, recorded in the PR): deleting one real DB row
  // (e.g. Fighter's base-class "Indomitable" 2024 row) drops `actual` by 1
  // while CLASS_FEATURES.length is unaffected (it's derived from TS source,
  // not the DB) — this assertion is what goes red and by how much.
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

// The 10 already-forked rows (Cleric "Domain Spells", Warlock "Expanded Spell
// List") are the ONLY names whose EDITION_2014/EDITION_2024 pair is SUPPOSED
// to differ — asserted separately (and by name) in the "already-forked pairs"
// describe block below. Excluding those two names here, by construction every
// remaining (className, subclassSlug, name, level) group of exactly 2 rows in
// CLASS_FEATURES must be an untagged feature's 2014/2024 expansion, so its two
// descriptions must be equal — this needs no separate access to the raw,
// pre-expansion feature list (which class-features.ts keeps internal).
const KNOWN_FORKED_NAMES = new Set(["Domain Spells", "Expanded Spell List"]);

describe("ClassFeature migration — untagged rows are byte-identical across editions (#1523)", () => {
  it("every untagged feature's EDITION_2014/EDITION_2024 pair has equal level and description", async () => {
    const byKey = new Map<string, typeof CLASS_FEATURES>();
    for (const row of CLASS_FEATURES) {
      if (KNOWN_FORKED_NAMES.has(row.name)) continue;
      const key = `${row.className}::${row.subclassSlug ?? "null"}::${row.name}::${row.level}`;
      const group = byKey.get(key) ?? [];
      group.push(row);
      byKey.set(key, group);
    }

    const pairs = [...byKey.values()].filter((g) => g.length === 2);
    expect(pairs.length).toBeGreaterThan(0);

    for (const pair of pairs) {
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
