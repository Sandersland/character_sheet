import { createElement, type ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadDiceRollStyle,
  saveDiceRollStyle,
  useDiceRollStylePreference,
} from "@/hooks/useDiceRollStyle";
import { PreferencesContext } from "@/hooks/usePreferencesSync";
import type { UserPreferences } from "@/types/auth";

const KEY = "cs:pref:diceRoll";

const SYNCED: UserPreferences = { theme: "system", diceRollStyle: "quick", autoRollConcentration: true };

// Stands in for PreferencesProvider (#1178) so these stay unit tests of the
// hook alone — PreferencesProvider's own tests cover the reconcile-on-login logic.
function withSynced(synced: UserPreferences | undefined, setPreference = vi.fn()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      PreferencesContext.Provider,
      { value: { synced, setPreference, sync: { saving: {}, errors: {} } } },
      children,
    );
  };
}

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

  describe("sync (#1178)", () => {
    it("falls back to localStorage when no synced value exists", () => {
      localStorage.setItem(KEY, "quick");
      const { result } = renderHook(() => useDiceRollStylePreference());
      expect(result.current[0]).toBe("quick");
    });

    it("prefers the synced value over a differing localStorage value once loaded", () => {
      localStorage.setItem(KEY, "animated");
      const { result } = renderHook(() => useDiceRollStylePreference(), {
        wrapper: withSynced(SYNCED),
      });
      expect(result.current[0]).toBe("quick");
    });

    it("writing mirrors into localStorage and pushes through setPreference", () => {
      const setPreference = vi.fn();
      const { result } = renderHook(() => useDiceRollStylePreference(), {
        wrapper: withSynced(undefined, setPreference),
      });

      act(() => result.current[1]("quick"));

      expect(result.current[0]).toBe("quick");
      expect(localStorage.getItem(KEY)).toBe("quick");
      expect(setPreference).toHaveBeenCalledWith("diceRollStyle", "quick");
    });
  });
});
