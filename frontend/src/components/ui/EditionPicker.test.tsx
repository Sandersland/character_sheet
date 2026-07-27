import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { axe } from "@/test/axe";
import EditionPicker from "@/components/ui/EditionPicker";

describe("EditionPicker (#1286)", () => {
  it("renders a radiogroup with the two editions, 2024 first, the value checked", () => {
    render(<EditionPicker value="EDITION_2024" onChange={() => {}} />);
    const group = screen.getByRole("radiogroup");
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["2024 rules", "2014 rules"]);
    expect(within(group).getByRole("radio", { name: "2024 rules" })).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: "2014 rules" })).toHaveAttribute("aria-checked", "false");
  });

  it("marks 2014 unavailable: aria-disabled, out of the tab order, with a hover reason and an announced one (#1371)", () => {
    render(<EditionPicker value="EDITION_2024" onChange={() => {}} />);
    const card = screen.getByRole("radio", { name: "2014 rules" });
    expect(card).toHaveAttribute("aria-disabled", "true");
    expect(card).toHaveAttribute("tabindex", "-1");
    expect(card).toHaveAttribute("title", expect.stringContaining("Not available yet"));
    expect(card).toHaveAccessibleDescription(/haven't shipped/);
    expect(screen.getByText("Not available yet")).toBeInTheDocument();
  });

  it("does not fire onChange when the unavailable 2014 card is clicked (#1371)", async () => {
    const onChange = vi.fn();
    render(<EditionPicker value="EDITION_2024" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "2014 rules" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fires onChange with the clicked selectable edition", async () => {
    const onChange = vi.fn();
    // Rendered with an unselectable value to pin the defensive checkedIndex === -1
    // path (2014 is filtered out of the roving index space, so its selection
    // never maps to a valid index).
    render(<EditionPicker value="EDITION_2014" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "2024 rules" }));
    expect(onChange).toHaveBeenCalledWith("EDITION_2024");
  });

  it("never renders raw SRD citation text (2014/2024 in plain words only)", () => {
    render(<EditionPicker value="EDITION_2024" onChange={() => {}} />);
    expect(screen.queryByText(/SRD/i)).not.toBeInTheDocument();
  });

  it("arrow keys rove only over selectable editions and never select 2014 (#1371)", async () => {
    const onChange = vi.fn();
    render(<EditionPicker value="EDITION_2024" onChange={onChange} />);
    const first = screen.getByRole("radio", { name: "2024 rules" });
    expect(first).toHaveAttribute("tabindex", "0");
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).not.toHaveBeenCalledWith("EDITION_2014");
    expect(first).toHaveFocus();
  });

  it("has no axe violations with an unavailable edition present", async () => {
    const { container } = render(<EditionPicker value="EDITION_2024" onChange={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
