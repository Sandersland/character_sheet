import "@testing-library/jest-dom/vitest";
import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import { toHaveNoViolations } from "jest-axe";

// Explicit cleanup because globals: false disables RTL's auto-cleanup.
afterEach(() => cleanup());

// Register the jest-axe matcher globally so any component test can assert
// `expect(await axe(container)).toHaveNoViolations()`. Imported via @/test/axe.
expect.extend(toHaveNoViolations);

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
