import { describe, it, expect } from "vitest";

import { buildSessionTabs, resolveActiveTab, remainingSpellSlots, sessionRecipients } from "@/lib/sessionTabs";
import type { Character, Session } from "@/types/character";

describe("buildSessionTabs", () => {
  it("shows only the base tabs for a classless non-caster non-owner", () => {
    const tabs = buildSessionTabs({ isCaster: false, hasClass: false, isOwner: false });
    expect(tabs.map((t) => t.id)).toEqual(["inventory", "rest", "log"]);
  });

  it("includes spells only when a caster", () => {
    const tabs = buildSessionTabs({ isCaster: true, hasClass: false, isOwner: false });
    expect(tabs.map((t) => t.id)).toContain("spells");
  });

  it("includes class only when the character has a class", () => {
    const tabs = buildSessionTabs({ isCaster: false, hasClass: true, isOwner: false });
    expect(tabs.map((t) => t.id)).toContain("class");
  });

  it("includes the owner-only loot tab last", () => {
    const tabs = buildSessionTabs({ isCaster: true, hasClass: true, isOwner: true });
    expect(tabs.map((t) => t.id)).toEqual([
      "inventory", "spells", "class", "rest", "log", "loot",
    ]);
  });
});

describe("remainingSpellSlots", () => {
  it("is 0 for a non-caster", () => {
    expect(remainingSpellSlots({} as Character)).toBe(0);
  });

  it("sums unspent slots across levels, clamping negatives", () => {
    const character = {
      spellcasting: { slots: [
        { total: 4, used: 1 },
        { total: 3, used: 3 },
        { total: 2, used: 5 },
      ] },
    } as Character;
    expect(remainingSpellSlots(character)).toBe(3);
  });
});

describe("sessionRecipients", () => {
  it("is empty when there are no participants", () => {
    expect(sessionRecipients({} as Session)).toEqual([]);
  });

  it("maps participants to id + name, defaulting a missing name to Unknown", () => {
    const session = {
      participants: [
        { characterId: "c1", character: { name: "Aria" } },
        { characterId: "c2" },
      ],
    } as Session;
    expect(sessionRecipients(session)).toEqual([
      { id: "c1", name: "Aria" },
      { id: "c2", name: "Unknown" },
    ]);
  });
});

describe("resolveActiveTab", () => {
  const tabs = buildSessionTabs({ isCaster: false, hasClass: false, isOwner: false });

  it("keeps the active tab when it's still present", () => {
    expect(resolveActiveTab(tabs, "rest")).toBe("rest");
  });

  it("falls back to inventory when the active tab was gated away", () => {
    expect(resolveActiveTab(tabs, "spells")).toBe("inventory");
  });
});
