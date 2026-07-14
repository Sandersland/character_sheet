import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useMobileScrollLock } from "@/hooks/useMobileScrollLock";

describe("useMobileScrollLock", () => {
  // jsdom doesn't implement scrollTo; give it a durable noop so React's cleanup
  // (which may run in RTL's post-test auto-cleanup) never hits the real stub and
  // warns. The restore-scroll test installs its own spy over this.
  beforeEach(() => {
    window.scrollTo = () => {};
  });

  afterEach(() => {
    document.body.removeAttribute("style");
    vi.restoreAllMocks();
  });

  it("pins the body with position:fixed at the negated scroll offset while mounted", () => {
    Object.defineProperty(window, "scrollY", { value: 240, configurable: true });
    renderHook(() => useMobileScrollLock());
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-240px");
    expect(document.body.style.width).toBe("100%");
  });

  it("restores the prior body styles and scroll position on unmount", () => {
    Object.defineProperty(window, "scrollY", { value: 180, configurable: true });
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;
    const { unmount } = renderHook(() => useMobileScrollLock());
    unmount();
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(scrollTo).toHaveBeenCalledWith(0, 180);
  });

  it("preserves any pre-existing inline body styles", () => {
    document.body.style.position = "relative";
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    const { unmount } = renderHook(() => useMobileScrollLock());
    expect(document.body.style.position).toBe("fixed");
    unmount();
    expect(document.body.style.position).toBe("relative");
  });
});
