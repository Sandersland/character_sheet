import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { DiceRollStyleProvider } from "@/features/dice/DiceRollStyleProvider";
import HpDiceReveal from "@/features/level-up/HpDiceReveal";
import { rollSpec } from "@/lib/dice";
import type { RollResult } from "@/lib/dice";

vi.mock("@/features/dice/DiceRoller", () => ({
  default: () => <div data-testid="dice-roller" />,
}));

// Deterministic stand-in for the quick path's roll — the real engine is
// exercised by lib/dice's own tests.
vi.mock("@/lib/dice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dice")>();
  return {
    ...actual,
    rollSpec: vi.fn(() => ({
      dice: [{ value: 4, dropped: false }],
      modifier: 0,
      total: 4,
      spec: { count: 1, faces: 10 },
    })),
  };
});

const rollSpecMock = vi.mocked(rollSpec);

beforeEach(() => {
  localStorage.clear();
  rollSpecMock.mockClear();
});

describe("HpDiceReveal", () => {
  it("renders the 3D DiceRoller by default (animated)", async () => {
    render(
      <DiceRollStyleProvider>
        <HpDiceReveal faces={10} die="d10" onResult={vi.fn()} />
      </DiceRollStyleProvider>,
    );

    // Suspense-lazy even when the child is mocked, so the mount is async.
    expect(await screen.findByTestId("dice-roller")).toBeInTheDocument();
  });

  it("quick preference skips the 3D die and settles instantly", () => {
    localStorage.setItem("cs:pref:diceRoll", "quick");
    const onResult = vi.fn();
    render(
      <DiceRollStyleProvider>
        <HpDiceReveal faces={10} die="d10" onResult={onResult} />
      </DiceRollStyleProvider>,
    );

    expect(screen.queryByTestId("dice-roller")).not.toBeInTheDocument();
    expect(rollSpecMock).toHaveBeenCalledWith({ count: 1, faces: 10 });
    expect(onResult).toHaveBeenCalledTimes(1);
    const result = onResult.mock.calls[0][0] as RollResult;
    expect(result.dice[0]?.value).toBeGreaterThanOrEqual(1);
    expect(result.dice[0]?.value).toBeLessThanOrEqual(10);
  });

  it("fires onResult exactly once under StrictMode's double-invoke", () => {
    localStorage.setItem("cs:pref:diceRoll", "quick");
    const onResult = vi.fn();
    render(
      <StrictMode>
        <DiceRollStyleProvider>
          <HpDiceReveal faces={10} die="d10" onResult={onResult} />
        </DiceRollStyleProvider>
      </StrictMode>,
    );

    expect(onResult).toHaveBeenCalledTimes(1);
  });
});
