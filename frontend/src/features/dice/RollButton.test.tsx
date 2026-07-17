import { render, screen, fireEvent, act, within, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RollButton from "@/features/dice/RollButton";

// Capture the roll calls without the full provider/seal stack.
const rollAnimated = vi.fn();
vi.mock("@/features/dice/RollContext", () => ({
  useRoll: () => ({ rollAnimated, rollModifiers: [] }),
}));

const LOG = { kind: "check" as const, source: "Stealth check", ability: "dexterity", skill: "stealth" };

function renderButton() {
  return render(
    <RollButton spec={{ count: 1, faces: 20, modifier: 5 }} label="Stealth check" log={LOG}>
      +5
    </RollButton>,
  );
}

function mainButton() {
  return screen.getByTitle(/^Roll Stealth check:/);
}

describe("RollButton roll mode (#958)", () => {
  beforeEach(() => {
    rollAnimated.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("a tap rolls Normal (one tap, no menu)", () => {
    renderButton();
    fireEvent.click(mainButton());
    expect(rollAnimated).toHaveBeenCalledTimes(1);
    expect(rollAnimated.mock.calls[0][0]).toMatchObject({ mode: "normal" });
    expect(screen.queryByTestId("roll-mode-menu")).not.toBeInTheDocument();
  });

  it("a long-press opens the mode menu; picking Adv rolls advantage and never sticks", () => {
    vi.useFakeTimers();
    renderButton();
    const btn = mainButton();

    // Press and hold past the threshold → the menu opens.
    fireEvent.pointerDown(btn);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const menu = screen.getByTestId("roll-mode-menu");
    fireEvent.click(within(menu).getByRole("button", { name: "Advantage" }));
    expect(rollAnimated).toHaveBeenCalledTimes(1);
    expect(rollAnimated.mock.calls[0][0]).toMatchObject({ mode: "advantage" });

    // The trailing click after a long-press must NOT double-roll.
    fireEvent.click(btn);
    expect(rollAnimated).toHaveBeenCalledTimes(1);

    // Non-sticky: a fresh tap rolls Normal (no advantage leak).
    fireEvent.pointerDown(btn);
    fireEvent.pointerUp(btn);
    fireEvent.click(btn);
    expect(rollAnimated).toHaveBeenCalledTimes(2);
    expect(rollAnimated.mock.calls[1][0]).toMatchObject({ mode: "normal" });
  });

  it("cancels the long-press when the pointer is cancelled (mobile scroll)", () => {
    vi.useFakeTimers();
    renderButton();
    const btn = mainButton();

    fireEvent.pointerDown(btn);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // A scroll steals the pointer before the hold threshold — no menu opens.
    fireEvent.pointerCancel(btn);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByTestId("roll-mode-menu")).not.toBeInTheDocument();
    expect(rollAnimated).not.toHaveBeenCalled();
  });
});
