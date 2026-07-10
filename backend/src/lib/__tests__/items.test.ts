import { describe, expect, it } from "vitest";

import { isEquippable } from "@/lib/items.js";

describe("isEquippable", () => {
  it("treats weapons as equippable", () => {
    expect(isEquippable("weapon")).toBe(true);
  });

  it("treats armor as equippable", () => {
    expect(isEquippable("armor")).toBe(true);
  });

  it("treats gear as not equippable", () => {
    expect(isEquippable("gear")).toBe(false);
  });

  it("treats consumables as not equippable", () => {
    expect(isEquippable("consumable")).toBe(false);
  });
});
