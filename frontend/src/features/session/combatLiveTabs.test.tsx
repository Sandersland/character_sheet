import { describe, it, expect } from "vitest";

import { nextTabForKey } from "@/features/session/combatLiveTabs";

// #962 review follow-up: the Turn/Log tablist honors the WAI-ARIA keyboard
// pattern — Arrow keys wrap between the two tabs, Home/End jump to the ends,
// and any other key is a no-op (returns null).
describe("nextTabForKey", () => {
  it("wraps forward with ArrowRight/ArrowDown", () => {
    expect(nextTabForKey("ArrowRight", "turn")).toBe("log");
    expect(nextTabForKey("ArrowRight", "log")).toBe("turn");
    expect(nextTabForKey("ArrowDown", "turn")).toBe("log");
  });

  it("wraps backward with ArrowLeft/ArrowUp", () => {
    expect(nextTabForKey("ArrowLeft", "log")).toBe("turn");
    expect(nextTabForKey("ArrowLeft", "turn")).toBe("log");
    expect(nextTabForKey("ArrowUp", "log")).toBe("turn");
  });

  it("jumps to the ends with Home/End", () => {
    expect(nextTabForKey("Home", "log")).toBe("turn");
    expect(nextTabForKey("End", "turn")).toBe("log");
  });

  it("returns null for unhandled keys", () => {
    expect(nextTabForKey("Enter", "turn")).toBeNull();
    expect(nextTabForKey("a", "log")).toBeNull();
    expect(nextTabForKey(" ", "turn")).toBeNull();
  });
});
