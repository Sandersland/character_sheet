// fallow-ignore-file unused-file -- loaded via vitest setupFiles in vite.config.ts, not imported
import "@testing-library/jest-dom/vitest";
import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import { toHaveNoViolations } from "jest-axe";

// Explicit cleanup because globals: false disables RTL's auto-cleanup.
afterEach(() => cleanup());

// Register the jest-axe matcher globally so any component test can assert
// `expect(await axe(container)).toHaveNoViolations()`. Imported via @/test/axe.
expect.extend(toHaveNoViolations);

// jsdom lacks PointerEvent; polyfill a minimal one over MouseEvent so gesture
// tests dispatch real pointer events carrying pointerId.
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
    }
  }
  globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

// Default no-op matchMedia stub (jsdom lacks it); tests can override per-case.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
