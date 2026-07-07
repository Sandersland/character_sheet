import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/axe";

import Popover from "@/components/ui/Popover";

function renderPopover(props: Partial<Parameters<typeof Popover>[0]> = {}) {
  return render(
    <Popover trigger={<span>17</span>} label="Armor Class breakdown" {...props}>
      <p>Breakdown details</p>
    </Popover>,
  );
}

describe("Popover", () => {
  it("trigger advertises a closed dialog disclosure", () => {
    renderPopover();
    const trigger = screen.getByRole("button", { name: "Armor Class breakdown" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on trigger click", async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
    expect(screen.getByRole("dialog", { name: "Armor Class breakdown" })).toBeInTheDocument();
    expect(screen.getByText("Breakdown details")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Armor Class breakdown" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("closes on a second trigger click", async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByRole("button", { name: "Armor Class breakdown" });
    await user.click(trigger);
    await user.click(trigger);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes and refocuses the trigger on Escape", async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByRole("button", { name: "Armor Class breakdown" });
    await user.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when a mousedown happens outside the wrapper", async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("aligns left by default", async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
    expect(screen.getByRole("dialog").className).toContain("left-0");
  });

  it("aligns right when align=right", async () => {
    const user = userEvent.setup();
    renderPopover({ align: "right" });
    await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
    expect(screen.getByRole("dialog").className).toContain("right-0");
  });

  describe("viewport-overflow auto-flip", () => {
    // jsdom has no layout, so simulate a real viewport + anchor position.
    function mockViewport(width: number, anchor: { left: number; right: number }) {
      Object.defineProperty(document.documentElement, "clientWidth", {
        value: width,
        configurable: true,
      });
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
        left: anchor.left,
        right: anchor.right,
        top: 100,
        bottom: 160,
        width: anchor.right - anchor.left,
        height: 60,
        x: anchor.left,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect);
    }

    afterEach(() => {
      vi.restoreAllMocks();
      // Remove the instance override so the prototype getter shows through again.
      delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
    });

    it("flips a left-aligned panel to right-0 when it would overflow the right edge", async () => {
      // Trigger near the right edge of a 390px viewport: left-aligned 224px panel
      // would end at 300 + 224 = 524 > 390 → must flip right.
      mockViewport(390, { left: 300, right: 360 });
      const user = userEvent.setup();
      renderPopover();
      await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
      expect(screen.getByRole("dialog").className).toContain("right-0");
    });

    it("flips a right-aligned panel to left-0 when it would overflow the left edge", async () => {
      // Trigger near the left edge: right-aligned 224px panel would start at
      // 90 - 224 = -134 < 0 → must flip left.
      mockViewport(390, { left: 30, right: 90 });
      const user = userEvent.setup();
      renderPopover({ align: "right" });
      await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
      expect(screen.getByRole("dialog").className).toContain("left-0");
    });

    it("keeps the preferred left alignment when the panel fits", async () => {
      mockViewport(390, { left: 30, right: 90 });
      const user = userEvent.setup();
      renderPopover();
      await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
      expect(screen.getByRole("dialog").className).toContain("left-0");
    });

    it("stays at the preferred alignment when the panel is wider than the viewport (both sides overflow)", async () => {
      // A 224px panel can't fit a 180px viewport either way, so the `!overflowsLeft`
      // guard suppresses the flip and it stays on the caller's preferred side.
      mockViewport(180, { left: 40, right: 100 });
      const user = userEvent.setup();
      renderPopover(); // default align="left"
      await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
      expect(screen.getByRole("dialog").className).toContain("left-0");
    });
  });

  it("applies className to the wrapper and triggerClassName to the trigger", () => {
    const { container } = renderPopover({ className: "my-wrap", triggerClassName: "my-trigger" });
    expect(container.firstChild).toHaveClass("my-wrap");
    expect(screen.getByRole("button", { name: "Armor Class breakdown" })).toHaveClass("my-trigger");
  });

  it("fires onClose on every open → closed transition (toggle, Escape, outside), not on open", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPopover({ onClose });
    const trigger = screen.getByRole("button", { name: "Armor Class breakdown" });
    await user.click(trigger); // open — must NOT fire onClose
    expect(onClose).not.toHaveBeenCalled();
    await user.click(trigger); // toggle closed
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(trigger); // open again
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    await user.click(trigger); // open again
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("passes a close() to a render-prop child that dismisses the panel, refocuses the trigger, and fires onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Popover trigger={<span>17</span>} label="Armor Class breakdown" onClose={onClose}>
        {(close) => (
          <button type="button" onClick={close}>
            Dismiss
          </button>
        )}
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: "Armor Class breakdown" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has no axe violations when open", async () => {
    const user = userEvent.setup();
    const { container } = renderPopover();
    await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
