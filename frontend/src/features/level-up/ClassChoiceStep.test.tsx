import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ClassChoiceStep from "@/features/level-up/ClassChoiceStep";
import type { ClassChoiceOption } from "@/lib/levelUpClassChoice";

const OPTIONS: ClassChoiceOption[] = [
  { target: { kind: "existing", classEntryId: "entry-1" }, name: "Fighter", levelLine: "Level 5 → 6", eligible: true },
  { target: { kind: "new", classId: "cls-rogue" }, name: "Rogue", levelLine: "New class — Level 1", eligible: true },
  {
    target: { kind: "new", classId: "cls-wizard" },
    name: "Wizard",
    levelLine: "New class — Level 1",
    eligible: false,
    requirement: "Intelligence 13",
  },
];

describe("ClassChoiceStep", () => {
  it("renders every option, disabling the ineligible one with its requirement", () => {
    render(
      <ClassChoiceStep options={OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByRole("radio", { name: "Fighter" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Rogue" })).toBeEnabled();
    const wizard = screen.getByRole("radio", { name: "Wizard" });
    expect(wizard).toBeDisabled();
    expect(screen.getByText(/requires intelligence 13/i)).toBeInTheDocument();
  });

  it("Continue is disabled until an option is picked, when there's no initial selection", () => {
    render(
      <ClassChoiceStep options={OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("preselects the deep-linked target and routes Continue to it", async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(
      <ClassChoiceStep
        options={OPTIONS}
        initialTarget={{ kind: "new", classId: "cls-rogue" }}
        onContinue={onContinue}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", { name: "Rogue" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledWith({ kind: "new", classId: "cls-rogue" });
  });

  it("picking a different eligible option updates the selection and routes Continue to it", async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(
      <ClassChoiceStep
        options={OPTIONS}
        initialTarget={{ kind: "existing", classEntryId: "entry-1" }}
        onContinue={onContinue}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Rogue" }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledWith({ kind: "new", classId: "cls-rogue" });
  });

  it("clicking the disabled ineligible option does not select it", async () => {
    const user = userEvent.setup();
    render(
      <ClassChoiceStep options={OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={vi.fn()} />,
    );
    await user.click(screen.getByRole("radio", { name: "Wizard" }));
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("Cancel calls onCancel", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ClassChoiceStep options={OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
