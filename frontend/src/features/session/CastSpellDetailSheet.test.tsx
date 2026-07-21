import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CastSpellDetailSheet from "@/features/session/CastSpellDetailSheet";
import type { SpellRowState, SpellRowView, UseSpellPicker } from "@/features/session/useSpellPicker";
import type { Spell } from "@/types/character";

const spell = {
  id: "sp-1",
  name: "Burning Hands",
  level: 1,
  school: "evocation",
  castingTime: "1 action",
  range: "Self",
  duration: "Instantaneous",
  description: "A thin sheet of flames shoots forth from you.",
  effectKind: "damage",
  attackType: "save",
  saveAbility: "dexterity",
  saveEffect: "half",
  damageType: "fire",
} as Spell;

const baseRow: SpellRowState = { slotLevel: 1, target: "other", casting: false, attackRolled: false, error: null };
const baseView: SpellRowView = {
  isCantrip: false,
  schoolTone: "garnet",
  availableSlots: [1, 2],
  spellSlot: 1,
  usesArcanum: false,
  locked: false,
  preview: "3d6 fire",
  compStr: "V S",
  isAttack: false,
  isSave: true,
  dcLabel: "DC 15 Dexterity save",
  spellAttackBonus: 0,
  castDisabled: false,
  attackDisabled: false,
  isHeal: false,
  allies: [],
  expected: { lead: "Targets make a DC 15 Dexterity save", dice: "3d6 fire", diceTint: "", tail: "half on success" },
};

function makePicker(overrides: Partial<UseSpellPicker> = {}): UseSpellPicker {
  return {
    sortedSpells: [spell],
    slotUsedHint: null,
    isEmpty: false,
    emptyMessage: "",
    hasCastable: true,
    rowFor: () => baseRow,
    viewFor: () => baseView,
    patchRow: vi.fn(),
    handleCast: vi.fn().mockResolvedValue(undefined),
    handleAttackRoll: vi.fn(),
    lastCast: null,
    ...overrides,
  };
}

describe("CastSpellDetailSheet", () => {
  it("renders the shared spell card with the full description and a full-width Cast CTA", () => {
    render(<CastSpellDetailSheet spell={spell} picker={makePicker()} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Burning Hands" })).toBeInTheDocument();
    expect(screen.getByText(/A thin sheet of flames/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cast Burning Hands" })).toBeInTheDocument();
  });

  it("shows the upcast slot picker when more than one slot is legal", () => {
    render(<CastSpellDetailSheet spell={spell} picker={makePicker()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^L2/ })).toBeInTheDocument();
  });

  it("hides the upcast slot picker when only one slot is legal", () => {
    const picker = makePicker({ viewFor: () => ({ ...baseView, availableSlots: [1] }) });
    render(<CastSpellDetailSheet spell={spell} picker={picker} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^L2/ })).not.toBeInTheDocument();
  });

  it("picking a slot patches the row through the picker", async () => {
    const picker = makePicker();
    render(<CastSpellDetailSheet spell={spell} picker={picker} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /^L2/ }));
    expect(picker.patchRow).toHaveBeenCalledWith("sp-1", { slotLevel: 2 });
  });

  it("Cast fires handleCast and closes the card", async () => {
    const picker = makePicker();
    const onClose = vi.fn();
    render(<CastSpellDetailSheet spell={spell} picker={picker} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Cast Burning Hands" }));
    expect(picker.handleCast).toHaveBeenCalledWith(spell);
    expect(onClose).toHaveBeenCalled();
  });

  it("disables Cast per the row view's castDisabled", () => {
    const picker = makePicker({ viewFor: () => ({ ...baseView, castDisabled: true }) });
    render(<CastSpellDetailSheet spell={spell} picker={picker} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Cast Burning Hands" })).toBeDisabled();
  });
});
