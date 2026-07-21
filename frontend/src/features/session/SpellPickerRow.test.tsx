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
  expected: { lead: "Spell attack +5", dice: "3d8 fire damage", diceTint: "bg-dmg-fire/15 text-dmg-fire", tail: "" },
};

const baseRow: SpellRowState = {
  slotLevel: 1,
  target: "other",
  casting: false,
  attackRolled: false,
  error: null,
};

function renderRow(view: Partial<SpellRowView> = {}, row: Partial<SpellRowState> = {}, justCastLevel?: number) {
  const onCast = vi.fn();
  const onAttackRoll = vi.fn();
  const onPatch = vi.fn();
  const onOpenDetail = vi.fn();
  render(
    <SpellPickerRow
      spell={spell}
      view={{ ...baseView, ...view }}
      row={{ ...baseRow, ...row }}
      onPatch={onPatch}
      onCast={onCast}
      onAttackRoll={onAttackRoll}
      onOpenDetail={onOpenDetail}
      justCastLevel={justCastLevel}
    />,
  );
  return { onCast, onAttackRoll, onPatch, onOpenDetail };
}

describe("SpellPickerRow", () => {
  it("renders the spell name, school ink, the expected-roll line, and an Attack button", () => {
    renderRow();
    expect(screen.getByText("Chromatic Orb")).toBeInTheDocument();
    expect(screen.getByText("Conjuration")).toBeInTheDocument();
    expect(screen.getByText("Spell attack +5")).toBeInTheDocument();
    expect(screen.getByText("3d8 fire damage")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Attack/ })).toBeInTheDocument();
    // No per-row level echo — the level lives on the section header (#1163).
    expect(screen.queryByText(/^Slot:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Cast \(L/)).not.toBeInTheDocument();
  });

  it("fires onAttackRoll when Attack is clicked", async () => {
    const { onAttackRoll } = renderRow();
    await userEvent.click(screen.getByRole("button", { name: /^Attack/ }));
    expect(onAttackRoll).toHaveBeenCalled();
  });

  it("keeps Cast disabled until the attack is rolled, then fires onCast", async () => {
    const { onCast } = renderRow({ castDisabled: false });
    const castBtn = screen.getByRole("button", { name: "Cast" });
    expect(castBtn).toBeEnabled();
    await userEvent.click(castBtn);
    expect(onCast).toHaveBeenCalled();
  });

  it("opens the detail card from the info dot or the row body (#1163)", async () => {
    const { onOpenDetail } = renderRow();
    await userEvent.click(screen.getByRole("button", { name: "Chromatic Orb details" }));
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByText("Chromatic Orb"));
    expect(onOpenDetail).toHaveBeenCalledTimes(2);
  });

  it("swaps to a dimmed receipt once this spell just settled a cast (#1164)", () => {
    renderRow({}, {}, 2);
    expect(screen.getByText("cast at 2nd level · slot spent")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cast" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Attack/ })).not.toBeInTheDocument();
  });

  it("labels a just-cast cantrip without a level suffix", () => {
    renderRow({ isCantrip: true }, {}, 0);
    expect(screen.getByText("cast")).toBeInTheDocument();
  });
});
