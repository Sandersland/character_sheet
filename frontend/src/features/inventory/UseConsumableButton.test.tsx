import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RollProvider } from "@/features/dice/RollContext";
import UseConsumableButton from "@/features/inventory/UseConsumableButton";
import type { RollSpec, RollResult } from "@/lib/dice";
import type { InventoryItem as InvItem } from "@/types/character";

// Stub the 3D DiceRoller (a Three.js Canvas that doesn't render in jsdom): fire
// onResult on mount with one fixed face per die in the spec so the settled roll
// is deterministic and matches spec.count.
const FIXED_FACE = 3;
vi.mock("@/features/dice/DiceRoller", () => ({
  default: function MockDiceRoller({
    onResult,
    spec,
  }: {
    onResult?: (r: RollResult) => void;
    spec?: RollSpec;
  }) {
    const count = spec?.count ?? 1;
    const modifier = spec?.modifier ?? 0;
    const dice = Array.from({ length: count }, () => ({ value: FIXED_FACE, dropped: false }));
    setTimeout(() => {
      onResult?.({ dice, modifier, total: FIXED_FACE * count + modifier, spec: spec as RollSpec });
    }, 0);
    return <div data-testid="dice-roller" />;
  },
}));

function makeConsumable(overrides: Partial<InvItem> = {}): InvItem {
  return {
    id: "potion-1",
    name: "Potion of Healing",
    category: "consumable",
    quantity: 2,
    equipped: false,
    attuned: false,
    requiresAttunement: false,
    consumable: {
      effectDiceCount: 2,
      effectDiceFaces: 4,
      effectModifier: 2,
      effectDescription: "Restores hit points",
    },
    ...overrides,
  };
}

function renderButton(item: InvItem, onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <RollProvider characterId="char-1" sessionId={null}>
      <UseConsumableButton item={item} pending={false} onSubmit={onSubmit} />
    </RollProvider>,
  );
  return onSubmit;
}

describe("UseConsumableButton", () => {
  it("forwards the exact settled die values to the server via `rolls`", async () => {
    const onSubmit = renderButton(makeConsumable());
    await userEvent.click(screen.getByRole("button", { name: "Use Potion of Healing" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith([
      { type: "use", inventoryItemId: "potion-1", rolls: [FIXED_FACE, FIXED_FACE] },
    ]);
  });

  it("uses no rolls when the consumable has no effect dice", async () => {
    const item = makeConsumable({ consumable: { effectDescription: "Antitoxin" } });
    const onSubmit = renderButton(item);
    await userEvent.click(screen.getByRole("button", { name: "Use Potion of Healing" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith([{ type: "use", inventoryItemId: "potion-1" }]);
  });

  it("shows an X/Y charge indicator and disables Use at 0 for a charged consumable", () => {
    const item = makeConsumable({
      consumable: { effectDiceCount: 1, effectDiceFaces: 6, maxUses: 3, usesRemaining: 0 },
    });
    renderButton(item);
    expect(screen.getByText("0/3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use Potion of Healing" })).toBeDisabled();
  });
});
