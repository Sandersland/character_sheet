// #1593: asserts LITERAL_ROW_CLASSES' fixture mirrors the literal seed files.
// Lives on the PRISMA side because it has to import both halves and only this
// direction compiles — a src file importing anything under prisma/ is a
// TS6059 error, the same constraint that forces the two LITERAL_ROW_CLASSES
// sets to be maintained separately in the first place.
import { describe, expect, it } from "vitest";

import {
  LITERAL_CLASS_ROWS,
  LITERAL_SUBCLASS_ROWS,
} from "@/lib/classes/__tests__/test-feature-rows.fixture.js";
import { SUBCLASS_IDENTITY } from "@/lib/classes/subclass-slug.js";

import { CLASS_FEATURES, LITERAL_ROW_CLASSES } from "../class-features.js";

// The fixture keys subclass rows by lowercase NAME ("life domain") while
// CLASS_FEATURES carries subclassSlug ("cleric-life-domain"); SUBCLASS_IDENTITY
// is the join. Matching on a substring or endsWith of the slug instead
// silently mismatches — `nameKey` is precisely what the fixture is keyed on.
const SLUG_BY_NAME_KEY = new Map(
  Object.entries(SUBCLASS_IDENTITY).map(([slug, identity]) => [identity.nameKey, slug]),
);

interface SeedRow {
  level: number;
  description: string;
  choiceColumns: string;
  poolColumns: string;
}

function choiceColumnsOf(row: { choiceKey?: string | null; choiceCatalogSource?: string | null; choiceCountTiers?: unknown }): string {
  return JSON.stringify({
    choiceKey: row.choiceKey ?? null,
    choiceCatalogSource: row.choiceCatalogSource ?? null,
    choiceCountTiers: row.choiceCountTiers ?? null,
  });
}

// Guards a row's pool identity/shape — resourceKey/resourceLabel/
// resourceRecharge/resourceTotals/resourceOnInitiative — the same way
// choiceColumnsOf guards the choose-N columns. Without this, a seed-only edit
// to a pool's totals/onInitiative (e.g. a flatBonus mutation) drifts silently
// from the fixture: the description/level checks above never look at these
// fields, and nothing else in this suite reads them either.
function poolColumnsOf(row: {
  resourceKey?: string | null;
  resourceLabel?: string | null;
  resourceRecharge?: string | null;
  resourceTotals?: unknown;
  resourceOnInitiative?: unknown;
}): string {
  return JSON.stringify({
    resourceKey: row.resourceKey ?? null,
    resourceLabel: row.resourceLabel ?? null,
    resourceRecharge: row.resourceRecharge ?? null,
    resourceTotals: row.resourceTotals ?? null,
    resourceOnInitiative: row.resourceOnInitiative ?? null,
  });
}

// (lowercased className, subclassSlug or "null", name, edition) -> row. Keyed
// on all four because a name can legitimately exist under both editions with
// different text (that IS the retab), and under both a base class and one of
// its subclasses.
const SEED_BY_KEY = new Map<string, SeedRow>(
  CLASS_FEATURES.map((row) => [
    `${row.className.toLowerCase()}::${row.subclassSlug ?? "null"}::${row.name}::${row.edition}`,
    { level: row.level, description: row.description, choiceColumns: choiceColumnsOf(row), poolColumns: poolColumnsOf(row) },
  ]),
);

interface FixtureRow {
  key: string;
  label: string;
  level: number;
  description: string;
  choiceColumns: string;
  poolColumns: string;
}

function collectFixtureRows(): FixtureRow[] {
  const out: FixtureRow[] = [];

  for (const [classKey, rows] of Object.entries(LITERAL_CLASS_ROWS)) {
    for (const row of rows) {
      out.push({
        key: `${classKey}::null::${row.name}::${row.edition}`,
        label: `LITERAL_CLASS_ROWS[${classKey}] "${row.name}" (${row.edition})`,
        level: row.level,
        description: row.description,
        choiceColumns: choiceColumnsOf(row),
        poolColumns: poolColumnsOf(row),
      });
    }
  }

  for (const [nameKey, rows] of Object.entries(LITERAL_SUBCLASS_ROWS)) {
    const slug = SLUG_BY_NAME_KEY.get(nameKey);
    // A fixture subclass key with no SUBCLASS_IDENTITY entry is itself a bug
    // (the maps are supposed to name the same 31 subclasses), so surface it as
    // an unresolvable key rather than skipping it into a silent pass.
    const classKey = slug ? SUBCLASS_IDENTITY[slug as keyof typeof SUBCLASS_IDENTITY].classKey : "<unknown-class>";
    for (const row of rows) {
      out.push({
        key: `${classKey}::${slug ?? "<unknown-slug>"}::${row.name}::${row.edition}`,
        label: `LITERAL_SUBCLASS_ROWS["${nameKey}"] "${row.name}" (${row.edition})`,
        level: row.level,
        description: row.description,
        choiceColumns: choiceColumnsOf(row),
        poolColumns: poolColumnsOf(row),
      });
    }
  }

  return out;
}

