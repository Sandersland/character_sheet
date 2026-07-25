// fallow-ignore-file unused-file -- loaded via vitest setupFiles in vite.config.ts, not imported
import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import * as RTL from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toHaveNoViolations } from "jest-axe";

import { createQueryClient, getQueryClient, __setQueryClientForTests } from "@/api/queryClient";

// Every test file gets a live QueryClient without declaring a provider, so the
// ~200 existing `render(...)` call sites did not have to change (#1282).
// `vi.mock` here reaches every test file's `import { render } from
// "@testing-library/react"` because vitest resolves that import against the
// same mocked module registry the setup file ran in. A test's own `wrapper`
// still nests INSIDE ours — we compose rather than replace it.
vi.mock("@testing-library/react", async () => {
  const actual = await vi.importActual<typeof RTL>("@testing-library/react");
  function withQueryClient(ui: React.ReactElement) {
    return createElement(QueryClientProvider, { client: getQueryClient() }, ui);
  }
  return {
    ...actual,
    render: (ui: React.ReactElement, options?: RTL.RenderOptions) =>
      actual.render(ui, {
        ...options,
        wrapper: options?.wrapper
          ? ({ children }) => withQueryClient(createElement(options.wrapper!, null, children))
          : ({ children }) => withQueryClient(children as React.ReactElement),
      }),
    renderHook: <Result, Props>(
      hook: (props: Props) => Result,
      options?: RTL.RenderHookOptions<Props>,
    ) =>
      actual.renderHook(hook, {
        ...options,
        wrapper: options?.wrapper
          ? ({ children }) => withQueryClient(createElement(options.wrapper!, null, children))
          : ({ children }) => withQueryClient(children as React.ReactElement),
      }),
  };
});

// Fresh (not cleared) client per test: a cleared client keeps stale query
// observers around, which is the #282 flake class. A fresh instance has none.
beforeEach(() => __setQueryClientForTests(createQueryClient()));

// Explicit cleanup because globals: false disables RTL's auto-cleanup.
afterEach(() => cleanup());

// Register the jest-axe matcher globally so any component test can assert
// `expect(await axe(container)).toHaveNoViolations()`. Imported via @/test/axe.
expect.extend(toHaveNoViolations);

// jsdom lacks scrollIntoView; stub it so keyboard-nav scroll-into-view is a no-op.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

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

// jsdom lacks IntersectionObserver; stub a no-op so the header's scroll-collapse
// observer (useScrollCollapse) can construct without throwing.
if (typeof globalThis.IntersectionObserver === "undefined") {
  class IntersectionObserverStub {
    root = null;
    rootMargin = "";
    thresholds: number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;
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
