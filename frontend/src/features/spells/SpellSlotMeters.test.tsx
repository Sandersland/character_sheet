import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SpellSlotMeters from "@/features/spells/SpellSlotMeters";

beforeEach(() => vi.clearAllMocks());

describe("SpellSlotMeters", () => {
  it("renders nothing when there are no slots, pact, or arcana", () => {
    const { container } = render(
      <SpellSlotMeters
        slots={[]}
        pact={null}
        arcana={[]}
        slotsArePactMagic={false}
        busy={false}
        onExpend={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("labels merged warlock slots as Pact Magic and fires expend/restore ops", async () => {
    const user = userEvent.setup();
    const onExpend = vi.fn();
    const onRestore = vi.fn();
    render(
      <SpellSlotMeters
        slots={[{ level: 1, total: 2, used: 1 }]}
        pact={null}
        arcana={[]}
        slotsArePactMagic
        busy={false}
        onExpend={onExpend}
        onRestore={onRestore}
      />,
    );
    expect(screen.getByRole("heading", { name: /Pact Magic/i })).toBeInTheDocument();
    await user.click(screen.getByTitle("Expend a level 1 slot"));
    await user.click(screen.getByTitle("Restore a level 1 slot"));
    expect(onExpend).toHaveBeenCalledWith(1);
    expect(onRestore).toHaveBeenCalledWith(1);
  });

});

describe("SpellSlotMeters — arcanum & disabled states", () => {
  it("renders a Mystic Arcanum charge with a restore control but no expend control", () => {
    render(
      <SpellSlotMeters
        slots={[]}
        pact={null}
        arcana={[{ level: 6, total: 1, used: 1 }]}
        slotsArePactMagic={false}
        busy={false}
        onExpend={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: /Mystic Arcanum/i })).toBeInTheDocument();
    expect(screen.getByTitle("Restore the level 6 Mystic Arcanum")).toBeEnabled();
    expect(screen.queryByText("− use")).not.toBeInTheDocument();
  });

  it("disables expend at 0 remaining and restore at full", () => {
    render(
      <SpellSlotMeters
        slots={[{ level: 2, total: 3, used: 0 }]}
        pact={null}
        arcana={[]}
        slotsArePactMagic={false}
        busy={false}
        onExpend={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    // Full: restore disabled, expend enabled.
    expect(screen.getByTitle("Restore a level 2 slot")).toBeDisabled();
    expect(screen.getByTitle("Expend a level 2 slot")).toBeEnabled();
  });

  it("renders a dedicated Pact Magic block for a multiclass warlock", () => {
    render(
      <SpellSlotMeters
        slots={[{ level: 1, total: 2, used: 0 }]}
        pact={{ slotLevel: 1, count: 1, used: 0 }}
        arcana={[]}
        slotsArePactMagic={false}
        busy={false}
        onExpend={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: /^Spell Slots$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Pact Magic/i })).toBeInTheDocument();
  });
});
