import { render, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useScrollCollapse } from "@/features/character-meta/useScrollCollapse";

type IOEntry = { isIntersecting: boolean };
class MockIO {
  static instances: MockIO[] = [];
  callback: (entries: IOEntry[]) => void;
  options: IntersectionObserverInit;
  observed: Element[] = [];
  disconnected = false;
  constructor(cb: (entries: IOEntry[]) => void, options: IntersectionObserverInit = {}) {
    this.callback = cb;
    this.options = options;
    MockIO.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  takeRecords(): IOEntry[] {
    return [];
  }
  emit(isIntersecting: boolean) {
    act(() => this.callback([{ isIntersecting }]));
  }
}

// The collapse observer carries the threshold top margin; the expand one has none.
const collapseObs = () => MockIO.instances.find((o) => (o.options.rootMargin ?? "").startsWith("16"))!;
const expandObs = () => MockIO.instances.find((o) => !(o.options.rootMargin ?? "").startsWith("16"))!;

let collapsedState = false;
function Harness() {
  const { scrollRef, sentinelRef, collapsed } = useScrollCollapse();
  collapsedState = collapsed;
  return (
    <div ref={scrollRef}>
      <div ref={sentinelRef} />
    </div>
  );
}

let original: typeof IntersectionObserver;
beforeEach(() => {
  original = globalThis.IntersectionObserver;
  MockIO.instances = [];
  collapsedState = false;
  globalThis.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;
  vi.useFakeTimers();
});
afterEach(() => {
  globalThis.IntersectionObserver = original;
  vi.useRealTimers();
});

describe("useScrollCollapse hysteresis (#1083)", () => {
  it("registers two observers on the sentinel — a threshold collapse margin + a 0px expand margin", () => {
    render(<Harness />);
    expect(MockIO.instances).toHaveLength(2);
    expect(collapseObs().options.rootMargin).toBe("16px 0px 0px 0px");
    // Expand observer uses no explicit margin (browser default 0px) so it re-enters at the very top.
    expect(expandObs().options.rootMargin ?? "0px").not.toContain("16");
    expect(collapseObs().observed).toHaveLength(1);
    expect(expandObs().observed).toHaveLength(1);
    expect(collapseObs().observed[0]).toBe(expandObs().observed[0]);
  });

  it("collapses when the sentinel leaves the collapse observer", () => {
    render(<Harness />);
    expect(collapsedState).toBe(false);
    collapseObs().emit(false);
    expect(collapsedState).toBe(true);
  });

  it("does NOT flip on expand-observer jitter inside the dead zone (core flicker guard)", () => {
    render(<Harness />);
    expect(collapsedState).toBe(false);
    // Resting inside the dead zone: neither observer has crossed its threshold — a naive single-observer would collapse here.
    expandObs().emit(false);
    expect(collapsedState).toBe(false);
    expandObs().emit(true);
    expect(collapsedState).toBe(false);
  });

  it("stays collapsed on collapse-observer re-enter; only the expand observer re-expands", () => {
    render(<Harness />);
    collapseObs().emit(false);
    expect(collapsedState).toBe(true);
    collapseObs().emit(true);
    expect(collapsedState).toBe(true);
    // Re-expand needs both the expand observer to enter and the debounce window to elapse without a reversal.
    expandObs().emit(true);
    expect(collapsedState).toBe(true);
    act(() => vi.advanceTimersByTime(120));
    expect(collapsedState).toBe(false);
  });

  it("debounces the re-expand commit so a same-gesture bounce doesn't snap the header open (#1859)", () => {
    render(<Harness />);
    collapseObs().emit(false);
    expect(collapsedState).toBe(true);
    // Simulates a momentum-scroll graze past the top that immediately bounces back out.
    expandObs().emit(true);
    act(() => vi.advanceTimersByTime(60));
    expect(collapsedState).toBe(true);
    collapseObs().emit(false);
    act(() => vi.advanceTimersByTime(120));
    expect(collapsedState).toBe(true);
  });

  it("commits the re-expand once the debounce window elapses without a reversal (#1859)", () => {
    render(<Harness />);
    collapseObs().emit(false);
    expandObs().emit(true);
    act(() => vi.advanceTimersByTime(119));
    expect(collapsedState).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(collapsedState).toBe(false);
  });

  it("disconnects both observers on unmount", () => {
    const { unmount } = render(<Harness />);
    const [a, b] = MockIO.instances;
    unmount();
    expect(a.disconnected).toBe(true);
    expect(b.disconnected).toBe(true);
  });

  it("cancels a pending re-expand timer on unmount (#1859, no setState-after-unmount)", () => {
    const { unmount } = render(<Harness />);
    collapseObs().emit(false);
    expect(collapsedState).toBe(true);
    expandObs().emit(true);
    expect(collapsedState).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    // React no-ops a setState dispatched after unmount, so collapsedState alone can't distinguish a cleared timer from one that fired into the void — check the timer queue directly.
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(120));
    expect(collapsedState).toBe(true);
  });
});
