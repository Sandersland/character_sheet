import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  loadThemePreference,
  saveThemePreference,
  getSystemTheme,
  resolveTheme,
} from "@/hooks/useThemePreference";

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
});
