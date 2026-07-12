import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { RefObject } from "react";

import { shouldDismissDrag, useDragToDismiss } from "@/hooks/useDragToDismiss";

const SHEET = 600;

describe("shouldDismissDrag", () => {
  it("dismisses past the ~1/3-height distance threshold", () => {
    expect(shouldDismissDrag({ dy: 210, sheetHeight: SHEET, velocity: 0 })).toBe(true);
  });

  it("springs back below the distance threshold with no flick", () => {
    expect(shouldDismissDrag({ dy: 120, sheetHeight: SHEET, velocity: 0 })).toBe(false);
  });

  it("dismisses on a downward flick even below the distance threshold", () => {
    expect(shouldDismissDrag({ dy: 40, sheetHeight: SHEET, velocity: 1.2 })).toBe(true);
  });

  it("never dismisses on an upward drag, however far", () => {
    expect(shouldDismissDrag({ dy: -400, sheetHeight: SHEET, velocity: 0 })).toBe(false);
  });

  it("never dismisses on an upward flick", () => {
    expect(shouldDismissDrag({ dy: -10, sheetHeight: SHEET, velocity: -2 })).toBe(false);
  });

  it("treats a zero-distance release as a spring-back", () => {
    expect(shouldDismissDrag({ dy: 0, sheetHeight: SHEET, velocity: 0 })).toBe(false);
  });

  it("does not divide-by-zero on a zero-height sheet — a downward drag dismisses", () => {
    expect(shouldDismissDrag({ dy: 1, sheetHeight: 0, velocity: 0 })).toBe(true);
  });
});

