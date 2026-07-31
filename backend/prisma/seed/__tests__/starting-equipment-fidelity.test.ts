// NO database — pure transcription-fidelity check (#1519/#1533). This test
// can only exist while backend/src/lib/inventory/starting-equipment.ts's
// STARTING_EQUIPMENT is still present — #1534 deletes that module, so the
// guarantee it gives (the seeded content is byte-for-byte the same as what
// ships today) can only be proven HERE, not after the reader PR lands.
import { describe, it, expect } from "vitest";

import { STARTING_EQUIPMENT } from "@/lib/inventory/starting-equipment.js";

import { STARTING_EQUIPMENT_PACKAGES } from "../starting-equipment.js";

function pkgFor(className: string, edition: "EDITION_2014" | "EDITION_2024") {
  const row = STARTING_EQUIPMENT_PACKAGES.find((r) => r.className === className && r.edition === edition);
  if (!row) throw new Error(`no STARTING_EQUIPMENT_PACKAGES row for ${className}/${edition}`);
  return row.package;
}

const CLASSES = [
  "Fighter",
  "Wizard",
  "Rogue",
  "Cleric",
  "Barbarian",
  "Bard",
  "Druid",
  "Monk",
  "Paladin",
  "Ranger",
  "Sorcerer",
  "Warlock",
] as const;

describe("STARTING_EQUIPMENT_PACKAGES — transcription fidelity (#1533)", () => {
  it.each(CLASSES)("%s's EDITION_2014 package equals STARTING_EQUIPMENT[%s] exactly", (className) => {
    expect(pkgFor(className, "EDITION_2014")).toEqual(STARTING_EQUIPMENT[className]);
  });

  it.each(CLASSES)("%s's EDITION_2024 package equals its own EDITION_2014 half (interim copy)", (className) => {
    expect(pkgFor(className, "EDITION_2024")).toEqual(pkgFor(className, "EDITION_2014"));
  });

  it("covers exactly the twelve classes, twice each (24 entries)", () => {
    expect(STARTING_EQUIPMENT_PACKAGES).toHaveLength(24);
    expect(new Set(STARTING_EQUIPMENT_PACKAGES.map((r) => r.className)).size).toBe(12);
  });

  // Mutation proof (drop one Fighter group) — reverted after confirming red;
  // transcript kept in the PR description rather than as a skipped test.
  it("a dropped group would be caught (documented, not asserted structurally)", () => {
    const fighter = pkgFor("Fighter", "EDITION_2014");
    const mutated = { ...fighter, groups: fighter.groups.slice(1) };
    expect(mutated).not.toEqual(STARTING_EQUIPMENT.Fighter);
  });
});
