import { describe, it, expect } from "vitest";

import { shouldDismissDrag } from "@/hooks/useDragToDismiss";

const SHEET = 600;

describe("shouldDismissDrag", () => {
  it("dismisses past the ~1/3-height distance threshold", () => {
    expect(shouldDismissDrag({ dy: 210, sheetHeight: SHEET, velocity: 0 })).toBe(true);
  });

  it("springs back below the distance threshold with no flick", () => {
    expect(shouldDismissDrag({ dy: 120, sheetHeight: SHEET, velocity: 0 })).toBe(false);
  });

  it("dismisses on a downward flick even below the distance threshold", () => {
    expect(shouldDismissDrag({ dy: 40, sheetHeight: SHEET, velocity: 1.2 })).toBe(true);
  });

  it("never dismisses on an upward drag, however far", () => {
    expect(shouldDismissDrag({ dy: -400, sheetHeight: SHEET, velocity: 0 })).toBe(false);
  });

  it("never dismisses on an upward flick", () => {
    expect(shouldDismissDrag({ dy: -10, sheetHeight: SHEET, velocity: -2 })).toBe(false);
  });

  it("treats a zero-distance release as a spring-back", () => {
    expect(shouldDismissDrag({ dy: 0, sheetHeight: SHEET, velocity: 0 })).toBe(false);
  });

  it("does not divide-by-zero on a zero-height sheet — a downward drag dismisses", () => {
    expect(shouldDismissDrag({ dy: 1, sheetHeight: 0, velocity: 0 })).toBe(true);
  });
});
