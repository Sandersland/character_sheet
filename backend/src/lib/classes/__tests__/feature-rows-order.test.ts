/**
 * The only test in the repo that can SEE `FEATURE_ROWS_ORDER_BY`'s `edition`
 * key (#1545). Every production consumer — `featuresFromRows`, `poolsFromRows`,
 * `derivedStatFromRows`, `actionsFromRows`, `eligibleRowActions` — filters to
 * the character's own edition before it reads a row's position, so a
 * cross-edition tie collapses to one surviving row and the key is unobservable
 * downstream BY CONSTRUCTION. This file reads the relation through the exported
 * fragment BEFORE any edition filter, which is what makes the key falsifiable
 * at all.
 *
 * The fixture's insert order deliberately contradicts `(level, name, edition)`
 * on all three keys, including one pair tied on `(level, name)` inserted
 * 2024-before-2014. That is load-bearing: an insert order that already equalled
 * sorted order passes even under an EMPTY `orderBy`, because Postgres returns
 * heap order for a small freshly-written table — which is exactly why #1545's
 * original "set the array to `[]`" proof was unsatisfiable.
 *
 * Latch: if `FEATURE_ROWS_ORDER_BY` gains, loses or reorders a key, the
 * expected sequences here move with it.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RulesEdition } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { characterInclude } from "@/lib/character/character-include.js";

import {
  FEATURE_ROWS_CLASS_FEATURES,
  FEATURE_ROWS_ENTRY_SELECT,
  FEATURE_ROWS_ORDER_BY,
  FEATURE_ROWS_SUBCLASS_FEATURES,
} from "../feature-rows-select.js";

const CLASS_NAME = "Order Probe Class";
const SUBCLASS_NAME = "Order Probe Subclass";

/**
 * `edition` is a Postgres enum, so `asc` sorts by DECLARATION order in
 * schema.prisma, NOT lexicographically. The two happen to coincide today; a
 * future edition declared out of alphabetical order would not, so the expected
 * order is spelled from the declaration rather than from string comparison.
 */
const EDITION_RANK: RulesEdition[] = ["EDITION_2014", "EDITION_2024"];

type ProbeRow = { name: string; level: number; edition: RulesEdition };

/**
 * Insert order contradicts every sort key at once: `Gamma`(L2) before three L1
 * rows, `Beta` before `Alpha`, and the tied `Beta` pair 2024-before-2014. Level
 * is NOT part of `@@unique([classId, subclassId, name, edition])`, so the two
 * `Beta` rows are legal twins and the edition key is the ONLY thing that can
 * fix their relative order.
 */
const INSERT_ORDER: ProbeRow[] = [
  { name: "Gamma Probe", level: 2, edition: "EDITION_2024" },
  { name: "Beta Probe", level: 1, edition: "EDITION_2024" },
  { name: "Beta Probe", level: 1, edition: "EDITION_2014" },
  { name: "Alpha Probe", level: 1, edition: "EDITION_2024" },
];

const SORTED_ORDER: ProbeRow[] = [
  { name: "Alpha Probe", level: 1, edition: "EDITION_2024" },
  { name: "Beta Probe", level: 1, edition: "EDITION_2014" },
  { name: "Beta Probe", level: 1, edition: "EDITION_2024" },
  { name: "Gamma Probe", level: 2, edition: "EDITION_2024" },
];

function compareKeys(a: ProbeRow, b: ProbeRow): number {
  if (a.level !== b.level) return a.level - b.level;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return EDITION_RANK.indexOf(a.edition) - EDITION_RANK.indexOf(b.edition);
}

const projected = (rows: ProbeRow[]): ProbeRow[] =>
  rows.map(({ name, level, edition }) => ({ name, level, edition }));

let classId: string;
let subclassId: string;

