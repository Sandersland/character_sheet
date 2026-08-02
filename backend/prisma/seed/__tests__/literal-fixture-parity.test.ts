// #1593: the LITERAL_ROW_CLASSES fixture mirrors the literal seed files, and
// until this suite existed NOTHING enforced that the two agree.
//
// The drift this catches shipped once already: #1232 corrected two fabricated
// EDITION_2024 Draconic descriptions in sorcerer-features.ts and left
// test-feature-rows.fixture.ts carrying the old text. The full backend suite,
// fallow, e2e and a clean claude-review all passed on that state, because the
// three suites that could have noticed each look elsewhere by design —
// class-feature-parity.test.ts `continue`s on LITERAL_ROW_CLASSES, the
// per-class content tests (sorcerer-2024-content.test.ts and friends) read the
// DB rather than the fixture, and class-features-snapshot.test.ts strips
// `.features` before snapshotting.
//
// Lives on the PRISMA side because it has to import both halves and only this
// direction compiles: backend/tsconfig.json's `rootDir: "src"` makes a src file
// importing anything under prisma/ a TS6059 error, which is the same constraint
// that forces the two LITERAL_ROW_CLASSES sets to be maintained separately in
// the first place. Importing the fixture is side-effect free — it is a plain
// module with no describe/it of its own, deliberately (see its own header).
import { describe, expect, it } from "vitest";

import {
  LITERAL_CLASS_ROWS,
  LITERAL_SUBCLASS_ROWS,
} from "@/lib/classes/__tests__/test-feature-rows.fixture.js";
import { SUBCLASS_IDENTITY } from "@/lib/classes/subclass-slug.js";

import { CLASS_FEATURES, LITERAL_ROW_CLASSES } from "../class-features.js";

// The fixture keys subclass rows by lowercase NAME ("life domain") while
// CLASS_FEATURES carries subclassSlug ("cleric-life-domain"). SUBCLASS_IDENTITY
// is the join. Matching on a substring or endsWith of the slug instead is the
// trap here — it silently mismatches, and `nameKey` is precisely what the
// fixture is keyed on.
const SLUG_BY_NAME_KEY = new Map(
  Object.entries(SUBCLASS_IDENTITY).map(([slug, identity]) => [identity.nameKey, slug]),
);

interface SeedRow {
  level: number;
  description: string;
}

// (lowercased className, subclassSlug or "null", name, edition) -> row. Keyed
// on all four because a name can legitimately exist under both editions with
// different text (that IS the retab), and under both a base class and one of
// its subclasses.
const SEED_BY_KEY = new Map<string, SeedRow>(
  CLASS_FEATURES.map((row) => [
    `${row.className.toLowerCase()}::${row.subclassSlug ?? "null"}::${row.name}::${row.edition}`,
    { level: row.level, description: row.description },
  ]),
);

interface FixtureRow {
  key: string;
  label: string;
  level: number;
  description: string;
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
      });
    }
  }

  return out;
}

// The ten EDITION_2024 rows this guard finds that the real seed does NOT have,
// sanctioned deliberately rather than silently tolerated. #1233 tagged The
// Archfey and The Great Old One EDITION_2014 and authored zero 2024 rows (no
// licensed source could verify their PHB'24 reworks), so a 2024 character
// cannot pick either patron at all. THE_ARCHFEY_ROWS/THE_GREAT_OLD_ONE_ROWS
// nevertheless build both editions from one flatMap template, because several
// subclass-grant-level.test.ts cases (#1128) derive these two patrons at
// EDITION_2024 explicitly and would otherwise go red.
//
// That makes those cases assert a state production forbids, which is a
// test-design problem in subclass-grant-level.test.ts, NOT drift in the
// fixture — so fixing it is #1595, not this issue. Listed row-by-row rather
// than pattern-matched so the list cannot quietly absorb a genuine orphan, and
// so deleting it is a one-line change once #1595 lands.
const SANCTIONED_ORPHANS: ReadonlySet<string> = new Set([
  "warlock::warlock-the-archfey::Expanded Spell List::EDITION_2024",
  "warlock::warlock-the-archfey::Fey Presence::EDITION_2024",
  "warlock::warlock-the-archfey::Misty Escape::EDITION_2024",
  "warlock::warlock-the-archfey::Beguiling Defenses::EDITION_2024",
  "warlock::warlock-the-archfey::Dark Delirium::EDITION_2024",
  "warlock::warlock-the-great-old-one::Expanded Spell List::EDITION_2024",
  "warlock::warlock-the-great-old-one::Awakened Mind::EDITION_2024",
  "warlock::warlock-the-great-old-one::Entropic Ward::EDITION_2024",
  "warlock::warlock-the-great-old-one::Thought Shield::EDITION_2024",
  "warlock::warlock-the-great-old-one::Create Thrall::EDITION_2024",
]);

