import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Tabs from "@/components/ui/Tabs";

const TABS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
];

describe("Tabs", () => {
  it("renders all tab labels", () => {
    render(<Tabs tabs={TABS} active="a" onChange={() => {}} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("marks the active tab as aria-selected=true", () => {
    render(<Tabs tabs={TABS} active="b" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveAttribute("aria-selected", "false");
  });

  it("fires onChange with the clicked tab id", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} active="a" onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("roving tabindex: active tab has tabIndex=0, others have -1", () => {
    render(<Tabs tabs={TABS} active="b" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveAttribute("tabindex", "-1");
  });

  it("ArrowRight moves to the next tab and fires onChange", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} active="a" onChange={onChange} />);
    screen.getByRole("tab", { name: "Alpha" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("ArrowLeft wraps from first to last", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} active="a" onChange={onChange} />);
    screen.getByRole("tab", { name: "Alpha" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("ArrowRight wraps from last to first", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} active="c" onChange={onChange} />);
    screen.getByRole("tab", { name: "Gamma" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("Home key navigates to the first tab", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} active="c" onChange={onChange} />);
    screen.getByRole("tab", { name: "Gamma" }).focus();
    await userEvent.keyboard("{Home}");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("End key navigates to the last tab", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} active="a" onChange={onChange} />);
    screen.getByRole("tab", { name: "Alpha" }).focus();
    await userEvent.keyboard("{End}");
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("renders badge slot content", () => {
    const tabs = [{ id: "x", label: "Items", badge: <span>3</span> }];
    render(<Tabs tabs={tabs} active="x" onChange={() => {}} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("applies extra className to the tablist", () => {
    render(<Tabs tabs={TABS} active="a" onChange={() => {}} className="custom-cls" />);
    expect(screen.getByRole("tablist")).toHaveClass("custom-cls");
  });
});
