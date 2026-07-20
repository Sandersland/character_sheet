import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AbilityAssignmentPanel from "@/features/character-create/AbilityAssignmentPanel";
import { EMPTY_ASSIGNMENTS } from "@/lib/abilityAssignment";
import type { CreationBackgroundBonuses } from "@/lib/characterCreation";
import { axe } from "@/test/axe";
import type { AbilityName, AbilityScores } from "@/types/character";

const ALL_EIGHT: AbilityScores = {
  strength: 8,
  dexterity: 8,
  constitution: 8,
  intelligence: 8,
  wisdom: 8,
  charisma: 8,
};

const INERT_BONUSES: CreationBackgroundBonuses = {
  applicable: false,
  abilities: [],
  originFeat: null,
  assignment: {},
  complete: false,
};

const SAGE_ABILITIES: AbilityName[] = ["constitution", "intelligence", "wisdom"];

function sageBonuses(assignment: Partial<Record<AbilityName, number>> = {}): CreationBackgroundBonuses {
  return {
    applicable: true,
    abilities: SAGE_ABILITIES,
    originFeat: { id: "f", name: "Magic Initiate", description: "Learn spells.", category: "origin" },
    assignment,
    complete: false,
  };
}

function renderPanel(props: Partial<React.ComponentProps<typeof AbilityAssignmentPanel>> = {}) {
  const update = vi.fn();
  const utils = render(
    <AbilityAssignmentPanel
      method="pointBuy"
      pool={null}
      assignments={EMPTY_ASSIGNMENTS}
      scores={ALL_EIGHT}
      bonuses={INERT_BONUSES}
      primaryAbility={[]}
      className=""
      update={update}
      {...props}
    />,
  );
  return { update, ...utils };
}

