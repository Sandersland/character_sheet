import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DiceInput, { type DiceValue } from "@/components/ui/DiceInput";

const base: DiceValue = { count: "1", faces: "6" };

describe("DiceInput", () => {
  it("renders count and faces only by default", () => {
    render(<DiceInput value={base} onChange={() => {}} label="Damage" idPrefix="d" />);
    expect(screen.getByLabelText("Damage dice count")).toHaveValue(1);
    expect(screen.getByLabelText("Damage dice faces")).toHaveValue(6);
    expect(screen.queryByLabelText("Damage modifier")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Damage type")).not.toBeInTheDocument();
  });

  it("shows modifier and type when enabled", () => {
    render(
      <DiceInput
        value={{ ...base, modifier: "2", type: "fire" }}
        onChange={() => {}}
        label="Damage"
        idPrefix="d"
        showModifier
        showType
      />,
    );
    expect(screen.getByLabelText("Damage modifier")).toHaveValue(2);
    expect(screen.getByLabelText("Damage type")).toHaveValue("fire");
  });

  it("emits a merged value on count edit", async () => {
    const onChange = vi.fn();
    render(<DiceInput value={base} onChange={onChange} label="Damage" idPrefix="d" />);
    await userEvent.type(screen.getByLabelText("Damage dice count"), "2");
    expect(onChange).toHaveBeenCalledWith({ count: "12", faces: "6" });
  });

  it("forces text-parchment-900 on numeric inputs for dark-mode contrast", () => {
    render(<DiceInput value={base} onChange={() => {}} label="Damage" idPrefix="d" />);
    expect(screen.getByLabelText("Damage dice count").className).toContain("text-parchment-900");
  });
});