describe("literal-row fixture parity (#1593)", () => {
  // Anti-vacuity: an empty fixture map, or a join producing nothing, would
  // still pass every assertion below by iterating nothing. Floors sit just
  // under the real merged count, re-measured on the merged tree (never
  // carried over from a branch) — tune UPWARD as classes go literal, and only
  // ever DOWNWARD with the reason recorded here.
  it("the fixture actually mirrors something — non-vacuity floor", () => {
    const rows = collectFixtureRows();
    expect(rows.length).toBeGreaterThanOrEqual(255);
    expect(Object.keys(LITERAL_CLASS_ROWS).length).toBeGreaterThanOrEqual(9);
    expect(Object.keys(LITERAL_SUBCLASS_ROWS).length).toBeGreaterThanOrEqual(13);
    expect(SEED_BY_KEY.size).toBe(CLASS_FEATURES.length);
  });

  // Reports EVERY mismatch at once rather than failing on the first — a wave
  // that touches several classes wants the whole list, not one row per
  // re-run. Pool columns joined the check alongside choice columns since
  // nothing else in this repo compares the two sides' pool shape.
  it("every fixture row's description, level, choice columns, and pool columns match its seed row exactly", () => {
    const mismatches: string[] = [];

    for (const row of collectFixtureRows()) {
      const seed = SEED_BY_KEY.get(row.key);
      if (!seed) continue; // orphans are the next test's job

      if (seed.description !== row.description) {
        mismatches.push(
          `${row.label}: description drifted\n    fixture: ${row.description}\n    seed:    ${seed.description}`,
        );
      }
      if (seed.level !== row.level) {
        mismatches.push(`${row.label}: level ${row.level} in fixture, ${seed.level} in seed`);
      }
      if (seed.choiceColumns !== row.choiceColumns) {
        mismatches.push(`${row.label}: choice columns drifted\n    fixture: ${row.choiceColumns}\n    seed:    ${seed.choiceColumns}`);
      }
      if (seed.poolColumns !== row.poolColumns) {
        mismatches.push(`${row.label}: pool columns drifted\n    fixture: ${row.poolColumns}\n    seed:    ${seed.poolColumns}`);
      }
    }

    expect(mismatches, `fixture/seed drift:\n  ${mismatches.join("\n  ")}`).toEqual([]);
  });

  // Deliberately NOT asserted: seed ⊆ fixture. The fixture mirrors only what a
  // `.resources`-observing test needs, so completeness would fail today for
  // correct reasons (Rogue absent by design, Barbarian's two subclasses with no
  // entry) and force busywork on every future retab.
  //
  // The two LITERAL_ROW_CLASSES sets differ in CASE, not just location: the
  // prisma-side one is Title Case ("Fighter"), the src-side one lowercase.
  // That is exactly the divergence their separate existence invites, so
  // normalise rather than comparing them raw.
  it("every class the fixture mirrors is a LITERAL_ROW_CLASSES member", () => {
    const literal = new Set([...LITERAL_ROW_CLASSES].map((c) => c.toLowerCase()));
    const strays = Object.keys(LITERAL_CLASS_ROWS).filter((c) => !literal.has(c.toLowerCase()));
    expect(strays, `fixture mirrors non-literal class(es): ${strays.join(", ")}`).toEqual([]);
  });
});

describe("literal-row fixture parity — orphans (#1593)", () => {
  // The rename case: a feature renamed in the seed leaves a stale mirror the
  // content check above never visits, because it joins on the name. Without
  // this, a mirror can rot indefinitely while every other suite stays green.
  it("no fixture row is an orphan — every one resolves to a seed row", () => {
    const orphans = collectFixtureRows()
      .filter((row) => !SEED_BY_KEY.has(row.key))
      .map((row) => `${row.label} -> no seed row at ${row.key}`);

    expect(orphans, `orphaned fixture rows:\n  ${orphans.join("\n  ")}`).toEqual([]);
  });
});
