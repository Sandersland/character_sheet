import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import LoadoutRefundStrip from "@/features/session/LoadoutRefundStrip";
import type { LoadoutSwapControls } from "@/features/session/useLoadoutSwap";

function controls(over: Partial<LoadoutSwapControls> = {}): LoadoutSwapControls {
  return {
    busy: false,
    error: null,
    lastSwap: { inverseOps: [], spend: null, previousLabel: "Longsword" },
    swap: vi.fn(),
    stow: vi.fn(),
    refund: vi.fn(),
    reset: vi.fn(),
    ...over,
  } as unknown as LoadoutSwapControls;
}

describe("LoadoutRefundStrip (#815)", () => {
  it("renders nothing without a committed swap", () => {
    const { container } = render(<LoadoutRefundStrip loadout={controls({ lastSwap: null })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers the Refund back to the pre-swap loadout", () => {
    render(<LoadoutRefundStrip loadout={controls()} />);
    expect(screen.getByRole("button", { name: /Refund to Longsword/ })).toBeEnabled();
  });

  it("surfaces a failed refund instead of swallowing it", () => {
    render(<LoadoutRefundStrip loadout={controls({ error: "Refund failed — try again." })} />);
    expect(screen.getByText("Refund failed — try again.")).toBeInTheDocument();
  });

  it("shows no error text on the happy path", () => {
    render(<LoadoutRefundStrip loadout={controls()} />);
    expect(screen.queryByText(/failed/)).toBeNull();
  });
});
