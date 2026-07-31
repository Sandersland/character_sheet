// #1223 (commit 1 of 3): Barbarian's ClassFeature rows become literal seed
// data (barbarian-features.ts), mirroring Fighter's pilot (#1227/#1528/#1532).
// This commit is deliberately behaviour-neutral — no rules content changes,
// only WHERE the rows come from — so the whole point of this file is proving
// that move changed nothing.
import { describe, expect, it } from "vitest";

import { barbarian } from "@/lib/classes/barbarian.js";
import type { AuthoredFeature } from "@/lib/classes/types.js";

import { BARBARIAN_FEATURES } from "../barbarian-features.js";
import { CLASS_FEATURES, LITERAL_ROW_CLASSES } from "../class-features.js";

describe("ClassFeature migration — Barbarian rows become literal seed data (#1223)", () => {
  it("LITERAL_ROW_CLASSES includes Barbarian", () => {
    expect(LITERAL_ROW_CLASSES.has("Barbarian")).toBe(true);
  });

  it("CLASS_FEATURES' Barbarian rows are exactly BARBARIAN_FEATURES, concatenated not re-derived", () => {
    const fromClassFeatures = CLASS_FEATURES.filter((r) => r.className === "Barbarian");
    expect(fromClassFeatures).toEqual(BARBARIAN_FEATURES);
  });
});

// ---- The byte-identity proof -----------------------------------------------
// Reimplements class-features.ts's expandFeatureRow, straight off
// lib/classes/barbarian.ts's ClassDefinition — independent of whether
// class-features.ts's CLASS_MODULES still lists Barbarian, so this proof
// holds both BEFORE and AFTER this commit's class-features.ts edit. This is
// TEMPORARY SCAFFOLDING: commit 3 (#1223) deletes barbarian.ts outright, and
// this test goes with it — there will be no TS "old side" left to compare
// against, the same fate as Fighter's now-gone equivalent (see
// class-feature-parity.test.ts's own header on that retirement).
interface ExpectedRow {
  className: string;
  subclassSlug: string | null;
  name: string;
  level: number;
  description: string;
  edition: "EDITION_2014" | "EDITION_2024";
  derivedStat?: string;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
}

function expandAuthored(subclassSlug: string | null, feature: AuthoredFeature): ExpectedRow[] {
  const editions = feature.edition ? [feature.edition] : (["EDITION_2014", "EDITION_2024"] as const);
  return editions.map((edition) => ({
    className: "Barbarian",
    subclassSlug,
    name: feature.name,
    level: feature.level,
    description: feature.description,
    edition,
    derivedStat: feature.derivedStat,
    derivedStatTiers: feature.derivedStatTiers,
  }));
}

function sortKey(r: { subclassSlug: string | null; name: string; level: number; edition: string }): string {
  return `${r.subclassSlug ?? "null"}::${r.level}::${r.name}::${r.edition}`;
}

function buildExpected(): ExpectedRow[] {
  const rows: ExpectedRow[] = [];
  for (const feature of barbarian.features ?? []) rows.push(...expandAuthored(null, feature));
  for (const subDef of Object.values(barbarian.subclasses ?? {})) {
    for (const feature of subDef.features ?? []) rows.push(...expandAuthored(subDef.slug, feature));
  }
  return rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

function projectActual(rows: typeof BARBARIAN_FEATURES): ExpectedRow[] {
  return rows
    .map((r) => ({
      className: r.className,
      subclassSlug: r.subclassSlug,
      name: r.name,
      level: r.level,
      description: r.description,
      edition: r.edition,
      derivedStat: r.derivedStat,
      derivedStatTiers: r.derivedStatTiers,
    }))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

describe("ClassFeature migration — BARBARIAN_FEATURES is byte-identical to barbarian.ts's derived rows (#1223)", () => {
  it("every (subclassSlug, name, level, edition) has the same description, and derivedStat/derivedStatTiers survive on Extra Attack", () => {
    const expected = buildExpected();
    const actual = projectActual(BARBARIAN_FEATURES);
    expect(actual).toEqual(expected);
  });

  it("row counts match: 12 base + 5 totem warrior + 4 berserker, x2 editions = 42", () => {
    expect(buildExpected()).toHaveLength(42);
    expect(BARBARIAN_FEATURES).toHaveLength(42);
  });
});
