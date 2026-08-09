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
  });
});
