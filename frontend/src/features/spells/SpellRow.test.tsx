import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SpellRow from "@/features/spells/SpellRow";
import type { Spell } from "@/types/character";

const mockSpell: Spell = {
  id: "spell-1",
  name: "Fireball",
  level: 3,
  school: "evocation",
  prepared: false,
  castingTime: "1 action",
  range: "150 ft",
  duration: "Instantaneous",
  description: "A bright streak flashes from your pointing finger.",
  concentration: false,
  ritual: false,
};

const mockCantrip: Spell = {
  ...mockSpell,
  id: "spell-2",
  name: "Fire Bolt",
  level: 0,
  school: "evocation",
};

const UNBOUNDED = { count: 0, limit: null, atLimit: false };

function defaultProps(spell: Spell, overrides = {}) {
  return {
    spell,
    characterLevel: 5,
    busy: false,
    budget: UNBOUNDED,
    onPrepare: vi.fn(),
    onForget: vi.fn(),
    availableSlots: [3],
    ...overrides,
  };
}

describe("SpellRow", () => {
  it("renders the spell name", () => {
    render(<ul><SpellRow {...defaultProps(mockSpell)} /></ul>);
    expect(screen.getByText("Fireball")).toBeInTheDocument();
  });

  it("renders level and school badges", () => {
    render(<ul><SpellRow {...defaultProps(mockSpell)} /></ul>);
    expect(screen.getByText("Level 3")).toBeInTheDocument();
    expect(screen.getByText("Evocation")).toBeInTheDocument();
  });

  it("shows 'Cantrip' badge for cantrips", () => {
    render(<ul><SpellRow {...defaultProps(mockCantrip)} /></ul>);
    expect(screen.getByText("Cantrip")).toBeInTheDocument();
  });

  it("shows a prepare rune toggle for leveled spells", () => {
    render(<ul><SpellRow {...defaultProps(mockSpell)} /></ul>);
    expect(screen.getByRole("button", { name: /Prepare Fireball/i })).toBeInTheDocument();
  });

  it("shows a non-interactive always-prepared rune for cantrips", () => {
    render(<ul><SpellRow {...defaultProps(mockCantrip)} /></ul>);
    expect(screen.queryByRole("button", { name: /Prepare|Unprepare/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Always prepared")).toBeInTheDocument();
  });

  it("calls onPrepare with the spell when the rune is toggled", async () => {
    const user = userEvent.setup();
    const onPrepare = vi.fn();
    render(<ul><SpellRow {...defaultProps(mockSpell, { onPrepare })} /></ul>);
    await user.click(screen.getByRole("button", { name: /Prepare Fireball/i }));
    expect(onPrepare).toHaveBeenCalledWith(mockSpell);
  });

  it("calls onForget when Remove is clicked", async () => {
    const user = userEvent.setup();
    const onForget = vi.fn();
    render(<ul><SpellRow {...defaultProps(mockSpell, { onForget })} /></ul>);
    await user.click(screen.getByRole("button", { name: `Remove ${mockSpell.name}` }));
    expect(onForget).toHaveBeenCalledWith(mockSpell);
  });

  it("disables the prepare rune when busy", () => {
    render(<ul><SpellRow {...defaultProps(mockSpell, { busy: true })} /></ul>);
    expect(screen.getByRole("button", { name: /Prepare Fireball/i })).toBeDisabled();
  });

  describe("detail card (view/manage only, #1162)", () => {
    it("opens the shared spell detail card when the name is clicked", async () => {
      const user = userEvent.setup();
      render(<ul><SpellRow {...defaultProps(mockSpell)} /></ul>);
      await user.click(screen.getByRole("button", { name: "Open Fireball" }));
      expect(screen.getByRole("heading", { name: "Fireball" })).toBeInTheDocument();
      expect(
        screen.getByText("A bright streak flashes from your pointing finger."),
      ).toBeInTheDocument();
    });

    it("renders no Cast affordance anywhere on the row", () => {
      render(<ul><SpellRow {...defaultProps(mockSpell)} /></ul>);
      expect(screen.queryByRole("button", { name: "Cast" })).not.toBeInTheDocument();
    });

    it("the detail card's CTA prepares an unprepared spell, then closes", async () => {
      const user = userEvent.setup();
      const onPrepare = vi.fn();
      render(<ul><SpellRow {...defaultProps(mockSpell, { onPrepare })} /></ul>);
      await user.click(screen.getByRole("button", { name: "Open Fireball" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Prepare Fireball" }));
      expect(onPrepare).toHaveBeenCalledWith(mockSpell);
      expect(screen.queryByRole("heading", { name: "Fireball" })).not.toBeInTheDocument();
    });

    it("the detail card's CTA reads Unprepare for an already-prepared spell", async () => {
      const user = userEvent.setup();
      const prepared: Spell = { ...mockSpell, prepared: true };
      render(<ul><SpellRow {...defaultProps(prepared)} /></ul>);
      await user.click(screen.getByRole("button", { name: "Open Fireball" }));
      expect(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Unprepare Fireball" }),
      ).toBeInTheDocument();
    });

    it("locks the detail card's CTA to a disabled 'Always prepared' for a cantrip", async () => {
      const user = userEvent.setup();
      render(<ul><SpellRow {...defaultProps(mockCantrip)} /></ul>);
      await user.click(screen.getByRole("button", { name: "Open Fire Bolt" }));
      expect(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Always prepared" }),
      ).toBeDisabled();
    });
  });

  describe("concentration badge", () => {
    const concSpell: Spell = {
      ...mockSpell,
      id: "spell-conc",
      name: "Bless",
      level: 1,
      concentration: true,
    };

    it("shows a static 'conc' badge when not actively concentrating", () => {
      render(<ul><SpellRow {...defaultProps(concSpell, { isConcentrating: false })} /></ul>);
      expect(screen.getByText("conc")).toBeInTheDocument();
      expect(screen.queryByText("concentrating")).not.toBeInTheDocument();
    });

    it("shows an active 'concentrating' badge when this spell is the active concentration", () => {
      render(<ul><SpellRow {...defaultProps(concSpell, { isConcentrating: true })} /></ul>);
      expect(screen.getByText("concentrating")).toBeInTheDocument();
      expect(screen.queryByText("conc")).not.toBeInTheDocument();
    });

    it("shows no concentration badge for a non-concentration spell", () => {
      render(<ul><SpellRow {...defaultProps(mockSpell, { isConcentrating: false })} /></ul>);
      expect(screen.queryByText("conc")).not.toBeInTheDocument();
      expect(screen.queryByText("concentrating")).not.toBeInTheDocument();
    });
  });

  describe("subclass-granted spell", () => {
    const grantedCantrip: Spell = {
      ...mockCantrip,
      id: "granted:warrior-of-shadow:minor-illusion",
      name: "Minor Illusion",
      source: "subclass",
    };

    it("shows a 'subclass' badge", () => {
      render(<ul><SpellRow {...defaultProps(grantedCantrip, { availableSlots: [] })} /></ul>);
      expect(screen.getByText("subclass")).toBeInTheDocument();
    });

    it("hides the Remove ✕ button", () => {
      render(<ul><SpellRow {...defaultProps(grantedCantrip, { availableSlots: [] })} /></ul>);
      expect(screen.queryByRole("button", { name: /Remove Minor Illusion/ })).not.toBeInTheDocument();
    });

    it("still shows the Remove ✕ for a normal (non-granted) spell", () => {
      render(<ul><SpellRow {...defaultProps(mockSpell)} /></ul>);
      expect(screen.getByRole("button", { name: /Remove Fireball/ })).toBeInTheDocument();
      expect(screen.queryByText("subclass")).not.toBeInTheDocument();
    });
  });

  describe("item-granted spell", () => {
    const itemSpell: Spell = {
      ...mockSpell,
      id: "item:inv-1:witch-bolt",
      name: "Witch Bolt",
      level: 1,
      source: "item",
      item: {
        inventoryItemId: "inv-1",
        capabilityId: "cap-1",
        itemName: "Wand of Witch Bolt",
        castLevel: 1,
        resource: "perRestShort",
        usesRemaining: 1,
        usesTotal: 1,
        dcMode: "fixed",
        dc: 15,
        attackMode: "fixed",
        attack: null,
      },
    };

    it("shows the item-name, uses, and DC badges", () => {
      render(<ul><SpellRow {...defaultProps(itemSpell, { availableSlots: [] })} /></ul>);
      expect(screen.getByText("Wand of Witch Bolt")).toBeInTheDocument();
      expect(screen.getByText("1/1")).toBeInTheDocument();
      expect(screen.getByText("DC 15")).toBeInTheDocument();
    });

    it("hides the Remove ✕ button (derived, not persisted)", () => {
      render(<ul><SpellRow {...defaultProps(itemSpell, { availableSlots: [] })} /></ul>);
      expect(screen.queryByRole("button", { name: /Remove Witch Bolt/ })).not.toBeInTheDocument();
    });

    it("shows 'at will' and never a uses count for an at-will item spell", () => {
      // Wire reality: JSON.stringify(Infinity) === null, so an at-will item's
      // numeric use counts arrive as 0/null, NOT Infinity. Gate must key off
      // `resource`, not `usesTotal === Infinity` (which never matches on the wire).
      const atWill: Spell = {
        ...itemSpell,
        item: { ...itemSpell.item!, resource: "atWill", usesRemaining: 0, usesTotal: 0 },
      };
      render(<ul><SpellRow {...defaultProps(atWill, { availableSlots: [] })} /></ul>);
      expect(screen.getByText("at will")).toBeInTheDocument();
    });

    it("shows 'no uses' once the item resource is spent", () => {
      const spent: Spell = {
        ...itemSpell,
        item: { ...itemSpell.item!, usesRemaining: 0, usesTotal: 1 },
      };
      render(<ul><SpellRow {...defaultProps(spent, { availableSlots: [] })} /></ul>);
      expect(screen.getByText("no uses")).toBeInTheDocument();
    });

    describe("charges-costed cast (#555)", () => {
      const chargesSpell: Spell = {
        ...itemSpell,
        item: { ...itemSpell.item!, resource: "charges", usesRemaining: 4, usesTotal: 7, chargeCost: 3 },
      };

      it("shows the pool count and the cost badge", () => {
        render(<ul><SpellRow {...defaultProps(chargesSpell, { availableSlots: [] })} /></ul>);
        expect(screen.getByText("4/7")).toBeInTheDocument();
        expect(screen.getByText("3 charges")).toBeInTheDocument();
      });

      it("shows 'no charges' when remaining can't cover the cost (not just at 0)", () => {
        const low: Spell = {
          ...chargesSpell,
          item: { ...chargesSpell.item!, usesRemaining: 2 },
        };
        render(<ul><SpellRow {...defaultProps(low, { availableSlots: [] })} /></ul>);
        expect(screen.getByText("no charges")).toBeInTheDocument();
      });
    });
  });
});
