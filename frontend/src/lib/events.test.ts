import { describe, it, expect } from "vitest";

import {
  eventTypeLabel,
  categoryLabel,
  categoryTone,
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
  });

  it("degrades an unknown category to the raw key", () => {
    expect(categoryLabel("brandNew")).toBe("brandNew");
  });
});

describe("categoryTone", () => {
  it("maps a known category to its badge tone", () => {
    expect(categoryTone("inventory")).toBe("gold");
  });

  it("falls back to neutral for an unknown category", () => {
    // Exercised with an off-union value to prove the tolerant fallback.
    expect(categoryTone("mystery" as never)).toBe("neutral");
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
