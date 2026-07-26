import { describe, it, expect } from "vitest";

import {
  eventTypeLabel,
  categoryLabel,
  categoryTone,
  damageTypeTone,
  logToneClass,
  EVENT_TYPE_LABELS,
  INVENTORY_EVENT_TYPES,
} from "@/lib/events";

describe("eventTypeLabel", () => {
  it("maps a known single-word type to its label", () => {
    expect(eventTypeLabel("sold")).toBe("sold");
  });

  it("maps a known multi-word type to its label", () => {
    expect(eventTypeLabel("shortRest")).toBe("short rest");
    expect(eventTypeLabel("concentrationDropped")).toBe("concentration dropped");
  });

  it("maps newly-added types to clean labels", () => {
    expect(eventTypeLabel("subclassChosen")).toBe("Subclass chosen");
    expect(eventTypeLabel("spendResource")).toBe("Spend resource");
    expect(eventTypeLabel("conditionApplied")).toBe("Condition applied");
    expect(eventTypeLabel("sessionStarted")).toBe("Session started");
  });

  it("maps the roll types to clean labels (#128)", () => {
    expect(eventTypeLabel("attackRoll")).toBe("Attack roll");
    expect(eventTypeLabel("checkRoll")).toBe("Ability check");
    expect(eventTypeLabel("saveRoll")).toBe("Saving throw");
    expect(eventTypeLabel("initiativeRoll")).toBe("Initiative");
  });

  it("degrades an unknown type to the raw key (no crash, no inline-capitalize)", () => {
    expect(eventTypeLabel("someFutureType")).toBe("someFutureType");
  });
});

describe("categoryLabel", () => {
  it("maps a known category to a human label", () => {
    expect(categoryLabel("hitPoints")).toBe("Hit Points");
  });

  it("maps the newly-added categories to human labels", () => {
    expect(categoryLabel("advancement")).toBe("Advancement");
    expect(categoryLabel("session")).toBe("Session");
    expect(categoryLabel("conditions")).toBe("Conditions");
    expect(categoryLabel("roll")).toBe("Rolls");
  });

  it("degrades an unknown category to the raw key", () => {
    expect(categoryLabel("brandNew")).toBe("brandNew");
  });
});

describe("categoryTone", () => {
  it("maps a known category to its badge tone", () => {
    expect(categoryTone("inventory")).toBe("gold");
    expect(categoryTone("roll")).toBe("garnet");
  });

  it("falls back to neutral for an unknown category", () => {
    // Exercised with an off-union value to prove the tolerant fallback.
    expect(categoryTone("mystery" as never)).toBe("neutral");
  });
});

describe("damageTypeTone (#1237 chat-log color table)", () => {
  it("resolves every elemental/energy damage type to a distinct tone class", () => {
    const types = [
      "fire", "cold", "lightning", "acid", "poison",
      "necrotic", "radiant", "force", "psychic", "thunder",
    ];
    const classes = types.map((t) => damageTypeTone(t));
    for (const c of classes) expect(c).toMatch(/^text-dmg-/);
    // Every type gets its OWN hue — no two share a class (a full, non-aliased set).
    expect(new Set(classes).size).toBe(types.length);
  });

  it("returns null for a physical damage type (stays neutral ink, mockup spec)", () => {
    expect(damageTypeTone("piercing")).toBeNull();
    expect(damageTypeTone("slashing")).toBeNull();
    expect(damageTypeTone("bludgeoning")).toBeNull();
  });

  it("returns null for an unknown or absent damage type", () => {
    expect(damageTypeTone("madeUpType")).toBeNull();
    expect(damageTypeTone(undefined)).toBeNull();
    expect(damageTypeTone(null)).toBeNull();
  });
});

describe("logToneClass (#1237 chat-log semantic tone table)", () => {
  it("maps every log tone to a Tailwind text class", () => {
    expect(logToneClass("heal")).toBe("text-vitality-700");
    expect(logToneClass("resource")).toBe("text-gold-800");
    expect(logToneClass("harm")).toBe("text-garnet-700");
    expect(logToneClass("muted")).toBe("text-parchment-500");
    expect(logToneClass("default")).toBe("text-parchment-800");
  });
});

describe("INVENTORY_EVENT_TYPES", () => {
  it("lists inventory types and each has a label", () => {
    expect(INVENTORY_EVENT_TYPES).toContain("sold");
    for (const t of INVENTORY_EVENT_TYPES) {
      expect(EVENT_TYPE_LABELS[t]).toBeDefined();
    }
  });
});