describe("FEATURE_ROWS_ORDER_BY is a total order over the raw, pre-filter result set (#1545)", () => {
  beforeAll(async () => {
    // Bespoke catalog rows, never the seeded ones: this fixture writes
    // deliberately malformed content (twin rows differing only by edition) that
    // no real class has, and a seeded row mutated here would leak into every
    // other file sharing this worker's database.
    const characterClass = await prisma.characterClass.create({
      data: {
        name: CLASS_NAME,
        hitDie: "d8",
        savingThrows: ["strength"],
        skillChoiceCount: 1,
        skillChoices: ["athletics"],
        subclassLevel: 3,
      },
    });
    classId = characterClass.id;

    const subclass = await prisma.subclass.create({
      data: {
        classId,
        name: SUBCLASS_NAME,
        description: "Order probe fixture.",
        slug: "order-probe-subclass",
      },
    });
    subclassId = subclass.id;

    await prisma.classFeature.createMany({
      data: INSERT_ORDER.flatMap((row) => [
        { ...row, classId, subclassId: null, description: `${row.name} base` },
        { ...row, classId, subclassId, description: `${row.name} sub` },
      ]),
    });
  });

  afterAll(async () => {
    // ClassFeature and Subclass both cascade off CharacterClass.
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("returns a class's own rows in (level, name, edition) order through the exported fragment", async () => {
    const row = await prisma.characterClass.findUniqueOrThrow({
      where: { id: classId },
      select: FEATURE_ROWS_ENTRY_SELECT.class.select,
    });

    expect(projected(row.features)).toEqual(SORTED_ORDER);
  });

  it("returns a subclass's rows in (level, name, edition) order through the exported fragment", async () => {
    const row = await prisma.subclass.findUniqueOrThrow({
      where: { id: subclassId },
      select: FEATURE_ROWS_ENTRY_SELECT.subclassRef.select,
    });

    expect(projected(row.features)).toEqual(SORTED_ORDER);
  });

  it("orders both relations STRICTLY under the full comparator", async () => {
    // The property, not a literal: an order is total iff every adjacent pair
    // strictly increases under the full comparator. Pinning the arrays above
    // says WHAT the rows are; this says WHY the issue exists. Both relations
    // are walked because an incomplete sort key leaves the twin `Beta` rows
    // unordered *relative to each other* and Postgres is free to break that tie
    // differently per query — under `[{level},{name}]` this very fixture
    // returned 2014-first from the class relation and 2024-first from the
    // subclass relation in a single process (#1545).
    const [classRow, subclassRow] = await Promise.all([
      prisma.characterClass.findUniqueOrThrow({
        where: { id: classId },
        select: FEATURE_ROWS_ENTRY_SELECT.class.select,
      }),
      prisma.subclass.findUniqueOrThrow({
        where: { id: subclassId },
        select: FEATURE_ROWS_ENTRY_SELECT.subclassRef.select,
      }),
    ]);

    const violations = [
      ["class", projected(classRow.features)] as const,
      ["subclass", projected(subclassRow.features)] as const,
    ].flatMap(([relation, rows]) =>
      rows
        .slice(1)
        .filter((current, index) => compareKeys(rows[index], current) >= 0)
        .map((current) => `${relation}: ${current.name}/${current.level}/${current.edition}`),
    );

    expect(violations, "FEATURE_ROWS_ORDER_BY left two rows unordered").toEqual([]);
  });
});

describe("every feature-relation read carries FEATURE_ROWS_ORDER_BY (#1545)", () => {
  it("every relation argument in reach is the shared fragment object itself", () => {
    // `toBe`, not `toEqual`: a hand-written structural copy is exactly the
    // drift this guards, and a copy would silently pass a deep-equality check
    // while diverging on the next key added.
    expect(FEATURE_ROWS_CLASS_FEATURES.orderBy).toBe(FEATURE_ROWS_ORDER_BY);
    expect(FEATURE_ROWS_SUBCLASS_FEATURES.orderBy).toBe(FEATURE_ROWS_ORDER_BY);
    expect(FEATURE_ROWS_ENTRY_SELECT.class.select.features).toBe(FEATURE_ROWS_CLASS_FEATURES);
    expect(FEATURE_ROWS_ENTRY_SELECT.subclassRef.select.features).toBe(FEATURE_ROWS_SUBCLASS_FEATURES);
    expect(characterInclude.classEntries.include.class.select.features).toBe(FEATURE_ROWS_CLASS_FEATURES);
    expect(characterInclude.classEntries.include.subclassRef.include.features).toBe(FEATURE_ROWS_SUBCLASS_FEATURES);
  });

  it("no source line selects the features relation without it", () => {
    // Reference identity above can only reach the EXPORTED fragments. Five
    // call sites hand-roll an inline, non-exported select that no import-based
    // test can see: buildHpOpContext, SPELLCASTING_SELECT, TARGET_ENTRY_SELECT,
    // resolveNewTargetEntry and resolvePickedSubclass. They now name the
    // relation-level fragments, but only a source sweep can prove a NEW one
    // does too. #1528 shipped red-7-of-8 flake because one such site was missed.
    //
    // Scoped to the RELATION select deliberately. loadDbFeatureRows reads the
    // same rows through a top-level `classFeature.findMany` with no orderBy and
    // is the one unordered feature read left in the repo; adding one there is
    // NOT a no-op, because its callers compare derived resource arrays with
    // toEqual and a reorder can flip them. Left alone rather than silently
    // swept in (#1545).
    const root = path.resolve(import.meta.dirname, "../../..");

    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "generated" ? [] : walk(full);
        return entry.name.endsWith(".ts") ? [full] : [];
      });
    }

    const offenders = walk(root).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          /\bfeatures:\s*\{/.test(line) && !line.includes("orderBy: FEATURE_ROWS_ORDER_BY")
            ? [`${path.relative(root, file)}:${index + 1}`]
            : [],
        ),
    );

    expect(
      offenders,
      "name FEATURE_ROWS_CLASS_FEATURES / FEATURE_ROWS_SUBCLASS_FEATURES instead of an inline select — see #1545",
    ).toEqual([]);
  });
});
