import { describe, expect, it } from "vitest";

import { getSheetTabs, resolveActiveTab } from "@/features/character-meta/sheetTabs";
import type { Character } from "@/types/character";

function makeCharacter(partial: Partial<Character>): Character {
  return { id: "c1", ...partial } as unknown as Character;
}

const caster = makeCharacter({ spellcasting: { ability: "intelligence" } as never });
const nonCaster = makeCharacter({ spellcasting: undefined });

// #1169: Class Features got its own tab (was dwarfing Overview on multiclass
// characters). Unlike Magic, it's not caster-gated — every character has a class.
describe("getSheetTabs Class tab (#1169)", () => {
  it("includes a Class tab, labeled 'Class', for casters and non-casters alike", () => {
    for (const character of [caster, nonCaster]) {
      const tabs = getSheetTabs(character);
      const classTab = tabs.find((t) => t.id === "class");
      expect(classTab).toBeDefined();
      expect(classTab?.label).toBe("Class");
    }
  });

  it("orders Class right after Overview", () => {
    const ids = getSheetTabs(nonCaster).map((t) => t.id);
    expect(ids.indexOf("class")).toBe(ids.indexOf("overview") + 1);
  });
});

describe("resolveActiveTab with the Class tab", () => {
  it("resolves ?tab=class to the class tab when available", () => {
    const tabs = getSheetTabs(nonCaster);
    expect(resolveActiveTab("class", tabs)).toBe("class");
  });
});
