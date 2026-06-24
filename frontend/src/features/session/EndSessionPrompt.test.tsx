import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EndSessionPrompt from "@/features/session/EndSessionPrompt";

describe("EndSessionPrompt", () => {
  it("confirms with the entered XP amount", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<EndSessionPrompt busy={false} onConfirm={onConfirm} onCancel={() => {}} />);

    await user.type(screen.getByLabelText(/award xp for this session/i), "450");
    await user.click(screen.getByRole("button", { name: /end & award 450 xp/i }));

    expect(onConfirm).toHaveBeenCalledWith(450);
  });

  it("confirms with 0 when the XP input is left blank (skip)", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<EndSessionPrompt busy={false} onConfirm={onConfirm} onCancel={() => {}} />);

    await user.click(screen.getByRole("button", { name: /^end session$/i }));
    expect(onConfirm).toHaveBeenCalledWith(0);
  });

  it("cancels without confirming", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<EndSessionPrompt busy={false} onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
