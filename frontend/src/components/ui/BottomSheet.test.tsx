import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import BottomSheet from "@/components/ui/BottomSheet";

// jsdom's matchMedia stub reports matches:false for every query, so useIsBelowMd
// resolves to mobile — the default here. Desktop cases stub a matching min-width.
function stubDesktop() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function panelOf(baseElement: HTMLElement) {
  return baseElement.querySelector('[role="dialog"]') as HTMLElement;
}

function fireTransitionEnd(el: HTMLElement) {
  const e = new Event("transitionend", { bubbles: true });
  Object.defineProperty(e, "propertyName", { value: "transform" });
  el.dispatchEvent(e);
}

describe("BottomSheet", () => {
  it("renders the title, subtitle and children", () => {
    render(
      <BottomSheet title="Action" subtitle="Pick one" onClose={vi.fn()}>
        <button type="button">Attack</button>
      </BottomSheet>,
    );
    expect(screen.getByRole("heading", { name: "Action" })).toBeInTheDocument();
    expect(screen.getByText("Pick one")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attack" })).toBeInTheDocument();
  });

  it("mobile Escape animates the sheet out, firing onClose only after the slide-out", async () => {
    const onClose = vi.fn();
    const { baseElement } = render(
      <BottomSheet title="Action" onClose={onClose}>
        <p>body</p>
      </BottomSheet>,
    );
    await userEvent.keyboard("{Escape}");
    const panel = panelOf(baseElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe("translateY(100%)");
    fireTransitionEnd(panel);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mobile grabber tap slides out then closes", async () => {
    const onClose = vi.fn();
    const { baseElement } = render(
      <BottomSheet title="Action" onClose={onClose}>
        <p>body</p>
      </BottomSheet>,
    );
    const grabber = baseElement.querySelector('button[aria-label="Close"]') as HTMLElement;
    expect(grabber.tagName).toBe("BUTTON");
    await userEvent.click(grabber);
    const panel = panelOf(baseElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe("translateY(100%)");
    fireTransitionEnd(panel);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mobile scrim mouse-down slides out then closes, fading the scrim in sync", async () => {
    const onClose = vi.fn();
    const { baseElement } = render(
      <BottomSheet title="Action" onClose={onClose}>
        <p>body</p>
      </BottomSheet>,
    );
    const scrim = baseElement.querySelector('[role="presentation"]') as HTMLElement;
    await userEvent.pointer({ target: scrim, keys: "[MouseLeft]" });
    expect(onClose).not.toHaveBeenCalled();
    // Scrim fades out on a matching ~500ms opacity transition.
    expect(scrim.className).toContain("opacity-0");
    expect(scrim.className).toContain("transition-opacity");
    fireTransitionEnd(panelOf(baseElement));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mobile close fires onClose exactly once even if transitionend and the fallback both fire", () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      const { baseElement } = render(
        <BottomSheet title="Action" onClose={onClose}>
          <p>body</p>
        </BottomSheet>,
      );
      const grabber = baseElement.querySelector('button[aria-label="Close"]') as HTMLElement;
      fireEvent.click(grabber);
      fireTransitionEnd(panelOf(baseElement));
      vi.advanceTimersByTime(600);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("desktop (md+) closes instantly with no slide-out", () => {
    stubDesktop();
    try {
      const onClose = vi.fn();
      const { baseElement } = render(
        <BottomSheet title="Action" onClose={onClose}>
          <p>body</p>
        </BottomSheet>,
      );
      fireEvent.click(screen.getByText("Close"));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(panelOf(baseElement).style.transform).toBe("");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps a desktop-only text Close button (hidden below md, shown at md+)", () => {
    render(
      <BottomSheet title="Action" onClose={vi.fn()}>
        <p>body</p>
      </BottomSheet>,
    );
    const textClose = screen.getByText("Close");
    expect(textClose.tagName).toBe("BUTTON");
    expect(textClose.className).toContain("hidden");
    expect(textClose.className).toContain("md:block");
  });

  it("caps the mobile panel to the visible viewport height so the body clears the keyboard (#784)", () => {
    vi.stubGlobal("visualViewport", { height: 420, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    try {
      const { baseElement } = render(
        <BottomSheet title="Action" onClose={vi.fn()}>
          <p>body</p>
        </BottomSheet>,
      );
      expect(panelOf(baseElement).style.maxHeight).toBe("min(85vh, 420px)");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not cap the panel height at md+ (desktop keeps its CSS max-height)", () => {
    stubDesktop();
    try {
      const { baseElement } = render(
        <BottomSheet title="Action" onClose={vi.fn()}>
          <p>body</p>
        </BottomSheet>,
      );
      expect(panelOf(baseElement).style.maxHeight).toBe("");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("drops the grabber handle on desktop (md+) — it's a thumb-drag affordance", () => {
    const { baseElement } = render(
      <BottomSheet title="Action" onClose={vi.fn()}>
        <p>body</p>
      </BottomSheet>,
    );
    const grabber = baseElement.querySelector('button[aria-label="Close"]');
    expect(grabber).not.toBeNull();
    expect(grabber!.className).toContain("md:hidden");
  });

  it("grabber carries no md: utility other than md:hidden", () => {
    const { baseElement } = render(
      <BottomSheet title="Action" onClose={vi.fn()}>
        <p>body</p>
      </BottomSheet>,
    );
    const grabber = baseElement.querySelector('button[aria-label="Close"]') as HTMLElement;
    const mdClasses = grabber.className.split(/\s+/).filter((c) => c.startsWith("md:"));
    expect(mdClasses).toEqual(["md:hidden"]);
  });

  it("mobile scrim carries the opacity-fade transition utilities", () => {
    const { baseElement } = render(
      <BottomSheet title="Action" onClose={vi.fn()}>
        <p>body</p>
      </BottomSheet>,
    );
    const scrim = baseElement.querySelector('[role="presentation"]') as HTMLElement;
    expect(scrim.className).toContain("transition-opacity");
    expect(scrim.className).toContain("duration-500");
  });

  it("desktop (md+) scrim carries no transition utilities — it closes instantly", () => {
    stubDesktop();
    try {
      const { baseElement } = render(
        <BottomSheet title="Action" onClose={vi.fn()}>
          <p>body</p>
        </BottomSheet>,
      );
      const scrim = baseElement.querySelector('[role="presentation"]') as HTMLElement;
      expect(scrim.className).not.toContain("transition-opacity");
      expect(scrim.className).not.toContain("duration-500");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
