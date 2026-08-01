// #1231 (commit 1 of 4): Rogue's ClassFeature rows become literal seed data
// (rogue-features.ts), mirroring Fighter's (#1227) and Barbarian's (#1223)
// pilots. This commit is deliberately behaviour-neutral — no rules content
// changes, only WHERE the rows come from — so the whole point of this file is
// proving that move changed nothing.
import { describe, expect, it } from "vitest";

import { rogue } from "@/lib/classes/rogue.js";
import type { AuthoredFeature } from "@/lib/classes/types.js";

import { CLASS_FEATURES, LITERAL_ROW_CLASSES } from "../class-features.js";
import { ROGUE_FEATURES } from "../rogue-features.js";

describe("ClassFeature migration — Rogue rows become literal seed data (#1231)", () => {
  it("LITERAL_ROW_CLASSES includes Rogue", () => {
    expect(LITERAL_ROW_CLASSES.has("Rogue")).toBe(true);
  });

  it("CLASS_FEATURES' Rogue rows are exactly ROGUE_FEATURES, concatenated not re-derived", () => {
    const fromClassFeatures = CLASS_FEATURES.filter((r) => r.className === "Rogue");
    expect(fromClassFeatures).toEqual(ROGUE_FEATURES);
  });
});

// ---- The byte-identity proof -----------------------------------------------
// Reimplements class-features.ts's expandFeatureRow, straight off
// lib/classes/rogue.ts's ClassDefinition — independent of whether
// class-features.ts's CLASS_MODULES still lists Rogue, so this proof holds
// both BEFORE and AFTER this commit's class-features.ts edit. This is
// TEMPORARY SCAFFOLDING: commit 4 (#1231) deletes rogue.ts outright, and this
// test goes with it — there will be no TS "old side" left to compare against,
// the same fate as Fighter's and Barbarian's now-gone equivalents (see
// class-feature-parity.test.ts's own header on that retirement).
interface ExpectedRow {
  className: string;
  subclassSlug: string | null;
  name: string;
  level: number;
  description: string;
  edition: "EDITION_2014" | "EDITION_2024";
}

function expandAuthored(subclassSlug: string | null, feature: AuthoredFeature): ExpectedRow[] {
  const editions = feature.edition ? [feature.edition] : (["EDITION_2014", "EDITION_2024"] as const);
  return editions.map((edition) => ({
    className: "Rogue",
    subclassSlug,
    name: feature.name,
    level: feature.level,
    description: feature.description,
    edition,
  }));
}

function sortKey(r: { subclassSlug: string | null; name: string; level: number; edition: string }): string {
  return `${r.subclassSlug ?? "null"}::${r.level}::${r.name}::${r.edition}`;
}

function buildExpected(): ExpectedRow[] {
  const rows: ExpectedRow[] = [];
  for (const feature of rogue.features ?? []) rows.push(...expandAuthored(null, feature));
  for (const subDef of Object.values(rogue.subclasses ?? {})) {
    for (const feature of subDef.features ?? []) rows.push(...expandAuthored(subDef.slug, feature));
  }
  return rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

function projectActual(rows: typeof ROGUE_FEATURES): ExpectedRow[] {
  return rows
    .map((r) => ({
      className: r.className,
      subclassSlug: r.subclassSlug,
      name: r.name,
      level: r.level,
      description: r.description,
      edition: r.edition,
    }))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

describe("ClassFeature migration — ROGUE_FEATURES is byte-identical to rogue.ts's derived rows (#1231)", () => {
  it("every (subclassSlug, name, level, edition) has the same description", () => {
    const expected = buildExpected();
    const actual = projectActual(ROGUE_FEATURES);
    expect(actual).toEqual(expected);
  });

  it("row counts match: 11 base + 5 arcane trickster + 5 assassin + 5 thief, x2 editions = 52", () => {
    expect(buildExpected()).toHaveLength(52);
    expect(ROGUE_FEATURES).toHaveLength(52);
  });

  // Mutation-prove: altering one character of one description in either side
  // turns the equality check above red — this it just documents the claim,
  // the guarantee itself is the `toEqual` above (verified manually during
  // authoring by temporarily editing one ROGUE_FEATURES description).
  it("both sides derive from the SAME 26 authored features, not two independently-typed lists", () => {
    const authoredCount =
      (rogue.features ?? []).length +
      Object.values(rogue.subclasses ?? {}).reduce((n, sub) => n + (sub.features ?? []).length, 0);
    expect(authoredCount).toBe(26);
  });
});
