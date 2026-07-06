import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Segmented from "@/components/ui/Segmented";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
] as const;

describe("Segmented", () => {
  it("renders a radiogroup with the active option checked", () => {
    render(<Segmented options={OPTIONS} value="b" onChange={() => {}} label="Greek" />);
    expect(screen.getByRole("radiogroup", { name: "Greek" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Alpha" })).toHaveAttribute("aria-checked", "false");
  });

  it("fires onChange with the clicked value", async () => {
    const onChange = vi.fn();
    render(<Segmented options={OPTIONS} value="a" onChange={onChange} label="Greek" />);
    await userEvent.click(screen.getByRole("radio", { name: "Gamma" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("roving tabindex: only the active option is tabbable", () => {
    render(<Segmented options={OPTIONS} value="b" onChange={() => {}} label="Greek" />);
    expect(screen.getByRole("radio", { name: "Alpha" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveAttribute("tabindex", "0");
  });

  it("ArrowRight moves to the next option", async () => {
    const onChange = vi.fn();
    render(<Segmented options={OPTIONS} value="a" onChange={onChange} label="Greek" />);
    screen.getByRole("radio", { name: "Alpha" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("ArrowLeft wraps from first to last", async () => {
    const onChange = vi.fn();
    render(<Segmented options={OPTIONS} value="a" onChange={onChange} label="Greek" />);
    screen.getByRole("radio", { name: "Alpha" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledWith("c");
  });
});
