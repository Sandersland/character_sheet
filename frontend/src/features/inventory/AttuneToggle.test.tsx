import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import AttuneToggle from "@/features/inventory/AttuneToggle";
import type { InventoryItem } from "@/types/character";

// The fixture deliberately carries attunementPrereqText and NOT
// attunementPrereqKind: the tooltip must come off the served string, so a
// component that still mapped kind → phrase client-side would fail here (#1382).
const mockItem: InventoryItem = {
  id: "item-1",
  name: "Staff of Testing",
  category: "gear",
  quantity: 1,
  equipped: false,
  attuned: false,
  requiresAttunement: true,
  attunementPrereqText: "a spellcaster",
};

function renderToggle(overrides: Partial<Parameters<typeof AttuneToggle>[0]> = {}) {
  const props = {
    item: mockItem,
    pending: false,
    atCap: false,
    onSubmit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { ...render(<AttuneToggle {...props} />), props };
}

describe("AttuneToggle", () => {
  it("titles the pill with the server-resolved prerequisite phrasing", () => {
    renderToggle();
    expect(screen.getByRole("button", { name: "Attune" })).toHaveAttribute(
      "title",
      "Requires attunement by a spellcaster",
    );
  });

  it("falls back to the bare requirement when no prerequisite text is served", () => {
    renderToggle({ item: { ...mockItem, attunementPrereqText: undefined } });
    expect(screen.getByRole("button", { name: "Attune" })).toHaveAttribute(
      "title",
      "Requires attunement",
    );
  });

  it("explains the 3-item cap instead of the prerequisite when at the cap", () => {
    renderToggle({ atCap: true });
    const button = screen.getByRole("button", { name: "Attune" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "At attunement limit (3/3) — unattune one first");
  });
});