describe("literal-row fixture parity (#1593)", () => {
  // Anti-vacuity: if the fixture maps were empty (or the join produced nothing)
  // every assertion below would pass by iterating nothing. Eleven classes are
  // literal as of wave C (#1224/#1226/#1229), and the fixture mirrors nine of
  // them — Rogue and Bard are deliberately absent entirely, since neither
  // declares a resourceKey/derivedStat the fixture must carry and no surviving
  // test asserts a null-vs-object distinction against either (see the
  // fixture's own header).
  //
  // RE-MEASURED on the merged wave-C tree, never carried over from a branch.
  // #1226 measured 241 rows / 8 classes / 13 subclasses and #1229 measured
  // 230 / 8 / 11, each correct for its own branch ALONE — taking the incoming
  // side would have LOWERED the row floor 238 -> 220 and the subclass floor
  // 13 -> 11, the exact silent weakening this comment exists to warn about.
  // Paladin's base-class rows join LITERAL_CLASS_ROWS; its three Oaths are
  // deliberately absent from LITERAL_SUBCLASS_ROWS, the same exemption shape as
  // Barbarian's two subclasses (see PALADIN_BASE_ROWS' own comment in
  // test-feature-rows.fixture.ts). The floors sit just under the real merged
  // count, not an order of magnitude under — a loose floor passes a bad merge
  // that drops most of the fixture, which would defeat every assertion below
  // while staying green. Tune these UPWARD as classes go literal; only ever
  // tune one DOWNWARD with the reason recorded here (the
  // class-feature-population.test.ts idiom).
  it("the fixture actually mirrors something — non-vacuity floor", () => {
    const rows = collectFixtureRows();
    expect(rows.length).toBeGreaterThanOrEqual(265);
    expect(Object.keys(LITERAL_CLASS_ROWS).length).toBeGreaterThanOrEqual(9);
    expect(Object.keys(LITERAL_SUBCLASS_ROWS).length).toBeGreaterThanOrEqual(13);
    expect(SEED_BY_KEY.size).toBe(CLASS_FEATURES.length);
  });

  // The drift #1232 shipped. Reports EVERY mismatch at once rather than
  // failing on the first — a wave that touches several classes wants the whole
  // list, not one row per re-run.
  it("every fixture row's description and level match its seed row exactly", () => {
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
      .filter((row) => !SEED_BY_KEY.has(row.key) && !SANCTIONED_ORPHANS.has(row.key))
      .map((row) => `${row.label} -> no seed row at ${row.key}`);

    expect(orphans, `orphaned fixture rows:\n  ${orphans.join("\n  ")}`).toEqual([]);
  });

  // Keeps SANCTIONED_ORPHANS honest in both directions: every entry must STILL
  // be a real orphan. Once #1595 retargets those cases to EDITION_2014 and the
  // fabricated rows go, this fails and the set must be emptied — the allowlist
  // cannot outlive the deviation it documents.
  it("every sanctioned orphan is still genuinely absent from the seed", () => {
    const stale = [...SANCTIONED_ORPHANS].filter((key) => SEED_BY_KEY.has(key));
    expect(
      stale,
      `SANCTIONED_ORPHANS entries the seed now HAS — delete them from the set (#1595):\n  ${stale.join("\n  ")}`,
    ).toEqual([]);
  });
});
