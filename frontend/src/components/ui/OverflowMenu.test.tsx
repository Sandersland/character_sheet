import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import OverflowMenu from "@/components/ui/OverflowMenu";

function items() {
  return [
    { label: "Edit", onSelect: vi.fn() },
    { label: "Duplicate", onSelect: vi.fn() },
    { label: "Remove", onSelect: vi.fn(), danger: true, separatorBefore: true },
  ];
}

describe("OverflowMenu", () => {
  it("trigger advertises a closed menu button", () => {
    render(<OverflowMenu items={items()} />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on trigger click and renders all items as menuitems", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("button", { name: "More actions" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();
    const menuitems = screen.getAllByRole("menuitem");
    expect(menuitems.map((m) => m.textContent)).toEqual(["Edit", "Duplicate", "Remove"]);
  });

  it("invokes onSelect and closes when an item is clicked", async () => {
    const user = userEvent.setup();
    const list = items();
    render(<OverflowMenu items={list} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    expect(list[1].onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("returns focus to the trigger after selecting", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(document.activeElement).toBe(trigger);
  });

  it("closes and refocuses the trigger on Escape", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    await user.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when a mousedown happens outside the wrapper", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("focuses the first menuitem on open", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Edit" }));
  });

  it("ArrowDown advances and wraps last to first", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Duplicate" }));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Remove" }));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Edit" }));
  });

  it("ArrowUp wraps first to last", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Remove" }));
  });

  it("Home focuses first and End focuses last", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Remove" }));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Edit" }));
  });

  it("Enter on a focused item invokes it and closes", async () => {
    const user = userEvent.setup();
    const list = items();
    render(<OverflowMenu items={list} />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    await user.click(trigger);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(list[1].onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("roving tabindex: focused item is 0, others -1", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.keyboard("{ArrowDown}");
    const menuitems = screen.getAllByRole("menuitem");
    expect(menuitems[0]).toHaveAttribute("tabindex", "-1");
    expect(menuitems[1]).toHaveAttribute("tabindex", "0");
    expect(menuitems[2]).toHaveAttribute("tabindex", "-1");
  });

  it("danger item gets garnet text and separatorBefore adds a divider", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    const remove = screen.getByRole("menuitem", { name: "Remove" });
    expect(remove.className).toContain("text-garnet-700");
    expect(remove.className).toContain("border-t");
    expect(remove.className).toContain("border-parchment-200");
  });

  it("ArrowDown on the trigger opens and focuses the first item", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Edit" }));
  });

  it("respects the label prop for the trigger accessible name", () => {
    render(<OverflowMenu items={items()} label="Row actions" />);
    expect(screen.getByRole("button", { name: "Row actions" })).toBeInTheDocument();
  });

  it("applies className to the wrapper", () => {
    const { container } = render(<OverflowMenu items={items()} className="my-wrap" />);
    expect(container.firstChild).toHaveClass("my-wrap");
  });
});
