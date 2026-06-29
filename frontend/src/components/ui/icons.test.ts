import { describe, expect, it } from "vitest";

import {
  ABILITY_ICONS,
  ITEM_CATEGORY_ICONS,
  GiQuillInk,
  GiKnapsack,
  GiSpellBook,
  GiHealthNormal,
} from "@/components/ui/icons";
import { ABILITY_ORDER } from "@/lib/abilities";
import { ITEM_CATEGORY_ORDER } from "@/lib/items";

describe("icon maps", () => {
  it("has an icon for every ability", () => {
    for (const key of ABILITY_ORDER) {
      expect(ABILITY_ICONS[key]).toBeDefined();
    }
  });

  it("has an icon for every item category", () => {
    for (const key of ITEM_CATEGORY_ORDER) {
      expect(ITEM_CATEGORY_ICONS[key]).toBeDefined();
    }
  });

  it("re-exports the hero icons", () => {
    expect(GiQuillInk).toBeDefined();
    expect(GiKnapsack).toBeDefined();
    expect(GiSpellBook).toBeDefined();
    expect(GiHealthNormal).toBeDefined();
  });
});
