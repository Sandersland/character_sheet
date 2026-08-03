// #1359: the dropped d20 face of an advantage/disadvantage roll must reach the
// logged event as `droppedFaces`, alongside the existing kept-only `faces`.
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { logRoll } from "@/api/client";
import { useRollLogger } from "@/features/session/useRollLogger";
import type { RollResult } from "@/lib/dice";

vi.mock("@/api/client", () => ({ logRoll: vi.fn().mockResolvedValue(undefined) }));

const mockLogRoll = vi.mocked(logRoll);

function advantageResult(kept: number, dropped: number): RollResult {
  return {
    dice: [
      { value: kept, dropped: false },
      { value: dropped, dropped: true },
    ],
    modifier: 5,
    total: kept + 5,
    spec: { count: 1, faces: 20, modifier: 5, mode: "advantage" },
  };
}

function normalResult(value: number): RollResult {
  return {
    dice: [{ value, dropped: false }],
    modifier: 5,
    total: value + 5,
    spec: { count: 1, faces: 20, modifier: 5 },
  };
}

describe("useRollLogger — #1359 dropped d20 face", () => {
  it("carries the dropped die's face in droppedFaces alongside the kept face", () => {
    mockLogRoll.mockClear();
    const { result } = renderHook(() => useRollLogger("c1", "s1", vi.fn()));
    result.current("attack", "Longsword", advantageResult(15, 5), {
      count: 1,
      faces: 20,
      modifier: 5,
      mode: "advantage",
    });

    expect(mockLogRoll).toHaveBeenCalledTimes(1);
    const [, , payload] = mockLogRoll.mock.calls[0];
    expect(payload).toMatchObject({ faces: [15], droppedFaces: [5] });
  });

  it("omits droppedFaces entirely for a normal roll with no dropped die", () => {
    mockLogRoll.mockClear();
    const { result } = renderHook(() => useRollLogger("c1", "s1", vi.fn()));
    result.current("attack", "Longsword", normalResult(12), { count: 1, faces: 20, modifier: 5 });

    expect(mockLogRoll).toHaveBeenCalledTimes(1);
    const [, , payload] = mockLogRoll.mock.calls[0];
    expect(payload).not.toHaveProperty("droppedFaces");
  });
});
