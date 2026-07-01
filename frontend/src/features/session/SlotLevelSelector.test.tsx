import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SlotLevelSelector from "@/features/session/SlotLevelSelector";
import type { Spell } from "@/types/character";

const spell = { id: "s", name: "Cure Wounds", level: 1 } as Spell;

describe("SlotLevelSelector", () => {
  it("renders a level strip and reports the picked level", async () => {
    const onSelect = vi.fn();
    render(
      <SlotLevelSelector spell={spell} availableSlots={[1, 2]} spellSlot={1} usesArcanum={false} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^L2/ }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("renders a single-slot label when only one option", () => {
    render(
      <SlotLevelSelector spell={spell} availableSlots={[1]} spellSlot={1} usesArcanum={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("Slot: L1")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("labels a Mystic Arcanum charge", () => {
    render(
      <SlotLevelSelector spell={spell} availableSlots={[6]} spellSlot={6} usesArcanum onSelect={vi.fn()} />,
    );
    expect(screen.getByText("Mystic Arcanum")).toBeInTheDocument();
  });

  it("renders nothing for a cantrip (no available slots)", () => {
    const { container } = render(
      <SlotLevelSelector spell={spell} availableSlots={[]} spellSlot={undefined} usesArcanum={false} onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
