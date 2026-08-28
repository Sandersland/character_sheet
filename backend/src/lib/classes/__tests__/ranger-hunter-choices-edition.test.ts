import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { loadDbFeatureRows } from "./db-feature-rows.fixture.js";

const ABILITY_SCORES = { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10 };

// Sorted by key: loadDbFeatureRows' findMany carries no orderBy (db-feature-
// rows.fixture.ts), so row order — and therefore choicesFromRows' output
// order — isn't a guarantee this test should pin.
function choicesAt(
  featureRows: Awaited<ReturnType<typeof loadDbFeatureRows>>,
  level: number,
  edition: "EDITION_2014" | "EDITION_2024",
) {
  const info = deriveResources("ranger", "hunter", level, ABILITY_SCORES, proficiencyBonusForLevel(level), featureRows, edition);
  return [...(info?.subclassChoices ?? [])].sort((a, b) => a.key.localeCompare(b.key));
}

describe("2014 Hunter subclassChoices trajectory: pinned parity against the pre-retab TS declaration", () => {
  it("levels 2, 3, 7, 11, 15, 20 deep-equal the deleted def's four-tier shape", async () => {
    const featureRows = await loadDbFeatureRows("ranger", "hunter");

    expect(choicesAt(featureRows, 2, "EDITION_2014")).toEqual([]);
    expect(choicesAt(featureRows, 3, "EDITION_2014")).toEqual([
      { key: "huntersPrey", label: "Hunter's Prey", catalogSource: "huntersPrey", count: 1 },
    ]);
    expect(choicesAt(featureRows, 7, "EDITION_2014")).toEqual([
      { key: "defensiveTactics", label: "Defensive Tactics", catalogSource: "defensiveTactics", count: 1 },
      { key: "huntersPrey", label: "Hunter's Prey", catalogSource: "huntersPrey", count: 1 },
    ]);
    expect(choicesAt(featureRows, 11, "EDITION_2014")).toEqual([
      { key: "defensiveTactics", label: "Defensive Tactics", catalogSource: "defensiveTactics", count: 1 },
      { key: "hunterMultiattack", label: "Multiattack", catalogSource: "hunterMultiattack", count: 1 },
      { key: "huntersPrey", label: "Hunter's Prey", catalogSource: "huntersPrey", count: 1 },
    ]);
    const fullFourTierSet = [
      { key: "defensiveTactics", label: "Defensive Tactics", catalogSource: "defensiveTactics", count: 1 },
      { key: "hunterMultiattack", label: "Multiattack", catalogSource: "hunterMultiattack", count: 1 },
      { key: "huntersPrey", label: "Hunter's Prey", catalogSource: "huntersPrey", count: 1 },
      { key: "superiorHuntersDefense", label: "Superior Hunter's Defense", catalogSource: "superiorHuntersDefense", count: 1 },
    ];
    expect(choicesAt(featureRows, 15, "EDITION_2014")).toEqual(fullFourTierSet);
    expect(choicesAt(featureRows, 20, "EDITION_2014")).toEqual(fullFourTierSet);
  });
});

describe("2024 Hunter subclassChoices trajectory: RED-FIRST — the ruled edition fix, new behavior vs the deleted TS def", () => {
  it("levels 3, 7, 11, 15, 20 offer ONLY huntersPrey/defensiveTactics — hunterMultiattack/superiorHuntersDefense never appear (the deleted def offered all four, unconditionally, at every edition)", async () => {
    const featureRows = await loadDbFeatureRows("ranger", "hunter");

    expect(choicesAt(featureRows, 3, "EDITION_2024")).toEqual([
      { key: "huntersPrey", label: "Hunter's Prey", catalogSource: "huntersPrey", count: 1 },
    ]);
    const atL7 = [
      { key: "defensiveTactics", label: "Defensive Tactics", catalogSource: "defensiveTactics", count: 1 },
      { key: "huntersPrey", label: "Hunter's Prey", catalogSource: "huntersPrey", count: 1 },
    ];
    expect(choicesAt(featureRows, 7, "EDITION_2024")).toEqual(atL7);
    expect(choicesAt(featureRows, 11, "EDITION_2024")).toEqual(atL7);
    expect(choicesAt(featureRows, 15, "EDITION_2024")).toEqual(atL7);
    expect(choicesAt(featureRows, 20, "EDITION_2024")).toEqual(atL7);
  });
});
