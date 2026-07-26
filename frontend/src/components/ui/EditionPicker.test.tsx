import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

  it("fires onChange with the clicked edition", async () => {
    const onChange = vi.fn();
    render(<EditionPicker value="EDITION_2024" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "2014 rules" }));
    expect(onChange).toHaveBeenCalledWith("EDITION_2014");
  });

  it("never renders raw SRD citation text (2014/2024 in plain words only)", () => {
    render(<EditionPicker value="EDITION_2024" onChange={() => {}} />);
    expect(screen.queryByText(/SRD/i)).not.toBeInTheDocument();
  });

  it("roving tabindex + arrow-key navigation moves focus and selection together (#1111)", async () => {
    const onChange = vi.fn();
    render(<EditionPicker value="EDITION_2024" onChange={onChange} />);
    const first = screen.getByRole("radio", { name: "2024 rules" });
    const second = screen.getByRole("radio", { name: "2014 rules" });
    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");

    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("EDITION_2014");
    expect(second).toHaveFocus();
  });
});
