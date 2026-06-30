import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.createJournalEntry).mockResolvedValue(makeCharacter());
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
});
