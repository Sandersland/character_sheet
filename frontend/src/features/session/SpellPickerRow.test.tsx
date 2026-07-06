import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SpellPickerRow from "@/features/session/SpellPickerRow";
import type { SpellRowState, SpellRowView } from "@/features/session/useSpellPicker";
import type { Spell } from "@/types/character";

const spell = {
  id: "s", name: "Chromatic Orb", level: 1, school: "conjuration",
  castingTime: "1 action", range: "90 feet", effectKind: "damage", attackType: "attack",
} as Spell;

const baseView: SpellRowView = {
  isCantrip: false,
  schoolTone: "arcane",
  availableSlots: [1, 2],
  spellSlot: 1,
  usesArcanum: false,
  locked: false,
  preview: "3d8 fire damage",
  compStr: "V S M",
  isAttack: true,
  isSave: false,
  dcLabel: null,
  spellAttackBonus: 5,
  castDisabled: true,
  attackDisabled: false,
  isHeal: false,
  allies: [],
};

const baseRow: SpellRowState = {
  slotLevel: 1,
  target: "other",
  casting: false,
  attackRolled: false,
  error: null,
};

function renderRow(view: Partial<SpellRowView> = {}, row: Partial<SpellRowState> = {}) {
  const onCast = vi.fn();
  const onAttackRoll = vi.fn();
  const onPatch = vi.fn();
  render(
    <SpellPickerRow
      spell={spell}
      view={{ ...baseView, ...view }}
      row={{ ...baseRow, ...row }}
      onPatch={onPatch}
      onCast={onCast}
      onAttackRoll={onAttackRoll}
    />,
  );
  return { onCast, onAttackRoll, onPatch };
}

describe("SpellPickerRow", () => {
  it("renders the spell name, preview, and an Attack button for attack spells", () => {
    renderRow();
    expect(screen.getByText("Chromatic Orb")).toBeInTheDocument();
    expect(screen.getByText("3d8 fire damage")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Attack/ })).toBeInTheDocument();
  });

  it("fires onAttackRoll when Attack is clicked", async () => {
    const { onAttackRoll } = renderRow();
    await userEvent.click(screen.getByRole("button", { name: /^Attack/ }));
    expect(onAttackRoll).toHaveBeenCalled();
  });

  it("keeps Cast disabled until the attack is rolled, then fires onCast", async () => {
    const { onCast } = renderRow({ castDisabled: false });
    const castBtn = screen.getByRole("button", { name: /^Cast/ });
    expect(castBtn).toBeEnabled();
    await userEvent.click(castBtn);
    expect(onCast).toHaveBeenCalled();
  });

  it("reports a slot pick through onPatch", async () => {
    const { onPatch } = renderRow();
    await userEvent.click(screen.getByRole("button", { name: /^L2/ }));
    expect(onPatch).toHaveBeenCalledWith({ slotLevel: 2 });
  });
});