describe("AbilityAssignmentPanel — point buy", () => {
  it("names an Increase/Decrease stepper per ability and shows the budget meter", () => {
    renderPanel({ method: "pointBuy", scores: ALL_EIGHT });
    for (const label of ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"]) {
      expect(screen.getByRole("button", { name: `Increase ${label}` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Decrease ${label}` })).toBeInTheDocument();
    }
    expect(screen.getByText("27 of 27 points")).toBeInTheDocument();
  });

  it("disables + at the ceiling / budget and − at the floor", () => {
    const spent: AbilityScores = { ...ALL_EIGHT, strength: 15, dexterity: 15, constitution: 15 };
    renderPanel({ method: "pointBuy", scores: spent });
    // strength at the 15 ceiling — can't increase; at floor'd int — can't decrease.
    expect(screen.getByRole("button", { name: "Increase Strength" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase Intelligence" })).toBeDisabled(); // budget spent
    expect(screen.getByRole("button", { name: "Decrease Intelligence" })).toBeDisabled(); // floor
    expect(screen.getByRole("button", { name: "Decrease Strength" })).toBeEnabled();
  });

  it("increments a score through update", async () => {
    const user = userEvent.setup();
    const { update } = renderPanel({ method: "pointBuy", scores: ALL_EIGHT });
    await user.click(screen.getByRole("button", { name: "Increase Strength" }));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ abilityScores: expect.objectContaining({ strength: 9 }) }),
    );
  });

  it("has no a11y violations", async () => {
    const { container } = renderPanel({ method: "pointBuy" });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("AbilityAssignmentPanel — standard array", () => {
  const pool = [15, 14, 13, 12, 10, 8];

  it("offers six pool chips and places a held chip into a row", async () => {
    const user = userEvent.setup();
    const { update } = renderPanel({ method: "standardArray", pool, assignments: EMPTY_ASSIGNMENTS });
    for (const value of pool) {
      expect(screen.getByRole("button", { name: `Assign ${value}` })).toBeInTheDocument();
    }
    await user.click(screen.getByRole("button", { name: "Assign 15" }));
    await user.click(screen.getByRole("button", { name: "Assign to Strength" }));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        abilityAssignments: expect.objectContaining({ strength: 0 }),
        abilityScores: expect.objectContaining({ strength: 15 }),
      }),
    );
  });

  it("disables a used chip and clears a filled slot", async () => {
    const user = userEvent.setup();
    const assignments = { ...EMPTY_ASSIGNMENTS, strength: 0 };
    const { update } = renderPanel({ method: "standardArray", pool, assignments });
    expect(screen.getByRole("button", { name: "Assign 15" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Clear Strength" }));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ abilityAssignments: expect.objectContaining({ strength: null }) }),
    );
  });

  it("has no a11y violations", async () => {
    const { container } = renderPanel({ method: "standardArray", pool });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("AbilityAssignmentPanel — manual entry", () => {
  it("does not write 0 when the input is cleared", () => {
    const { update } = renderPanel({ method: "manual", scores: ALL_EIGHT });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Strength" }), { target: { value: "" } });
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ abilityScores: expect.objectContaining({ strength: 0 }) }),
    );
  });

  it("clamps an out-of-range value to the ceiling", () => {
    const { update } = renderPanel({ method: "manual", scores: ALL_EIGHT });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Strength" }), { target: { value: "45" } });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ abilityScores: expect.objectContaining({ strength: 30 }) }),
    );
  });

  it("bounds the manual input with native min/max", () => {
    renderPanel({ method: "manual", scores: ALL_EIGHT });
    const input = screen.getByRole("spinbutton", { name: "Strength" });
    expect(input).toHaveAttribute("min", "1");
    expect(input).toHaveAttribute("max", "30");
  });
});

describe("AbilityAssignmentPanel — background bonus columns", () => {
  it("renders +2/+1 radios only on the three eligible rows, one checked per column", () => {
    renderPanel({
      method: "manual",
      scores: ALL_EIGHT,
      bonuses: sageBonuses({ constitution: 2, intelligence: 1 }),
    });
    expect((screen.getByRole("radio", { name: "+2 to Constitution" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "+1 to Intelligence" }) as HTMLInputElement).checked).toBe(true);
    // Only the three background abilities carry radios.
    expect(screen.queryByRole("radio", { name: "+2 to Strength" })).toBeNull();
    // Exactly one +2 checked.
    const plusTwoChecked = screen
      .getAllByRole("radio", { name: /^\+2 to/ })
      .filter((r) => (r as HTMLInputElement).checked);
    expect(plusTwoChecked).toHaveLength(1);
  });

  it("moves the +2 when another eligible row is chosen", async () => {
    const user = userEvent.setup();
    const { update } = renderPanel({
      method: "manual",
      bonuses: sageBonuses({ constitution: 2, intelligence: 1 }),
    });
    await user.click(screen.getByRole("radio", { name: "+2 to Wisdom" }));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundAbilities: { wisdom: 2, intelligence: 1 } }),
    );
  });

  it("switches to +1/+1/+1, writing all three bumps and showing three dots", async () => {
    const user = userEvent.setup();
    const { update } = renderPanel({ method: "manual", bonuses: sageBonuses({}) });
    await user.click(screen.getByRole("button", { name: "+1 / +1 / +1" }));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundAbilities: { constitution: 1, intelligence: 1, wisdom: 1 } }),
    );
  });

  it("shows three +1 dots in the one/one/one spread", () => {
    renderPanel({
      method: "manual",
      bonuses: sageBonuses({ constitution: 1, intelligence: 1, wisdom: 1 }),
    });
    expect(screen.getAllByTestId("spread-dot")).toHaveLength(3);
    expect(screen.queryByRole("radio", { name: /^\+2 to/ })).toBeNull();
  });

  it("sums base + bonus into the total", () => {
    renderPanel({
      method: "manual",
      scores: { ...ALL_EIGHT, constitution: 13 },
      bonuses: sageBonuses({ constitution: 2, intelligence: 1 }),
    });
    // CON 13 + 2 = 15.
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("shows the Origin feat note", () => {
    renderPanel({ method: "manual", bonuses: sageBonuses({}) });
    expect(screen.getByText(/Origin feat: Magic Initiate/)).toBeInTheDocument();
  });
});

describe("AbilityAssignmentPanel — no-bonus background", () => {
  it("omits the bonus columns and background strip", () => {
    renderPanel({ method: "manual", bonuses: INERT_BONUSES });
    expect(screen.queryByRole("radio", { name: /to/ })).toBeNull();
    expect(screen.queryByText(/Origin feat/)).toBeNull();
    expect(screen.queryByTestId("spread-dot")).toBeNull();
  });
});

describe("AbilityAssignmentPanel — mobile grid alignment (#1182)", () => {
  it("renders header + rows as ONE grid so columns align regardless of radio eligibility", () => {
    // A bonus fixture mixes eligible (radio) and ineligible rows. Separate grids
    // sized their `auto` tracks independently and misaligned — the regression.
    const { container } = renderPanel({
      method: "manual",
      bonuses: sageBonuses({ constitution: 2, intelligence: 1 }),
    });
    expect(container.querySelectorAll('[style*="grid-template-columns"]')).toHaveLength(1);
  });

  it("shows an abbreviated label below sm and the full label from sm up", () => {
    renderPanel({ method: "manual", scores: ALL_EIGHT });
    expect(screen.getByText("STR")).toHaveClass("sm:hidden");
    expect(screen.getByText("Strength")).toHaveClass("sm:inline");
  });
});

describe("AbilityAssignmentPanel — recommended", () => {
  it("marks the single primary-ability row with the class diamond", () => {
    renderPanel({ method: "manual", primaryAbility: ["intelligence"], className: "Wizard" });
    expect(screen.getByText("◆ Wizard")).toBeInTheDocument();
  });

  it("marks both primary abilities", () => {
    renderPanel({ method: "manual", primaryAbility: ["strength", "dexterity"], className: "Fighter" });
    expect(screen.getAllByText("◆ Fighter")).toHaveLength(2);
  });
});
