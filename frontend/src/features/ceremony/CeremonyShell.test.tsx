import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CeremonyFooter } from "@/features/ceremony/CeremonyShell";

const baseProps = {
  isFirst: false,
  isLast: true,
  onCancel: () => {},
  onBack: () => {},
  onContinue: () => {},
  canContinue: true,
  onConfirm: () => {},
  confirmLabel: "Create",
  confirmClassName: "",
};

describe("CeremonyFooter confirm gating", () => {
  it("disables confirm when confirmDisabled, without the submitting busy state", () => {
    render(<CeremonyFooter {...baseProps} submitting={false} confirmDisabled />);
    const btn = screen.getByRole("button", { name: "Create" });
    expect(btn).toBeDisabled();
    expect(btn).not.toHaveAttribute("aria-busy", "true");
  });

  it("disables confirm and marks it busy while submitting", () => {
    render(<CeremonyFooter {...baseProps} submitting confirmDisabled={false} />);
    const btn = screen.getByRole("button", { name: "Create" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("enables confirm when neither submitting nor confirmDisabled", () => {
    render(<CeremonyFooter {...baseProps} submitting={false} />);
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  });
});
