import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { axe } from "@/test/axe";
import EditionPicker from "@/components/ui/EditionPicker";
import { SERVED_EDITIONS } from "@/test/editions";

const [ROW_2024, ROW_2014] = SERVED_EDITIONS;

describe("EditionPicker (#1286)", () => {
  it("renders a radiogroup with the two editions, 2024 first, the value checked", () => {
    render(<EditionPicker rows={SERVED_EDITIONS} value="EDITION_2024" onChange={() => {}} />);
    const group = screen.getByRole("radiogroup");
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["2024 rules", "2014 rules"]);
    expect(within(group).getByRole("radio", { name: "2024 rules" })).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: "2014 rules" })).toHaveAttribute("aria-checked", "false");
  });

  // #1436: order comes from the rows, the checked card from `value`, and nothing
  // in this component couples them. Handed a 2014-FIRST list with value 2024, any
  // positional implementation ("index 0 is the default") checks the wrong card —
  // which is precisely the divergence between the two same-named, opposite-order
  // RULES_EDITIONS arrays this issue deleted.
  it("renders rows in the order given, independently of which one is checked", () => {
    render(<EditionPicker rows={[ROW_2014, ROW_2024]} value="EDITION_2024" onChange={() => {}} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["2014 rules", "2024 rules"]);
    expect(screen.getByRole("radio", { name: "2024 rules" })).toHaveAttribute("aria-checked", "true");
    expect(radios[0]).toHaveAttribute("aria-checked", "false");
  });

  // #1372 restores this to a positive assertion: 2014 fires onChange like any
  // other row, since #1436's rows carry no unavailableReason for it any more.
  it("fires onChange with the clicked edition", async () => {
    const onChange = vi.fn();
    render(<EditionPicker rows={SERVED_EDITIONS} value="EDITION_2024" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "2014 rules" }));
    expect(onChange).toHaveBeenCalledWith("EDITION_2014");
  });

  it("never renders raw SRD citation text (2014/2024 in plain words only)", () => {
    render(<EditionPicker rows={SERVED_EDITIONS} value="EDITION_2024" onChange={() => {}} />);
    expect(screen.queryByText(/SRD/i)).not.toBeInTheDocument();
  });

  // #1372 restores this to a positive assertion: ArrowRight roves over both
  // rows and selects 2014, since neither is filtered out any more.
  it("arrow keys rove over both editions and can select 2014", async () => {
    const onChange = vi.fn();
    render(<EditionPicker rows={SERVED_EDITIONS} value="EDITION_2024" onChange={onChange} />);
    const first = screen.getByRole("radio", { name: "2024 rules" });
    expect(first).toHaveAttribute("tabindex", "0");
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("EDITION_2014");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <EditionPicker rows={SERVED_EDITIONS} value="EDITION_2024" onChange={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
