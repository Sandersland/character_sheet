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

  it("renders one pip per slot, filled + spent", () => {
    render(
      <SpellSlotMeters
        slots={[{ level: 1, total: 4, used: 1 }]}
        pact={null}
        arcana={[]}
        slotsArePactMagic={false}
        busy={false}
        onExpend={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("slot-pip")).toHaveLength(4);
    expect(screen.getByText("3 / 4 left")).toBeInTheDocument();
  });

  it("labels merged warlock slots as Pact Magic and fires expend/restore ops from the pips", async () => {
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

describe("SpellSlotMeters — arcanum & boundary states", () => {
  it("renders a spent Mystic Arcanum charge with a restore pip but no expend pip", () => {
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
    expect(screen.queryByTitle(/^Expend/)).not.toBeInTheDocument();
  });

  it("offers expend pips at full and no restore pip when nothing is spent", () => {
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
    expect(screen.getAllByTitle("Expend a level 2 slot")).toHaveLength(3);
    expect(screen.queryByTitle("Restore a level 2 slot")).not.toBeInTheDocument();
  });

  it("disables every pip while busy", () => {
    render(
      <SpellSlotMeters
        slots={[{ level: 1, total: 2, used: 1 }]}
        pact={null}
        arcana={[]}
        slotsArePactMagic={false}
        busy
        onExpend={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByTitle("Expend a level 1 slot")).toBeDisabled();
    expect(screen.getByTitle("Restore a level 1 slot")).toBeDisabled();
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
