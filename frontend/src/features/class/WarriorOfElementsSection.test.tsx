import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import WarriorOfElementsSection from "@/features/class/WarriorOfElementsSection";
import type { Character, WarriorOfElementsOperation } from "@/types/character";

function makeCharacter(over?: {
  focusRemaining?: number;
  attuned?: boolean;
  burstAvailable?: boolean;
}): Character {
  const focusRemaining = over?.focusRemaining ?? 6;
  return {
    id: "char-1",
    unarmedStrike: { damage: { count: 1, faces: 8 } },
    activeEffects: { buffs: over?.attuned ? [{ key: "elementalAttunement", target: "elementalAttunement", modifier: 0, source: "Elemental Attunement", duration: "while-active" }] : [] },
    resources: {
      features: [],
      pools: [{ key: "focus", label: "Focus", total: 6, recharge: "shortRest", used: 6 - focusRemaining, remaining: focusRemaining }],
      maneuversKnown: [],
      toolProficienciesKnown: [],
      elementalAttunementAvailable: true,
      elementalBurstAvailable: over?.burstAvailable ?? true,
    },
  } as unknown as Character;
}

describe("WarriorOfElementsSection", () => {
  it("toggles Elemental Attunement on (active: true) when not attuned", async () => {
    const user = userEvent.setup();
    const onOperations = vi.fn<(ops: WarriorOfElementsOperation[]) => void>();
    render(<WarriorOfElementsSection character={makeCharacter()} busy={false} onOperations={onOperations} />);

    await user.click(screen.getByRole("button", { name: "Attune" }));
    expect(onOperations).toHaveBeenCalledWith([{ type: "toggleElementalAttunement", active: true }]);
  });

  it("ends Attunement (active: false) when already attuned", async () => {
    const user = userEvent.setup();
    const onOperations = vi.fn<(ops: WarriorOfElementsOperation[]) => void>();
    render(<WarriorOfElementsSection character={makeCharacter({ attuned: true })} busy={false} onOperations={onOperations} />);

    expect(screen.getByRole("status")).toHaveTextContent(/Attunement active/i);
    await user.click(screen.getByRole("button", { name: "End" }));
    expect(onOperations).toHaveBeenCalledWith([{ type: "toggleElementalAttunement", active: false }]);
  });

  it("casts Elemental Burst with the chosen damage type and a positive roll", async () => {
    const user = userEvent.setup();
    const onOperations = vi.fn<(ops: WarriorOfElementsOperation[]) => void>();
    render(<WarriorOfElementsSection character={makeCharacter()} busy={false} onOperations={onOperations} />);

    await user.selectOptions(screen.getByLabelText("Burst damage type"), "cold");
    await user.click(screen.getByRole("button", { name: "Cast" }));

    expect(onOperations).toHaveBeenCalledTimes(1);
    const [ops] = onOperations.mock.calls[0];
    expect(ops[0].type).toBe("castElementalBurst");
    expect(ops[0]).toMatchObject({ damageType: "cold" });
    // Three d8 rolls → total in [3, 24].
    const roll = (ops[0] as { roll: number }).roll;
    expect(roll).toBeGreaterThanOrEqual(3);
    expect(roll).toBeLessThanOrEqual(24);
  });

  it("hides Elemental Burst below level 6 (elementalBurstAvailable falsey)", () => {
    const onOperations = vi.fn();
    render(<WarriorOfElementsSection character={makeCharacter({ burstAvailable: false })} busy={false} onOperations={onOperations} />);
    expect(screen.queryByRole("button", { name: "Cast" })).not.toBeInTheDocument();
  });

  it("disables Attune when Focus is exhausted", () => {
    const onOperations = vi.fn();
    render(<WarriorOfElementsSection character={makeCharacter({ focusRemaining: 0 })} busy={false} onOperations={onOperations} />);
    expect(screen.getByRole("button", { name: "Attune" })).toBeDisabled();
  });
});
