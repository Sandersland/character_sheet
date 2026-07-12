import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useRestActions } from "@/features/hitpoints/useRestActions";
import * as dice from "@/lib/dice";
import type { Character } from "@/types/character";

vi.mock("@/lib/dice", () => ({ rollDie: vi.fn() }));

function makeCharacter(overrides: Partial<Character["hitDice"]> = {}): Character {
  return {
    id: "char-1",
    hitDice: { total: 3, die: "d10", spent: 1, ...overrides },
  } as unknown as Character;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dice.rollDie).mockReturnValue(6);
});

describe("useRestActions", () => {
  it("derives availableDice from total minus spent", () => {
    const { result } = renderHook(() => useRestActions(makeCharacter(), vi.fn().mockResolvedValue(true)));
    expect(result.current.availableDice).toBe(2);
  });

  it("shortRest rolls one die per spend and submits a shortRest op", async () => {
    const submit = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useRestActions(makeCharacter(), submit));

    await result.current.shortRest(2);

    expect(dice.rollDie).toHaveBeenCalledTimes(2);
    expect(dice.rollDie).toHaveBeenCalledWith(10);
    expect(submit).toHaveBeenCalledWith([{ type: "shortRest", rolls: [6, 6] }]);
  });

  it("shortRest is a no-op for zero, negative, or over-budget spends", async () => {
    const submit = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useRestActions(makeCharacter(), submit));

    await result.current.shortRest(0);
    await result.current.shortRest(-1);
    await result.current.shortRest(3); // only 2 available

    expect(submit).not.toHaveBeenCalled();
    expect(dice.rollDie).not.toHaveBeenCalled();
  });

  it("longRest submits a longRest op with no rolls", async () => {
    const submit = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useRestActions(makeCharacter(), submit));

    await result.current.longRest();

    expect(submit).toHaveBeenCalledWith([{ type: "longRest" }]);
  });
});
