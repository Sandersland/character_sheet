import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/axe";

import DropdownMenu from "@/components/ui/DropdownMenu";

function renderMenu(props: Partial<Parameters<typeof DropdownMenu>[0]> = {}) {
  const onAlpha = vi.fn();
  const onBeta = vi.fn();
  const utils = render(
    <DropdownMenu trigger={<span>Open</span>} label="Account" {...props}>
      {(close) => (
        <>
          <div>identity row</div>
          <button type="button" role="menuitem" onClick={onAlpha}>
            Alpha
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onBeta();
              close();
            }}
          >
            Beta
          </button>
        </>
      )}
    </DropdownMenu>,
  );
  return { ...utils, onAlpha, onBeta };
}

describe("DropdownMenu", () => {
  it("trigger advertises a closed menu button", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Account" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on trigger click", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("ArrowDown on the trigger opens and focuses the first menuitem", async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Account" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Alpha" }));
  });

  it("closes and refocuses the trigger on Escape", async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Account" });
    await user.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when a mousedown happens outside the wrapper", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Arrow keys cycle over only menuitems, skipping the identity row", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));
    const alpha = screen.getByRole("menuitem", { name: "Alpha" });
    const beta = screen.getByRole("menuitem", { name: "Beta" });
    expect(document.activeElement).toBe(alpha);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(beta);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(alpha);
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(beta);
  });

  it("Home focuses first and End focuses last menuitem", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Beta" }));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Alpha" }));
  });

  it("invoking close from children closes the menu", async () => {
    const user = userEvent.setup();
    const { onBeta } = renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));
    await user.click(screen.getByRole("menuitem", { name: "Beta" }));
    expect(onBeta).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("aligns right by default", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByRole("menu").className).toContain("right-0");
  });

  it("aligns left when align=left", async () => {
    const user = userEvent.setup();
    renderMenu({ align: "left" });
    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByRole("menu").className).toContain("left-0");
  });

  it("applies className to the wrapper", () => {
    const { container } = renderMenu({ className: "my-wrap" });
    expect(container.firstChild).toHaveClass("my-wrap");
  });

  it("has no axe violations when open", async () => {
    const user = userEvent.setup();
    const { container } = renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
