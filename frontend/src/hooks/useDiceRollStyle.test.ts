import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadDiceRollStyle,
  saveDiceRollStyle,
  useDiceRollStylePreference,
} from "@/hooks/useDiceRollStyle";

const KEY = "cs:pref:diceRoll";

describe("useDiceRollStyle", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("defaults to animated when nothing is stored", () => {
    expect(loadDiceRollStyle()).toBe("animated");
  });

  it("ignores a corrupted stored value", () => {
    localStorage.setItem(KEY, "sparkles");
    expect(loadDiceRollStyle()).toBe("animated");
  });

  it("persists and reads back a chosen style", () => {
    saveDiceRollStyle("quick");
    expect(localStorage.getItem(KEY)).toBe("quick");
    expect(loadDiceRollStyle()).toBe("quick");
  });

  it("hook reads once on mount and persists on change", () => {
    localStorage.setItem(KEY, "quick");
    const { result } = renderHook(() => useDiceRollStylePreference());
    expect(result.current[0]).toBe("quick");

    act(() => result.current[1]("animated"));
    expect(result.current[0]).toBe("animated");
    expect(localStorage.getItem(KEY)).toBe("animated");
  });
});
