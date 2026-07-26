import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import WarriorOfElementsSection from "@/features/class/WarriorOfElementsSection";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character, WarriorOfElementsOperation } from "@/types/character";

function makeCharacter(over?: {
  focusRemaining?: number;
  attuned?: boolean;
  burstAvailable?: boolean;
}): Character {
  const focusRemaining = over?.focusRemaining ?? 6;
  const burstAvailable = over?.burstAvailable ?? true;
  return {
    id: "char-1",
    unarmedStrike: { damage: { count: 1, faces: 8 } },
    activeEffects: { buffs: over?.attuned ? [{ key: "elementalAttunement", target: "elementalAttunement", modifier: 0, source: "Elemental Attunement", duration: "while-active" }] : [] },
    resources: {
      features: [],
      pools: [{ key: "focus", label: "Focus", total: 6, recharge: "shortRest", used: 6 - focusRemaining, remaining: focusRemaining }],
      maneuversKnown: [],
      toolProficienciesKnown: [],
    },
    // elementalBurst entitlement is availableActions[] presence (#1315), not a resources boolean.
    availableActions: burstAvailable
      ? [{ key: "elementalBurst", name: "Elemental Burst", cost: "action", enabled: true }]
      : [],
  } as unknown as Character;
}

// WarriorOfElementsSection reads useCurrentCharacter(), so every render seeds
// the cache and mounts CurrentCharacterProvider via renderWithCharacter.
function render(character: Character, onOperations: (ops: WarriorOfElementsOperation[]) => void) {
  return renderWithCharacter(
    <WarriorOfElementsSection busy={false} onOperations={onOperations} />,
    character,
  );
}

describe("WarriorOfElementsSection", () => {
  it("toggles Elemental Attunement on (active: true) when not attuned", async () => {
    const user = userEvent.setup();
    const onOperations = vi.fn<(ops: WarriorOfElementsOperation[]) => void>();
    render(makeCharacter(), onOperations);

    await user.click(screen.getByRole("button", { name: "Attune" }));
    expect(onOperations).toHaveBeenCalledWith([{ type: "toggleElementalAttunement", active: true }]);
  });

  it("ends Attunement (active: false) when already attuned", async () => {
    const user = userEvent.setup();
    const onOperations = vi.fn<(ops: WarriorOfElementsOperation[]) => void>();
    render(makeCharacter({ attuned: true }), onOperations);

    expect(screen.getByRole("status")).toHaveTextContent(/Attunement active/i);
    await user.click(screen.getByRole("button", { name: "End" }));
    expect(onOperations).toHaveBeenCalledWith([{ type: "toggleElementalAttunement", active: false }]);
  });

  it("casts Elemental Burst with the chosen damage type and a positive roll", async () => {
    const user = userEvent.setup();
    const onOperations = vi.fn<(ops: WarriorOfElementsOperation[]) => void>();
    render(makeCharacter(), onOperations);

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

  it("hides Elemental Burst below level 6 (absent from availableActions)", () => {
    const onOperations = vi.fn();
    render(makeCharacter({ burstAvailable: false }), onOperations);
    expect(screen.queryByRole("button", { name: "Cast" })).not.toBeInTheDocument();
  });

  it("disables Attune when Focus is exhausted", () => {
    const onOperations = vi.fn();
    render(makeCharacter({ focusRemaining: 0 }), onOperations);
    expect(screen.getByRole("button", { name: "Attune" })).toBeDisabled();
  });
});
