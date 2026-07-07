import { describe, expect, it, vi } from "vitest";
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

  it("passes a close() to a render-prop child that dismisses the panel and refocuses the trigger", async () => {
    const user = userEvent.setup();
    render(
      <Popover trigger={<span>17</span>} label="Armor Class breakdown">
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
  });

  it("has no axe violations when open", async () => {
    const user = userEvent.setup();
    const { container } = renderPopover();
    await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
