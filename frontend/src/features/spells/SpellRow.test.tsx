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
});
