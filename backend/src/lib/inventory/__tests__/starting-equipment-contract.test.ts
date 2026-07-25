/**
 * STARTING_EQUIPMENT is now annotated with the shared ClassStartingEquipment the
 * frontend reads off GET /api/reference (#1273), so tsc covers its shape. What
 * the type cannot express is that an empty choice group renders as an
 * unanswerable creation step — `options: EquipmentBundle[]` permits `[]`.
 */

import { describe, expect, it } from "vitest";

import { STARTING_EQUIPMENT } from "../starting-equipment.js";

describe("starting equipment contract", () => {
  it("gives every choice group at least one selectable bundle", () => {
    for (const [className, pkg] of Object.entries(STARTING_EQUIPMENT)) {
      for (const group of pkg.groups) {
        expect(group.options.length, `${className} · ${group.label}`).toBeGreaterThan(0);
      }
    }
  });
});
