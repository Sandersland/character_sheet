import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CapturePalette from "@/features/journal/CapturePalette";
import * as client from "@/api/client";
import { axe } from "@/test/axe";
import type { Character } from "@/types/character";

// The default setup stub reports matches:false → below md → BottomSheet. Flip to
// md+ (top palette) for the desktop-presentation cases; afterEach restores it.
function useDesktopViewport() {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("min-width: 768px"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

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

const defaultMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.createJournalEntry).mockResolvedValue(makeCharacter());
  vi.mocked(client.deleteJournalEntry).mockResolvedValue(makeCharacter());
});

afterEach(() => {
  window.matchMedia = defaultMatchMedia;
});

describe("CapturePalette (#247)", () => {
  it("auto-focuses the composer when opened", () => {
    render(<CapturePalette character={makeCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: /quick note/i })).toHaveFocus();
  });

  it("floors the composer font-size at text-base on mobile to kill iOS auto-zoom", () => {
    render(<CapturePalette character={makeCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />);
    const composer = screen.getByRole("textbox", { name: /quick note/i });
    expect(composer.className).toContain("text-base");
    expect(composer.className).toContain("md:text-sm");
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

  it("Shift+Enter does NOT submit", async () => {
    const user = userEvent.setup();
    render(<CapturePalette character={makeCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />);

    const composer = screen.getByRole("textbox", { name: /quick note/i });
    await user.type(composer, "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(composer, "line two");

    expect(client.createJournalEntry).not.toHaveBeenCalled();
    expect(composer.textContent ?? "").toMatch(/line one[\s\S]*line two/);
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
    composer.textContent = "日本語";
    fireEvent.input(composer);
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

  describe("per-breakpoint presentation (#771)", () => {
    it("mobile: renders inside a BottomSheet with a grabber, short placeholder, no keyboard hint", () => {
      const { baseElement } = render(
        <CapturePalette character={makeCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />,
      );
      // The BottomSheet grabber is a real button whose accessible name is "Close".
      expect(baseElement.querySelector('button[aria-label="Close"]')).not.toBeNull();
      expect(screen.getByText("Jot a note… @ to tag")).toBeInTheDocument();
      expect(screen.queryByText(/Enter to save/i)).toBeNull();
    });

    it("md+: renders the top palette with the Enter/Shift+Enter hint and no grabber", () => {
      useDesktopViewport();
      const { baseElement } = render(
        <CapturePalette character={makeCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />,
      );
      expect(screen.getByRole("dialog", { name: /quick capture/i })).toBeInTheDocument();
      expect(screen.getByText(/Enter to save · Shift\+Enter/i)).toBeInTheDocument();
      expect(baseElement.querySelector('button[aria-label="Close"]')).toBeNull();
    });

    it("has no axe violations on mobile", async () => {
      const { baseElement } = render(
        <CapturePalette character={makeCharacterWithNote()} onClose={vi.fn()} onUpdate={vi.fn()} />,
      );
      expect(await axe(baseElement)).toHaveNoViolations();
    });

    it("has no axe violations at md+", async () => {
      useDesktopViewport();
      const { baseElement } = render(
        <CapturePalette character={makeCharacterWithNote()} onClose={vi.fn()} onUpdate={vi.fn()} />,
      );
      expect(await axe(baseElement)).toHaveNoViolations();
    });
  });
});
