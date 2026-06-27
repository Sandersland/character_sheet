import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import BulkSellPanel from "@/features/inventory/BulkSellPanel";
import * as client from "@/api/client";
import type { InventoryItem } from "@/types/character";

vi.mock("@/api/client");

const items: InventoryItem[] = [
  { id: "a", name: "Dagger", category: "weapon", quantity: 1, equipped: false, cost: { cp: 0, sp: 0, gp: 2, pp: 0 } },
  { id: "b", name: "Torch", category: "gear", quantity: 5, equipped: false, cost: { cp: 1, sp: 0, gp: 0, pp: 0 } },
  { id: "c", name: "Potion", category: "consumable", quantity: 2, equipped: false, cost: { cp: 0, sp: 0, gp: 50, pp: 0 } },
];

function renderPanel(overrides: Partial<Parameters<typeof BulkSellPanel>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const props = { items, pending: false, onSubmit, onClose, ...overrides };
  return { ...render(<BulkSellPanel {...props} />), onSubmit, onClose };
}

describe("BulkSellPanel", () => {
  it("disables Submit at zero selection", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /^Sell/ })).toBeDisabled();
  });

  it("selecting N items and submitting calls onSubmit ONCE with a length-N op array", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPanel();

    await user.click(screen.getByRole("checkbox", { name: /Dagger/ }));
    await user.click(screen.getByRole("checkbox", { name: /Potion/ }));

    const submit = screen.getByRole("button", { name: /^Sell/ });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledOnce();
    const ops = onSubmit.mock.calls[0][0];
    expect(ops).toHaveLength(2);
    expect(ops.every((o: { type: string }) => o.type === "sell")).toBe(true);
    expect(ops.map((o: { inventoryItemId: string }) => o.inventoryItemId)).toEqual(["a", "c"]);
    // full stacks: Dagger qty 1, Potion qty 2
    expect(ops.map((o: { quantity: number }) => o.quantity)).toEqual([1, 2]);
  });

  it("does NOT call applyInventoryTransactions directly — that's the orchestrator's job", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("checkbox", { name: /Dagger/ }));
    await user.click(screen.getByRole("button", { name: /^Sell/ }));
    expect(client.applyInventoryTransactions).not.toHaveBeenCalled();
  });
});
