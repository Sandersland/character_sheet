import { createElement, type ReactNode } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import {
  loadAutoRollConcentration,
  saveAutoRollConcentration,
  useAutoRollConcentrationPref,
} from "@/features/hitpoints/concentrationPreference";
import { PreferencesContext } from "@/hooks/usePreferencesSync";
import type { UserPreferences } from "@/types/auth";

const SYNCED: UserPreferences = { theme: "system", diceRollStyle: "animated", autoRollConcentration: false };

function withSynced(synced: UserPreferences | undefined, setPreference = vi.fn()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      PreferencesContext.Provider,
      { value: { synced, setPreference, sync: { saving: {}, errors: {} } } },
      children,
    );
  };
}

describe("auto-roll concentration preference (issue #76)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to true when nothing is stored", () => {
    expect(loadAutoRollConcentration()).toBe(true);
  });

  it("round-trips false and true", () => {
    saveAutoRollConcentration(false);
    expect(loadAutoRollConcentration()).toBe(false);
    saveAutoRollConcentration(true);
    expect(loadAutoRollConcentration()).toBe(true);
  });

  it("treats a corrupted value as the default (true)", () => {
    localStorage.setItem("cs:pref:autoRollConcentration", "garbage");
    expect(loadAutoRollConcentration()).toBe(true);
  });

  describe("useAutoRollConcentrationPref sync (#1178)", () => {
    it("falls back to localStorage when no synced value exists", () => {
      localStorage.setItem("cs:pref:autoRollConcentration", "false");
      const { result } = renderHook(() => useAutoRollConcentrationPref());
      expect(result.current[0]).toBe(false);
    });

    it("prefers the synced value over a differing localStorage value once loaded", () => {
      localStorage.setItem("cs:pref:autoRollConcentration", "true");
      const { result } = renderHook(() => useAutoRollConcentrationPref(), {
        wrapper: withSynced(SYNCED),
      });
      expect(result.current[0]).toBe(false);
    });

    it("writing mirrors into localStorage and pushes through setPreference", () => {
      const setPreference = vi.fn();
      const { result } = renderHook(() => useAutoRollConcentrationPref(), {
        wrapper: withSynced(undefined, setPreference),
      });

      act(() => result.current[1](false));

      expect(result.current[0]).toBe(false);
      expect(localStorage.getItem("cs:pref:autoRollConcentration")).toBe("false");
      expect(setPreference).toHaveBeenCalledWith("autoRollConcentration", false);
    });
  });
});
