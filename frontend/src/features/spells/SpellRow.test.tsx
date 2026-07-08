import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

// Fireball with structured damage + upcast scaling (8d6 base, +1d6 per level above 3rd).
const mockUpcastSpell: Spell = {
  ...mockSpell,
  id: "spell-3",
  name: "Fireball",
  level: 3,
  effectKind: "damage",
  effectDiceCount: 8,
  effectDiceFaces: 6,
  damageType: "fire",
  upcastDicePerLevel: 1,
};

function defaultProps(spell: Spell, overrides = {}) {
  return {
    spell,
    characterLevel: 5,
    busy: false,
    onCast: vi.fn(),
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
    expect(screen.getByText("evocation")).toBeInTheDocument();
  });

  it("shows 'Cantrip' badge for cantrips", () => {
    render(<ul><SpellRow {...defaultProps(mockCantrip)} /></ul>);
    expect(screen.getByText("Cantrip")).toBeInTheDocument();
  });

  it("shows prepare button for leveled spells", () => {
    render(<ul><SpellRow {...defaultProps(mockSpell)} /></ul>);
    expect(screen.getByRole("button", { name: /prepared|unprepared/i })).toBeInTheDocument();
  });

  it("hides prepare button for cantrips", () => {
    render(<ul><SpellRow {...defaultProps(mockCantrip)} /></ul>);
    expect(screen.queryByRole("button", { name: /prepared|unprepared/i })).not.toBeInTheDocument();
  });

  it("calls onCast when Cast is clicked (single available slot)", async () => {
    const user = userEvent.setup();
    const onCast = vi.fn();
    render(<ul><SpellRow {...defaultProps(mockSpell, { onCast, availableSlots: [3] })} /></ul>);
    await user.click(screen.getByRole("button", { name: "Cast" }));
    expect(onCast).toHaveBeenCalledOnce();
  });

  it("calls onCast directly for cantrips (no slot needed)", async () => {
    const user = userEvent.setup();
    const onCast = vi.fn();
    render(<ul><SpellRow {...defaultProps(mockCantrip, { onCast, availableSlots: [] })} /></ul>);
    await user.click(screen.getByRole("button", { name: "Cast" }));
    // Cantrips call onCast with just the spell, no slot arg.
    expect(onCast).toHaveBeenCalledWith(mockCantrip);
  });

  it("calls onPrepare with the spell when prepare is toggled", async () => {
    const user = userEvent.setup();
    const onPrepare = vi.fn();
    render(<ul><SpellRow {...defaultProps(mockSpell, { onPrepare })} /></ul>);
    await user.click(screen.getByRole("button", { name: /prepared|unprepared/i }));
    expect(onPrepare).toHaveBeenCalledWith(mockSpell);
  });

  it("calls onForget when Remove is clicked", async () => {
    const user = userEvent.setup();
    const onForget = vi.fn();
    render(<ul><SpellRow {...defaultProps(mockSpell, { onForget })} /></ul>);
    await user.click(screen.getByRole("button", { name: `Remove ${mockSpell.name}` }));
    expect(onForget).toHaveBeenCalledWith(mockSpell);
  });

  it("disables Cast and prepare buttons when busy", () => {
    render(<ul><SpellRow {...defaultProps(mockSpell, { busy: true })} /></ul>);
    expect(screen.getByRole("button", { name: "Cast" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /prepared|unprepared/i })).toBeDisabled();
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
      id: "granted:way-of-shadow:minor-illusion",
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

    it("keeps Cast working", async () => {
      const user = userEvent.setup();
      const onCast = vi.fn();
      render(<ul><SpellRow {...defaultProps(grantedCantrip, { onCast, availableSlots: [] })} /></ul>);
      await user.click(screen.getByRole("button", { name: "Cast" }));
      expect(onCast).toHaveBeenCalledWith(grantedCantrip);
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

    it("casts directly with the spell (no slot picker) even at level 1", async () => {
      const user = userEvent.setup();
      const onCast = vi.fn();
      render(<ul><SpellRow {...defaultProps(itemSpell, { onCast, availableSlots: [] })} /></ul>);
      await user.click(screen.getByRole("button", { name: "Cast" }));
      expect(onCast).toHaveBeenCalledWith(itemSpell);
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
      expect(screen.getByRole("button", { name: "Cast" })).not.toBeDisabled();
    });

    it("disables Cast and shows 'no uses' once the item resource is spent", () => {
      const spent: Spell = {
        ...itemSpell,
        item: { ...itemSpell.item!, usesRemaining: 0, usesTotal: 1 },
      };
      render(<ul><SpellRow {...defaultProps(spent, { availableSlots: [] })} /></ul>);
      expect(screen.getByText("no uses")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cast" })).toBeDisabled();
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
        expect(screen.getByRole("button", { name: "Cast" })).not.toBeDisabled();
      });

      it("disables Cast when remaining charges can't cover the cost (not just at 0)", () => {
        const low: Spell = {
          ...chargesSpell,
          item: { ...chargesSpell.item!, usesRemaining: 2 },
        };
        render(<ul><SpellRow {...defaultProps(low, { availableSlots: [] })} /></ul>);
        expect(screen.getByText("no charges")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cast" })).toBeDisabled();
      });
    });
  });

  describe("upcast slot picker", () => {
    it("opens a slot button for each available level when multiple slots exist", async () => {
      const user = userEvent.setup();
      render(
        <ul>
          <SpellRow {...defaultProps(mockUpcastSpell, { availableSlots: [3, 4, 5] })} />
        </ul>,
      );
      // Multiple slots → Cast opens the picker rather than casting immediately.
      await user.click(screen.getByRole("button", { name: "Cast" }));
      expect(screen.getByRole("button", { name: /L3/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /L4/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /L5/ })).toBeInTheDocument();
    });

    it("marks upcast slots (above the spell's base level) with an ↑ indicator", async () => {
      const user = userEvent.setup();
      render(
        <ul>
          <SpellRow {...defaultProps(mockUpcastSpell, { availableSlots: [3, 4, 5] })} />
        </ul>,
      );
      await user.click(screen.getByRole("button", { name: "Cast" }));
      // Base level (3) is not an upcast → no ↑.
      expect(screen.getByRole("button", { name: /L3/ })).not.toHaveTextContent("↑");
      // Higher slots are upcasts → ↑.
      expect(screen.getByRole("button", { name: /L4/ })).toHaveTextContent("↑");
      expect(screen.getByRole("button", { name: /L5/ })).toHaveTextContent("↑");
    });

    it("shows the scaled effect preview on upcast buttons", async () => {
      const user = userEvent.setup();
      render(
        <ul>
          <SpellRow {...defaultProps(mockUpcastSpell, { availableSlots: [3, 4, 5] })} />
        </ul>,
      );
      await user.click(screen.getByRole("button", { name: "Cast" }));
      // effectPreview renders "<count>d<faces> <damageType>" (the damage type stands in for "damage").
      // 8d6 base + 2 levels above 3rd × 1d6 = 10d6 at L5.
      expect(screen.getByRole("button", { name: /L5/ })).toHaveTextContent("10d6 fire");
      // L4 → 9d6.
      expect(screen.getByRole("button", { name: /L4/ })).toHaveTextContent("9d6 fire");
    });

    it("calls onCast with the chosen upcast slot level", async () => {
      const user = userEvent.setup();
      const onCast = vi.fn();
      render(
        <ul>
          <SpellRow {...defaultProps(mockUpcastSpell, { onCast, availableSlots: [3, 4, 5] })} />
        </ul>,
      );
      await user.click(screen.getByRole("button", { name: "Cast" }));
      await user.click(screen.getByRole("button", { name: /L5/ }));
      expect(onCast).toHaveBeenCalledWith(mockUpcastSpell, 5);
    });
  });
});
