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

  // Regression (#1676): Song of Defense's "slot-picker" resolverKind is the
  // first row-driven kind (no ACTION_RESOLVERS entry) that also needs
  // openResolution:true (planActionClick). Before this fix, handleActionClick
  // called `openResolution(key)` with no action, so this hook's own internal
  // `resolverFor(key)` call (no action) could never synthesize the wire
  // fallback — the sheet silently never opened, caught only by browser
  // verification, not any prior unit test.
  it("opens a row-driven resolver (#1528 wire fallback) only when the AvailableAction is passed", () => {
    const action: AvailableAction = {
      key: "songOfDefense",
      name: "Song of Defense",
      cost: "reaction",
      enabled: true,
      resolverKind: "slot-picker",
    };
    const { result } = renderHook(() => useActiveResolution());

    // Without the action, resolverFor("songOfDefense") matches nothing in
    // ACTION_RESOLVERS and has no wire data to fall back to — no-ops, same
    // as the pre-fix bug this test pins.
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
