import { describe, expect, it } from "vitest";

import { readInventorySnapshot } from "../inventory-snapshot-read.js";

const VALID_SNAPSHOT = {
  version: 1,
  name: "Dagger",
  category: "weapon",
  weight: 1,
  cost: { cp: 0, sp: 0, gp: 2, pp: 0 },
  description: null,
  slot: "MAIN_HAND",
  rarity: null,
  requiresAttunement: false,
  attunementPrereqKind: null,
  attunementPrereqValue: null,
  weapon: null,
  armor: null,
  consumable: null,
  capabilities: [],
};

describe("readInventorySnapshot (#1649)", () => {
  it("parses a well-formed snapshot", () => {
    const parsed = readInventorySnapshot({ id: "row-1", snapshot: VALID_SNAPSHOT });
    expect(parsed.name).toBe("Dagger");
    expect(parsed.capabilities).toEqual([]);
  });

  it("throws with the row id in the message when the blob is malformed", () => {
    const malformed = { ...VALID_SNAPSHOT, name: "" }; // name: z.string().min(1)
    expect(() => readInventorySnapshot({ id: "row-bad-1", snapshot: malformed })).toThrow(/row-bad-1/);
  });

  it("throws with the row id in the message when the blob is missing entirely", () => {
    expect(() => readInventorySnapshot({ id: "row-bad-2", snapshot: null })).toThrow(/row-bad-2/);
  });

  it("throws with the row id in the message when the blob isn't even an object", () => {
    expect(() => readInventorySnapshot({ id: "row-bad-3", snapshot: "not a snapshot" })).toThrow(/row-bad-3/);
  });
});
