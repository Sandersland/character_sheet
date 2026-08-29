import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useActiveResolution } from "@/features/session/useActiveResolution";
import type { AvailableAction } from "@/types/character";

describe("useActiveResolution", () => {
  it("opens a statically-keyed resolver with no action context (existing behavior)", () => {
    const { result } = renderHook(() => useActiveResolution());
    act(() => result.current.openResolution("useObject"));
    expect(result.current.activeResolution?.resolver.kind).toBe("item-picker");
  });

  it("opens a row-driven resolver (#1528 wire fallback) only when the AvailableAction is passed", () => {
    const action: AvailableAction = {
      key: "songOfDefense",
      name: "Song of Defense",
      cost: "reaction",
      enabled: true,
      resolverKind: "slot-picker",
    };
    const { result } = renderHook(() => useActiveResolution());

    act(() => result.current.openResolution("songOfDefense"));
    expect(result.current.activeResolution).toBeNull();

    act(() => result.current.openResolution("songOfDefense", undefined, action));
    expect(result.current.activeResolution?.resolver.kind).toBe("slot-picker");
    expect(result.current.activeResolution?.resolver.key).toBe("songOfDefense");
  });

  it("closeResolution clears the active resolution", () => {
    const { result } = renderHook(() => useActiveResolution());
    act(() => result.current.openResolution("useObject"));
    expect(result.current.activeResolution).not.toBeNull();
    act(() => result.current.closeResolution());
    expect(result.current.activeResolution).toBeNull();
  });
});
