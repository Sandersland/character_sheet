import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SlotLevelSelector from "@/features/session/SlotLevelSelector";

describe("SlotLevelSelector", () => {
  it("renders a level strip and reports the picked level", async () => {
    const onSelect = vi.fn();
    render(<SlotLevelSelector baseLevel={1} availableSlots={[1, 2]} spellSlot={1} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /^L2/ }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  // #1163: the level already reads off the section header — a single legal
  // slot needs no on-row echo ("Slot: L1"), not even for a Mystic Arcanum charge.
  it("renders nothing when only one slot is legal", () => {
    const { container } = render(
      <SlotLevelSelector baseLevel={1} availableSlots={[1]} spellSlot={1} onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a cantrip (no available slots)", () => {
    const { container } = render(
      <SlotLevelSelector baseLevel={1} availableSlots={[]} spellSlot={undefined} onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // #1676: Bladesinger's Song of Defense is the first non-spell consumer —
  // baseLevel is its own minLevel (1), never a Spell's own `.level`.
  it("marks every slot above baseLevel with the upcast arrow, for a non-spell ability", () => {
    render(<SlotLevelSelector baseLevel={1} availableSlots={[1, 2, 3]} spellSlot={2} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "L1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^L2/ })).toHaveTextContent("↑");
    expect(screen.getByRole("button", { name: /^L3/ })).toHaveTextContent("↑");
  });
});