// Stateful gesture-machine coverage: drive the returned pointer handlers with
// real JSDOM PointerEvents against a live panel element and assert the CSS
// mutations (transform follows the finger; spring-back restores translateY(0))
// plus the dismiss verdict.
describe("useDragToDismiss gesture machine", () => {
  let panel: HTMLElement;
  let handle: HTMLElement;
  let content: HTMLElement;
  let clock: number;

  function stubMatchMedia(reduce: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  beforeEach(() => {
    clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    stubMatchMedia(false);

    panel = document.createElement("div");
    panel.getBoundingClientRect = () => ({ height: SHEET }) as DOMRect;
    handle = document.createElement("button");
    content = document.createElement("div");
    document.body.append(panel, handle, content);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    panel.remove();
    handle.remove();
    content.remove();
  });

  type Handlers = Record<string, (e: unknown) => void>;

  function attach(el: HTMLElement, props: Handlers) {
    if (props.onPointerDown) el.addEventListener("pointerdown", props.onPointerDown as EventListener);
    if (props.onPointerMove) el.addEventListener("pointermove", props.onPointerMove as EventListener);
    if (props.onPointerUp) el.addEventListener("pointerup", props.onPointerUp as EventListener);
    if (props.onPointerCancel) el.addEventListener("pointercancel", props.onPointerCancel as EventListener);
  }

  function fire(el: HTMLElement, type: string, clientY: number, at = clock) {
    clock = at;
    const e = new PointerEvent(type, { bubbles: true, clientY, pointerId: 1 });
    el.dispatchEvent(e);
  }

  function fireTransitionEnd(el: HTMLElement, propertyName: string) {
    const e = new Event("transitionend", { bubbles: true });
    Object.defineProperty(e, "propertyName", { value: propertyName });
    el.dispatchEvent(e);
  }

  function render(enabled = true) {
    const onDismiss = vi.fn();
    const onExitStart = vi.fn();
    const ref = { current: panel } as RefObject<HTMLElement>;
    const { result, unmount } = renderHook(() => useDragToDismiss(ref, { onDismiss, onExitStart, enabled }));
    attach(handle, result.current.handleProps as Handlers);
    attach(content, result.current.contentProps as Handlers);
    return { onDismiss, onExitStart, result, unmount };
  }

  it("follows the finger via a translateY transform while dragging the handle", () => {
    render();
    fire(handle, "pointerdown", 0, 0);
    fire(handle, "pointermove", 100, 16);
    expect(panel.style.transform).toBe("translateY(100px)");
    expect(panel.style.transition).toBe("none");
  });

  it("springs back to translateY(0) on release below the threshold", () => {
    const { onDismiss } = render();
    fire(handle, "pointerdown", 0, 0);
    fire(handle, "pointermove", 100, 400); // slow: dt large → no flick
    fire(handle, "pointerup", 100, 500);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe("translateY(0)");
    expect(panel.style.transition).toContain("transform");
  });

  it("dismisses on a downward flick — velocity feeds the verdict (deferred to exit)", () => {
    const { onDismiss } = render();
    fire(handle, "pointerdown", 0, 0);
    fire(handle, "pointermove", 30, 10); // 30px in 10ms → 3 px/ms ≫ flick threshold
    fire(handle, "pointerup", 30, 12);
    // The dismiss now animates out first; onDismiss fires on the exit's transitionend.
    expect(onDismiss).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe("translateY(100%)");
    fireTransitionEnd(panel, "transform");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses when dragged past ~1/3 the sheet height, even slowly (deferred to exit)", () => {
    const { onDismiss } = render();
    fire(handle, "pointerdown", 0, 0);
    fire(handle, "pointermove", 250, 1000); // > 200px, slow → distance verdict
    fire(handle, "pointerup", 250, 2000);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe("translateY(100%)");
    fireTransitionEnd(panel, "transform");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("content region: engages only at scrollTop 0 and on downward movement", () => {
    render();
    fire(content, "pointerdown", 0, 0);
    fire(content, "pointermove", 80, 16);
    expect(panel.style.transform).toBe("translateY(80px)");
  });

  it("content region: upward-while-armed is inert (no transform, no dismiss)", () => {
    const { onDismiss } = render();
    fire(content, "pointerdown", 100, 0);
    fire(content, "pointermove", 40, 16); // moved up → armed stays, never engages
    expect(panel.style.transform).toBe("");
    fire(content, "pointerup", 40, 20);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("content region: does not arm when already scrolled down", () => {
    Object.defineProperty(content, "scrollTop", { value: 50, configurable: true });
    render();
    fire(content, "pointerdown", 0, 0);
    fire(content, "pointermove", 200, 16);
    expect(panel.style.transform).toBe("");
  });

  it("cancel always springs back — never dismisses, even after a dismiss-worthy flick", () => {
    const { onDismiss } = render();
    fire(handle, "pointerdown", 0, 0);
    fire(handle, "pointermove", 300, 10); // fast + far: would dismiss on pointerup
    fire(handle, "pointercancel", 300, 12);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe("translateY(0)");
    expect(panel.style.transition).toContain("transform");
  });

  it("reduced motion: decides the verdict without following or springing", () => {
    stubMatchMedia(true);
    const { onDismiss } = render();
    // No follow while dragging.
    fire(handle, "pointerdown", 0, 0);
    fire(handle, "pointermove", 250, 1000);
    expect(panel.style.transform).toBe("");
    // Spring-back path mutates nothing…
    fire(handle, "pointerup", 250, 2000);
    expect(panel.style.transform).toBe("");
    // …but the dismiss verdict still fires.
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("reduced motion: a below-threshold release springs back without a transform", () => {
    stubMatchMedia(true);
    const { onDismiss } = render();
    fire(handle, "pointerdown", 0, 0);
    fire(handle, "pointermove", 50, 1000);
    fire(handle, "pointerup", 50, 2000);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe("");
    expect(panel.style.transition).toBe("");
  });

  it("exit: a dismiss-worthy release animates translateY(100%) with the iOS curve and defers onDismiss", () => {
    const { onDismiss, onExitStart } = render();
    fire(handle, "pointerdown", 0, 0);
    fire(handle, "pointermove", 250, 1000);
    fire(handle, "pointerup", 250, 2000);
    expect(onExitStart).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe("translateY(100%)");
    expect(panel.style.transition).toContain("cubic-bezier(0.32,0.72,0,1)");
    expect(panel.style.transition).toContain("500ms");
    expect(panel.style.pointerEvents).toBe("none");
  });

  it("exit: ignores a transitionend for a non-transform property, fires on transform", () => {
    const { onDismiss } = render();
    fire(handle, "pointerdown", 0, 0);
    fire(handle, "pointermove", 250, 1000);
    fire(handle, "pointerup", 250, 2000);
    fireTransitionEnd(panel, "opacity");
    expect(onDismiss).not.toHaveBeenCalled();
    fireTransitionEnd(panel, "transform");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("exit: a setTimeout fallback fires onDismiss when transitionend never arrives", () => {
    vi.useFakeTimers();
    try {
      const { onDismiss } = render();
      fire(handle, "pointerdown", 0, 0);
      fire(handle, "pointermove", 250, 1000);
      fire(handle, "pointerup", 250, 2000);
      expect(onDismiss).not.toHaveBeenCalled();
      vi.advanceTimersByTime(600);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("exit: transitionend + fallback both firing dismisses exactly once", () => {
    vi.useFakeTimers();
    try {
      const { onDismiss } = render();
      fire(handle, "pointerdown", 0, 0);
      fire(handle, "pointermove", 250, 1000);
      fire(handle, "pointerup", 250, 2000);
      fireTransitionEnd(panel, "transform");
      vi.advanceTimersByTime(600);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("exit: beginExit is exposed for non-drag closes and animates out", () => {
    const { onDismiss, onExitStart, result } = render();
    result.current.beginExit();
    expect(onExitStart).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe("translateY(100%)");
    fireTransitionEnd(panel, "transform");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("exit: pointer input during the exit is inert and never restarts a drag", () => {
    const { onDismiss, result } = render();
    result.current.beginExit();
    fire(handle, "pointerdown", 0, 0);
    fire(handle, "pointermove", 300, 16);
    // Still parked at the exit transform — the drag never engaged.
    expect(panel.style.transform).toBe("translateY(100%)");
    expect(onDismiss).not.toHaveBeenCalled();
    fireTransitionEnd(panel, "transform");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("exit: reduced motion dismisses immediately with no travel animation", () => {
    stubMatchMedia(true);
    const { onDismiss, result } = render();
    result.current.beginExit();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(panel.style.transform).toBe("");
    expect(panel.style.transition).toBe("");
  });

  it("exit: unmounting mid-exit cancels the timer/listener and never dismisses after unmount", () => {
    vi.useFakeTimers();
    try {
      const { onDismiss, result, unmount } = render();
      result.current.beginExit();
      expect(panel.style.transform).toBe("translateY(100%)");
      unmount();
      // The fallback timer is cleared…
      vi.advanceTimersByTime(600);
      expect(onDismiss).not.toHaveBeenCalled();
      // …and a late transitionend after unmount is inert (listener removed).
      fireTransitionEnd(panel, "transform");
      expect(onDismiss).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("exit: a completed cycle resets exiting so a second drag dismisses again — no remount", () => {
    const { onDismiss } = render();
    fire(handle, "pointerdown", 0, 0);
    fire(handle, "pointermove", 250, 1000);
    fire(handle, "pointerup", 250, 2000);
    fireTransitionEnd(panel, "transform");
    expect(onDismiss).toHaveBeenCalledTimes(1);

    fire(handle, "pointerdown", 0, 3000);
    fire(handle, "pointermove", 250, 4000);
    fire(handle, "pointerup", 250, 5000);
    expect(panel.style.transform).toBe("translateY(100%)");
    fireTransitionEnd(panel, "transform");
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("disabled: beginExit dismisses immediately with no transform write", () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() =>
      useDragToDismiss({ current: panel } as RefObject<HTMLElement>, { onDismiss, enabled: false }),
    );
    result.current.beginExit();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(panel.style.transform).toBe("");
    expect(panel.style.transition).toBe("");
  });

  it("disabled: returns empty prop objects", () => {
    const { result } = renderHook(() =>
      useDragToDismiss({ current: panel } as RefObject<HTMLElement>, {
        onDismiss: vi.fn(),
        enabled: false,
      }),
    );
    expect(result.current.handleProps).toEqual({});
    expect(result.current.contentProps).toEqual({});
  });
});
