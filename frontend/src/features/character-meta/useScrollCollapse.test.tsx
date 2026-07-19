import { render, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useScrollCollapse } from "@/features/character-meta/useScrollCollapse";

// Controllable IntersectionObserver: capture each construction so a test can
// drive the collapse/expand observers independently and assert their options.
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
});
afterEach(() => {
  globalThis.IntersectionObserver = original;
});

describe("useScrollCollapse hysteresis (#1083)", () => {
  it("registers two observers on the sentinel — a threshold collapse margin + a 0px expand margin", () => {
    render(<Harness />);
    expect(MockIO.instances).toHaveLength(2);
    expect(collapseObs().options.rootMargin).toBe("16px 0px 0px 0px");
    // Expand observer uses no explicit margin (browser default 0px) so it re-enters at the very top.
    expect(expandObs().options.rootMargin ?? "0px").not.toContain("16");
    // Both watch the same sentinel.
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
    // Resting at ~8px: the 0px expand sentinel is out of view, but the collapse
    // threshold (16px) is not crossed — a naive single-observer would collapse here.
    expandObs().emit(false);
    expect(collapsedState).toBe(false);
    expandObs().emit(true);
    expect(collapsedState).toBe(false);
  });

  it("stays collapsed on collapse-observer re-enter; only the expand observer re-expands", () => {
    render(<Harness />);
    collapseObs().emit(false);
    expect(collapsedState).toBe(true);
    // Scrolled back into the dead zone: collapse observer re-enters — held collapsed.
    collapseObs().emit(true);
    expect(collapsedState).toBe(true);
    // Only reaching the very top (expand observer enters) re-expands.
    expandObs().emit(true);
    expect(collapsedState).toBe(false);
  });

  it("disconnects both observers on unmount", () => {
    const { unmount } = render(<Harness />);
    const [a, b] = MockIO.instances;
    unmount();
    expect(a.disconnected).toBe(true);
    expect(b.disconnected).toBe(true);
  });
});
