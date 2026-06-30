import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import JournalEntryPanel from "@/features/character-meta/JournalEntryPanel";

describe("JournalEntryPanel", () => {
  it("renders a body-only composer (no Title, no Date)", () => {
    render(
      <JournalEntryPanel mode="add" busy={false} onSubmit={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByLabelText(/Note/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Title/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
  });

  it("submits { kind: 'NOTE', body }", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <JournalEntryPanel mode="add" busy={false} onSubmit={onSubmit} onClose={vi.fn()} />,
    );

    await user.type(screen.getByLabelText(/Note/), "A quick note");
    await user.click(screen.getByRole("button", { name: "Add note" }));

    expect(onSubmit).toHaveBeenCalledWith({ kind: "NOTE", body: "A quick note" });
  });

  it("disables submit when the body is empty", () => {
    render(
      <JournalEntryPanel mode="add" busy={false} onSubmit={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Add note" })).toBeDisabled();
  });
});
