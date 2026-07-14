import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import JournalEntryPanel from "@/features/journal/JournalEntryPanel";
import type { JournalEntry } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchEntities: vi.fn().mockResolvedValue([]),
}));

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

  describe("visibility (#838)", () => {
    const PRIVATE_ENTRY: JournalEntry = {
      id: "entry-1",
      kind: "NOTE",
      date: "2026-07-01T00:00:00.000Z",
      loggedAt: "2026-07-01T00:00:00.000Z",
      body: "kept to myself",
      visibility: "PRIVATE",
    };

    it("hides the Private checkbox without a campaign and omits visibility", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <JournalEntryPanel mode="add" busy={false} onSubmit={onSubmit} onClose={vi.fn()} />,
      );

      expect(screen.queryByRole("checkbox", { name: /private/i })).toBeNull();
      await user.type(screen.getByLabelText(/Note/), "solo note");
      await user.click(screen.getByRole("button", { name: "Add note" }));
      expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("visibility");
    });

    it("add mode defaults to shared and carries visibility CAMPAIGN in the draft", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <JournalEntryPanel
          mode="add"
          busy={false}
          campaignId="camp-1"
          onSubmit={onSubmit}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByRole("checkbox", { name: /private/i })).not.toBeChecked();
      await user.type(screen.getByLabelText(/Note/), "shared note");
      await user.click(screen.getByRole("button", { name: "Add note" }));
      expect(onSubmit).toHaveBeenCalledWith({
        kind: "NOTE",
        body: "shared note",
        visibility: "CAMPAIGN",
      });
    });

    it("add mode sends PRIVATE when the checkbox is ticked", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <JournalEntryPanel
          mode="add"
          busy={false}
          campaignId="camp-1"
          onSubmit={onSubmit}
          onClose={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("checkbox", { name: /private/i }));
      await user.type(screen.getByLabelText(/Note/), "secret note");
      await user.click(screen.getByRole("button", { name: "Add note" }));
      expect(onSubmit).toHaveBeenCalledWith({
        kind: "NOTE",
        body: "secret note",
        visibility: "PRIVATE",
      });
    });

    it("edit mode initializes from the entry and can flip back to shared", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <JournalEntryPanel
          mode="edit"
          initial={PRIVATE_ENTRY}
          busy={false}
          campaignId="camp-1"
          onSubmit={onSubmit}
          onClose={vi.fn()}
        />,
      );

      const checkbox = screen.getByRole("checkbox", { name: /private/i });
      expect(checkbox).toBeChecked();
      await user.click(checkbox);
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      expect(onSubmit).toHaveBeenCalledWith({
        kind: "NOTE",
        body: "kept to myself",
        visibility: "CAMPAIGN",
      });
    });
  });
});
