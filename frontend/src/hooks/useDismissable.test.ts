import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useDismissable } from "@/hooks/useDismissable";

function setup(open: boolean) {
  const wrapper = document.createElement("div");
  const outside = document.createElement("div");
  document.body.appendChild(wrapper);
  document.body.appendChild(outside);
  const wrapperRef = { current: wrapper };
  const onEscape = vi.fn();
  const onOutsideClick = vi.fn();
  const utils = renderHook(
    ({ open }) => useDismissable({ open, wrapperRef, onEscape, onOutsideClick }),
    { initialProps: { open } },
  );
  return { ...utils, wrapper, outside, onEscape, onOutsideClick };
}

describe("useDismissable", () => {
  it("calls onEscape on Escape keydown while open", () => {
    const { onEscape } = setup(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("ignores non-Escape keys", () => {
    const { onEscape } = setup(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("calls onOutsideClick on mousedown outside the wrapper", () => {
    const { onOutsideClick, outside } = setup(true);
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onOutsideClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onOutsideClick on mousedown inside the wrapper", () => {
    const { onOutsideClick, wrapper } = setup(true);
    wrapper.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it("does not attach listeners while closed", () => {
    const { onEscape, onOutsideClick, outside } = setup(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onEscape).not.toHaveBeenCalled();
    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it("removes listeners once open flips back to false", () => {
    const { onEscape, onOutsideClick, outside, rerender } = setup(true);
    rerender({ open: false });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onEscape).not.toHaveBeenCalled();
    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it("removes listeners on unmount", () => {
    const { onEscape, onOutsideClick, outside, unmount } = setup(true);
    unmount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onEscape).not.toHaveBeenCalled();
    expect(onOutsideClick).not.toHaveBeenCalled();
  });
});
