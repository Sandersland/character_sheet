import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useCaptureHotkey } from "@/hooks/useCaptureHotkey";

function dispatchCmdJ(init: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", metaKey: true, ...init }));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useCaptureHotkey", () => {
  it("toggles on Cmd+J", () => {
    const cb = vi.fn();
    renderHook(() => useCaptureHotkey(cb));
    dispatchCmdJ();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("toggles on Ctrl+J too", () => {
    const cb = vi.fn();
    renderHook(() => useCaptureHotkey(cb));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "J", ctrlKey: true }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("ignores a plain J without a modifier", () => {
    const cb = vi.fn();
    renderHook(() => useCaptureHotkey(cb));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    expect(cb).not.toHaveBeenCalled();
  });

  it("ignores auto-repeat keydowns", () => {
    const cb = vi.fn();
    renderHook(() => useCaptureHotkey(cb));
    dispatchCmdJ({ repeat: true });
    expect(cb).not.toHaveBeenCalled();
  });

  it("does nothing while another modal dialog is open", () => {
    const cb = vi.fn();
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
    renderHook(() => useCaptureHotkey(cb));
    dispatchCmdJ();
    expect(cb).not.toHaveBeenCalled();
  });

  it("still fires when the open modal IS the dock", () => {
    const cb = vi.fn();
    const dock = document.createElement("div");
    dock.setAttribute("data-capture-dock", "");
    dock.setAttribute("aria-modal", "true");
    document.body.appendChild(dock);
    renderHook(() => useCaptureHotkey(cb));
    dispatchCmdJ();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("ignores the keystroke while focus is in an input outside the dock", () => {
    const cb = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    renderHook(() => useCaptureHotkey(cb));
    dispatchCmdJ();
    expect(cb).not.toHaveBeenCalled();
  });

  it("still fires when focus is in the dock composer", () => {
    const cb = vi.fn();
    const dock = document.createElement("div");
    dock.setAttribute("data-capture-dock", "");
    const editor = document.createElement("textarea");
    dock.appendChild(editor);
    document.body.appendChild(dock);
    editor.focus();
    renderHook(() => useCaptureHotkey(cb));
    dispatchCmdJ();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("removes the listener on unmount", () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useCaptureHotkey(cb));
    unmount();
    dispatchCmdJ();
    expect(cb).not.toHaveBeenCalled();
  });
});
