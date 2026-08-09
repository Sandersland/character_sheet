import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { KeyboardEvent } from "react";

import { useRovingRadioGroup } from "@/hooks/useRovingRadioGroup";

function fakeButton(): HTMLButtonElement {
  return document.createElement("button");
}

function fakeEvent(key: string): KeyboardEvent<HTMLButtonElement> {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLButtonElement>;
}

describe("useRovingRadioGroup", () => {
  it("tabIndexFor falls back to the first option when nothing is checked", () => {
    const { result } = renderHook(() => useRovingRadioGroup(3, -1, vi.fn()));
    expect(result.current.tabIndexFor(0)).toBe(0);
    expect(result.current.tabIndexFor(1)).toBe(-1);
    expect(result.current.tabIndexFor(2)).toBe(-1);
  });

  it("ArrowRight moves selection to the next index, wrapping at the end", () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useRovingRadioGroup(3, 2, onSelect));
    result.current.itemRef(0)(fakeButton());
    result.current.itemRef(1)(fakeButton());
    result.current.itemRef(2)(fakeButton());
    result.current.keyDownFor(2)(fakeEvent("ArrowRight"));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  describe("disabled-option skipping (#1324)", () => {
    it("arrow navigation skips a disabled option in between", () => {
      const onSelect = vi.fn();
      const isDisabled = (i: number) => i === 1;
      const { result } = renderHook(() => useRovingRadioGroup(3, 0, onSelect, isDisabled));
      result.current.itemRef(0)(fakeButton());
      result.current.itemRef(1)(fakeButton());
      result.current.itemRef(2)(fakeButton());
      result.current.keyDownFor(0)(fakeEvent("ArrowRight"));
      expect(onSelect).toHaveBeenCalledWith(2);
    });

    it("arrow navigation never lands focus on a disabled option when wrapping", () => {
      const onSelect = vi.fn();
      const isDisabled = (i: number) => i === 0;
      const { result } = renderHook(() => useRovingRadioGroup(3, 1, onSelect, isDisabled));
      result.current.itemRef(0)(fakeButton());
      result.current.itemRef(1)(fakeButton());
      result.current.itemRef(2)(fakeButton());
      result.current.keyDownFor(1)(fakeEvent("ArrowLeft"));
      // index 0 is disabled, so wrapping from 1 going left must skip it and land on 2.
      expect(onSelect).toHaveBeenCalledWith(2);
    });

    it("the tabIndex fallback skips disabled options when nothing is checked", () => {
      const isDisabled = (i: number) => i === 0;
      const { result } = renderHook(() => useRovingRadioGroup(3, -1, vi.fn(), isDisabled));
      expect(result.current.tabIndexFor(0)).toBe(-1);
      expect(result.current.tabIndexFor(1)).toBe(0);
      expect(result.current.tabIndexFor(2)).toBe(-1);
    });

    // claude-review on #1865: with every OTHER option disabled, the scan
    // wraps all the way back to `from` -- which is itself enabled -- and
    // returned it as a "next" index, so arrow keys fired a redundant
    // onSelect(from) on every keypress instead of doing nothing.
    it("arrow navigation does not call onSelect when the current option is the only enabled one", () => {
      const onSelect = vi.fn();
      const isDisabled = (i: number) => i !== 1;
      const { result } = renderHook(() => useRovingRadioGroup(3, 1, onSelect, isDisabled));
      result.current.itemRef(0)(fakeButton());
      result.current.itemRef(1)(fakeButton());
      result.current.itemRef(2)(fakeButton());
      result.current.keyDownFor(1)(fakeEvent("ArrowRight"));
      result.current.keyDownFor(1)(fakeEvent("ArrowLeft"));
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe("Home/End (#1324)", () => {
    it("Home moves selection to the first enabled option", () => {
      const onSelect = vi.fn();
      const isDisabled = (i: number) => i === 0;
      const { result } = renderHook(() => useRovingRadioGroup(3, 2, onSelect, isDisabled));
      result.current.itemRef(0)(fakeButton());
      result.current.itemRef(1)(fakeButton());
      result.current.itemRef(2)(fakeButton());
      result.current.keyDownFor(2)(fakeEvent("Home"));
      expect(onSelect).toHaveBeenCalledWith(1);
    });

    it("End moves selection to the last enabled option", () => {
      const onSelect = vi.fn();
      const isDisabled = (i: number) => i === 2;
      const { result } = renderHook(() => useRovingRadioGroup(3, 0, onSelect, isDisabled));
      result.current.itemRef(0)(fakeButton());
      result.current.itemRef(1)(fakeButton());
      result.current.itemRef(2)(fakeButton());
      result.current.keyDownFor(0)(fakeEvent("End"));
      expect(onSelect).toHaveBeenCalledWith(1);
    });

    // claude-review on #1865: preventDefault sat after the "nothing to move
    // to" guard, so Home/End on an all-disabled group fell through to the
    // browser's default (scroll the page to top/bottom) instead of being
    // swallowed the way the pre-#1324 Segmented handler always did.
    it("Home still prevents the browser default when every option is disabled", () => {
      const onSelect = vi.fn();
      const isDisabled = () => true;
      const { result } = renderHook(() => useRovingRadioGroup(3, -1, onSelect, isDisabled));
      const event = fakeEvent("Home");
      result.current.keyDownFor(0)(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  // claude-review on #1865: itemRef(index) returned a brand-new closure on
  // every call, so React detached and reattached every button's ref on each
  // render (null -> element) even though nothing about that index changed.
  it("itemRef returns the same function reference for the same index across renders", () => {
    const { result, rerender } = renderHook(() => useRovingRadioGroup(3, 0, vi.fn()));
    const first = result.current.itemRef(1);
    rerender();
    const second = result.current.itemRef(1);
    expect(second).toBe(first);
  });
});
