import { createElement, type ReactNode } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import {
  loadThemePreference,
  saveThemePreference,
  getSystemTheme,
  resolveTheme,
  useThemePreference,
} from "@/hooks/useThemePreference";
import { PreferencesContext } from "@/hooks/usePreferencesSync";
import type { UserPreferences } from "@/types/auth";

const SYNCED: UserPreferences = { theme: "light", diceRollStyle: "animated", autoRollConcentration: true };

function withSynced(synced: UserPreferences | undefined, setPreference = vi.fn()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      PreferencesContext.Provider,
      { value: { synced, setPreference, sync: { saving: {}, errors: {} } } },
      children,
    );
  };
}

function stubMatchMedia(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("theme preference (issue #210)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to system when nothing is stored", () => {
    expect(loadThemePreference()).toBe("system");
  });

  it("round-trips light, dark, and system", () => {
    saveThemePreference("light");
    expect(loadThemePreference()).toBe("light");
    saveThemePreference("dark");
    expect(loadThemePreference()).toBe("dark");
    saveThemePreference("system");
    expect(loadThemePreference()).toBe("system");
  });

  it("treats a corrupted value as the default (system)", () => {
    localStorage.setItem("cs:pref:theme", "garbage");
    expect(loadThemePreference()).toBe("system");
  });

  it("getSystemTheme reads matchMedia", () => {
    stubMatchMedia(true);
    expect(getSystemTheme()).toBe("dark");
    stubMatchMedia(false);
    expect(getSystemTheme()).toBe("light");
  });

  it("resolveTheme pins light/dark and follows system", () => {
    stubMatchMedia(true);
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("system")).toBe("dark");
    stubMatchMedia(false);
    expect(resolveTheme("system")).toBe("light");
  });

  describe("useThemePreference sync (#1178)", () => {
    it("falls back to localStorage when no synced value exists", () => {
      localStorage.setItem("cs:pref:theme", "dark");
      const { result } = renderHook(() => useThemePreference());
      expect(result.current[0]).toBe("dark");
    });

    it("prefers the synced value over a differing localStorage value once loaded", () => {
      localStorage.setItem("cs:pref:theme", "dark");
      const { result } = renderHook(() => useThemePreference(), {
        wrapper: withSynced(SYNCED),
      });
      expect(result.current[0]).toBe("light");
    });

    it("writing mirrors into localStorage and pushes through setPreference", () => {
      const setPreference = vi.fn();
      const { result } = renderHook(() => useThemePreference(), {
        wrapper: withSynced(undefined, setPreference),
      });

      act(() => result.current[1]("dark"));

      expect(result.current[0]).toBe("dark");
      expect(localStorage.getItem("cs:pref:theme")).toBe("dark");
      expect(setPreference).toHaveBeenCalledWith("theme", "dark");
    });
  });
});
