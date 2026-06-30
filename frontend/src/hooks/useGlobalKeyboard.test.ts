import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useGlobalKeyboard } from "@/hooks/useGlobalKeyboard";

function dispatchCmdJ() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", metaKey: true }));
}

describe("useGlobalKeyboard", () => {
  it("fires the callback on Cmd+J", () => {
    const cb = vi.fn();
    renderHook(() => useGlobalKeyboard(cb));
    dispatchCmdJ();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("fires on Ctrl+J too", () => {
    const cb = vi.fn();
    renderHook(() => useGlobalKeyboard(cb));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("ignores a plain J without a modifier", () => {
    const cb = vi.fn();
    renderHook(() => useGlobalKeyboard(cb));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    expect(cb).not.toHaveBeenCalled();
  });

  it("removes the listener on unmount", () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useGlobalKeyboard(cb));
    unmount();
    dispatchCmdJ();
    expect(cb).not.toHaveBeenCalled();
  });
});
