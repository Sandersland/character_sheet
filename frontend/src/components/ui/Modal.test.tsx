import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import Modal from "@/components/ui/Modal";

beforeEach(() => {
  // Reset overflow so each test starts clean.
  document.body.style.overflow = "";
});

describe("Modal", () => {
  it("renders into document.body as a portal", () => {
    render(<Modal title="Test" onClose={() => {}}>content</Modal>);
    const dialog = screen.getByRole("dialog");
    expect(document.body).toContainElement(dialog);
  });

  it("has aria-modal=true", () => {
    render(<Modal title="Test" onClose={() => {}}>content</Modal>);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("aria-labelledby points at the title element", () => {
    render(<Modal title="My Title" onClose={() => {}}>content</Modal>);
    const dialog = screen.getByRole("dialog");
    const titleId = dialog.getAttribute("aria-labelledby")!;
    expect(titleId).toBeTruthy();
    const titleEl = document.getElementById(titleId);
    expect(titleEl).toHaveTextContent("My Title");
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<Modal title="Test" onClose={onClose}>content</Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Close button is clicked", () => {
    const onClose = vi.fn();
    render(<Modal title="Test" onClose={onClose}>content</Modal>);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop is mousedown-ed", () => {
    const onClose = vi.fn();
    render(<Modal title="Test" onClose={onClose}>content</Modal>);
    const backdrop = screen.getByRole("dialog").parentElement!;
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does NOT call onClose when the panel is mousedown-ed", () => {
    const onClose = vi.fn();
    render(<Modal title="Test" onClose={onClose}>content</Modal>);
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("suppresses the panel's focus-visible outline — dialog focus is an a11y anchor, not a nav position", () => {
    render(<Modal title="Test" onClose={() => {}}>content</Modal>);
    expect(screen.getByRole("dialog").className).toContain("focus-visible:outline-none");
  });

  it("sets body overflow to hidden on mount and restores on unmount", () => {
    const { unmount } = render(<Modal title="Test" onClose={() => {}}>content</Modal>);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("restores focus to previously focused element on unmount", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(<Modal title="Test" onClose={() => {}}>content</Modal>);
    unmount();
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it("wraps Tab from last focusable to first (focus trap)", () => {
    render(
      <Modal title="Test" onClose={() => {}}>
        <button>Inner</button>
      </Modal>
    );
    // Focus the last focusable element in the panel (Inner button)
    screen.getByRole("button", { name: "Inner" }).focus();
    // Tab should wrap back to Close (first)
    fireEvent.keyDown(document, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("wraps Shift+Tab from first focusable to last (focus trap)", () => {
    render(
      <Modal title="Test" onClose={() => {}}>
        <button>Inner</button>
      </Modal>
    );
    // Focus the first focusable element (Close button)
    screen.getByRole("button", { name: "Close" }).focus();
    // Shift+Tab should wrap to Inner (last)
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Inner" }));
  });
});
