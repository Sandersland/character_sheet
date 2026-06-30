import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CapturePalette from "@/features/journal/CapturePalette";
import * as client from "@/api/client";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  createJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
  deleteJournalEntry: vi.fn(),
}));

function makeCharacter(): Character {
  return { id: "char-1", journal: [] } as unknown as Character;
}

function makeCharacterWithNote(): Character {
  return {
    id: "char-1",
    journal: [
      {
        id: "note-1",
        kind: "NOTE",
        date: "2026-06-22T00:00:00.000Z",
        loggedAt: "2026-06-22T20:50:00.000Z",
        body: "Ambushed by goblins",
        visibility: "PRIVATE",
      },
    ],
  } as unknown as Character;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.createJournalEntry).mockResolvedValue(makeCharacter());
  vi.mocked(client.deleteJournalEntry).mockResolvedValue(makeCharacter());
});

describe("CapturePalette (#247)", () => {
  it("auto-focuses the composer when opened", () => {
    render(<CapturePalette character={makeCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: /quick note/i })).toHaveFocus();
  });

  it("Enter saves a NOTE via createJournalEntry and propagates the update", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <CapturePalette
        character={makeCharacter()}
        sessionId="sess-1"
        onClose={vi.fn()}
        onUpdate={onUpdate}
      />,
    );

    const composer = screen.getByRole("textbox", { name: /quick note/i });
    await user.type(composer, "The bridge collapsed");
    await user.keyboard("{Enter}");

    expect(client.createJournalEntry).toHaveBeenCalledTimes(1);
    const [charId, entry] = vi.mocked(client.createJournalEntry).mock.calls[0];
    expect(charId).toBe("char-1");
    expect(entry).toEqual({ kind: "NOTE", body: "The bridge collapsed", sessionId: "sess-1" });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("Shift+Enter does NOT submit — it inserts a newline", async () => {
    const user = userEvent.setup();
    render(<CapturePalette character={makeCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />);

    const composer = screen.getByRole("textbox", { name: /quick note/i }) as HTMLTextAreaElement;
    await user.type(composer, "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(composer, "line two");

    expect(client.createJournalEntry).not.toHaveBeenCalled();
    expect(composer.value).toBe("line one\nline two");
  });

  it("does not save an empty (whitespace-only) note", async () => {
    const user = userEvent.setup();
    render(<CapturePalette character={makeCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />);

    const composer = screen.getByRole("textbox", { name: /quick note/i });
    await user.type(composer, "   ");
    await user.keyboard("{Enter}");

    expect(client.createJournalEntry).not.toHaveBeenCalled();
  });

  it("Enter during IME composition does NOT submit", () => {
    render(<CapturePalette character={makeCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />);

    const composer = screen.getByRole("textbox", { name: /quick note/i });
    fireEvent.change(composer, { target: { value: "日本語" } });
    fireEvent.keyDown(composer, { key: "Enter", isComposing: true });

    expect(client.createJournalEntry).not.toHaveBeenCalled();
  });

  it("deleting a note takes two clicks — first reveals confirm, second deletes", async () => {
    const user = userEvent.setup();
    render(<CapturePalette character={makeCharacterWithNote()} onClose={vi.fn()} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(client.deleteJournalEntry).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /delete\?/i }));
    expect(client.deleteJournalEntry).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.deleteJournalEntry).mock.calls[0]).toEqual(["char-1", "note-1"]);
  });

  it("Cancel in the delete confirm does not delete", async () => {
    const user = userEvent.setup();
    render(<CapturePalette character={makeCharacterWithNote()} onClose={vi.fn()} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(client.deleteJournalEntry).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
  });
});
