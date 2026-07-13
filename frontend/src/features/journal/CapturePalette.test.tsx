import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  fetchEntities: vi.fn(),
}));

function makeCharacter(): Character {
  return { id: "char-1", journal: [] } as unknown as Character;
}

function makeCampaignCharacter(journal: unknown[] = []): Character {
  return { id: "char-1", campaignId: "camp-1", journal } as unknown as Character;
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
  vi.mocked(client.updateJournalEntry).mockResolvedValue(makeCharacter());
  vi.mocked(client.deleteJournalEntry).mockResolvedValue(makeCharacter());
  vi.mocked(client.fetchEntities).mockResolvedValue([]);
});

afterEach(() => {
  window.matchMedia = defaultMatchMedia;
});

describe("CapturePalette (#247)", () => {
  it("auto-focuses the composer when opened", async () => {
    render(<CapturePalette character={makeCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /quick note/i })).toHaveFocus(),
    );
  });

  it("focuses the composer with preventScroll to stop iOS reveal-scroll (#784)", async () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    render(<CapturePalette character={makeCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />);
    await waitFor(() => expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true }));
    focusSpy.mockRestore();
  });

  it("pins the page back to the top if a reveal-scroll leaked through (#784)", async () => {
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    Object.defineProperty(window, "scrollY", { value: 120, configurable: true });
    render(<CapturePalette character={makeCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />);
    await waitFor(() => expect(scrollToSpy).toHaveBeenCalledWith(0, 0));
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    scrollToSpy.mockRestore();
  });

  it("does not force-scroll when the page is already at the top (#784)", async () => {
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    render(<CapturePalette character={makeCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /quick note/i })).toHaveFocus(),
    );
    expect(scrollToSpy).not.toHaveBeenCalled();
    scrollToSpy.mockRestore();
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

  describe("visibility (#838)", () => {
    it("omits visibility on a default save (shared) for a campaign character", async () => {
      const user = userEvent.setup();
      render(
        <CapturePalette character={makeCampaignCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />,
      );

      expect(screen.getByRole("checkbox", { name: /private/i })).not.toBeChecked();
      await user.type(screen.getByRole("textbox", { name: /quick note/i }), "shared note");
      await user.keyboard("{Enter}");

      const [, entry] = vi.mocked(client.createJournalEntry).mock.calls[0];
      expect(entry).not.toHaveProperty("visibility");
    });

    it("sends visibility PRIVATE when the Private toggle is on", async () => {
      const user = userEvent.setup();
      render(
        <CapturePalette character={makeCampaignCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />,
      );

      await user.click(screen.getByRole("checkbox", { name: /private/i }));
      await user.type(screen.getByRole("textbox", { name: /quick note/i }), "secret note");
      await user.keyboard("{Enter}");

      const [, entry] = vi.mocked(client.createJournalEntry).mock.calls[0];
      expect(entry).toMatchObject({ visibility: "PRIVATE" });
    });

    it("resets the toggle to shared after a successful save (privacy never leaks forward)", async () => {
      const user = userEvent.setup();
      render(
        <CapturePalette character={makeCampaignCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />,
      );

      await user.click(screen.getByRole("checkbox", { name: /private/i }));
      await user.type(screen.getByRole("textbox", { name: /quick note/i }), "one-off secret");
      await user.keyboard("{Enter}");

      expect(vi.mocked(client.createJournalEntry).mock.calls[0][1]).toMatchObject({
        visibility: "PRIVATE",
      });
      expect(screen.getByRole("checkbox", { name: /private/i })).not.toBeChecked();

      await user.type(screen.getByRole("textbox", { name: /quick note/i }), "back to shared");
      await user.keyboard("{Enter}");

      expect(client.createJournalEntry).toHaveBeenCalledTimes(2);
      expect(vi.mocked(client.createJournalEntry).mock.calls[1][1]).not.toHaveProperty(
        "visibility",
      );
    });

    it("lets the inline editor toggle a note's visibility", async () => {
      const user = userEvent.setup();
      const character = makeCampaignCharacter([
        {
          id: "note-1",
          kind: "NOTE",
          date: "2026-07-01T00:00:00.000Z",
          loggedAt: "2026-07-01T20:00:00.000Z",
          body: "table knowledge",
          visibility: "CAMPAIGN",
        },
      ]);
      render(<CapturePalette character={character} onClose={vi.fn()} onUpdate={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /^edit$/i }));
      // Scope to the editor row — the composer renders its own Private toggle.
      const editorRow = screen.getByRole("textbox", { name: /edit note/i }).closest("li")!;
      const editorToggle = within(editorRow).getByRole("checkbox", { name: /private/i });
      expect(editorToggle).not.toBeChecked();
      await user.click(editorToggle);
      await user.click(within(editorRow).getByRole("button", { name: /^save$/i }));

      expect(client.updateJournalEntry).toHaveBeenCalledWith("char-1", "note-1", {
        body: "table knowledge",
        visibility: "PRIVATE",
      });
    });

    it("hides the Private toggle for a campaign-less character", () => {
      render(<CapturePalette character={makeCharacter()} onClose={vi.fn()} onUpdate={vi.fn()} />);
      expect(screen.queryByRole("checkbox", { name: /private/i })).toBeNull();
    });

    it("shows a lock only on PRIVATE rows", () => {
      const character = makeCampaignCharacter([
        {
          id: "note-1",
          kind: "NOTE",
          date: "2026-07-01T00:00:00.000Z",
          loggedAt: "2026-07-01T20:00:00.000Z",
          body: "my secret",
          visibility: "PRIVATE",
        },
        {
          id: "note-2",
          kind: "NOTE",
          date: "2026-07-01T00:00:00.000Z",
          loggedAt: "2026-07-01T20:05:00.000Z",
          body: "table knowledge",
          visibility: "CAMPAIGN",
        },
      ]);
      render(<CapturePalette character={character} onClose={vi.fn()} onUpdate={vi.fn()} />);

      const locks = screen.getAllByRole("img", { name: /private note/i });
      expect(locks).toHaveLength(1);
    });

    it("has no axe violations with the toggle and lock visible", async () => {
      const character = makeCampaignCharacter([
        {
          id: "note-1",
          kind: "NOTE",
          date: "2026-07-01T00:00:00.000Z",
          loggedAt: "2026-07-01T20:00:00.000Z",
          body: "my secret",
          visibility: "PRIVATE",
        },
      ]);
      const { baseElement } = render(
        <CapturePalette character={character} onClose={vi.fn()} onUpdate={vi.fn()} />,
      );
      expect(await axe(baseElement)).toHaveNoViolations();
    });
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
