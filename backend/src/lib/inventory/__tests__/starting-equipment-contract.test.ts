/**
 * Checks the STARTING_EQUIPMENT data literal against the shared declaration the
 * frontend reads off GET /api/reference (#1273). Previously the literal was only
 * checked against a backend-local type, so a shape the client couldn't render
 * would still compile — this is the ratchet the migration buys.
 */

import { describe, expect, expectTypeOf, it } from "vitest";

import { STARTING_EQUIPMENT } from "../starting-equipment.js";
import type { ClassStartingEquipment } from "@character-sheet/shared-types";

describe("starting equipment contract", () => {
  it("types every class package as the shared ClassStartingEquipment", () => {
    expectTypeOf(STARTING_EQUIPMENT).toEqualTypeOf<Record<string, ClassStartingEquipment>>();
    expect(Object.keys(STARTING_EQUIPMENT).length).toBeGreaterThan(0);
  });

  it("gives every choice group at least one selectable bundle", () => {
    for (const [className, pkg] of Object.entries(STARTING_EQUIPMENT)) {
      for (const group of pkg.groups) {
        expect(group.options.length, `${className} · ${group.label}`).toBeGreaterThan(0);
      }
    }
  });
});
