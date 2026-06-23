import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import JournalSection from "@/features/character-meta/JournalSection";
import * as client from "@/api/client";
import type { Character, JournalEntry } from "@/types/character";

// Mock the API client — JournalSection is the orchestrator that wires the
// plain-REST journal CRUD calls and swaps the returned Character via onUpdate.
vi.mock("@/api/client", () => ({
  createJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
  deleteJournalEntry: vi.fn(),
}));

const ENTRY: JournalEntry = {
  id: "entry-1",
  title: "The Sunken Library",
  date: "2026-06-22T00:00:00.000Z",
  body: "Found three waterlogged tomes.",
};

// Minimal Character stub — JournalSection only reads `id` and `journal`.
function makeCharacter(journal: JournalEntry[]): Character {
  return { id: "char-1", journal } as unknown as Character;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("JournalSection", () => {
  it("renders the empty state when there are no entries", () => {
    render(<JournalSection character={makeCharacter([])} onUpdate={vi.fn()} />);
    expect(screen.getByText(/No journal entries yet/i)).toBeInTheDocument();
  });

  it("renders existing entries with formatted date", () => {
    render(<JournalSection character={makeCharacter([ENTRY])} onUpdate={vi.fn()} />);
    expect(screen.getByText("The Sunken Library")).toBeInTheDocument();
    expect(screen.getByText("Found three waterlogged tomes.")).toBeInTheDocument();
    // 2026-06-22 formatted for display (not the raw ISO string).
    expect(screen.queryByText(/2026-06-22T/)).not.toBeInTheDocument();
  });

  it("creates an entry through the add panel and calls onUpdate", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const updated = makeCharacter([ENTRY]);
    vi.mocked(client.createJournalEntry).mockResolvedValue(updated);

    render(<JournalSection character={makeCharacter([])} onUpdate={onUpdate} />);

    await user.click(screen.getByRole("button", { name: "+ Add entry" }));
    await user.type(screen.getByLabelText(/Title/), "New Quest");
    await user.type(screen.getByLabelText(/Notes/), "We set out at dawn.");
    await user.click(screen.getByRole("button", { name: "Add entry" }));

    expect(client.createJournalEntry).toHaveBeenCalledWith(
      "char-1",
      expect.objectContaining({ title: "New Quest", body: "We set out at dawn." }),
    );
    expect(onUpdate).toHaveBeenCalledWith(updated);
  });

  it("does not submit the add form with an empty title", async () => {
    const user = userEvent.setup();
    render(<JournalSection character={makeCharacter([])} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "+ Add entry" }));
    // Fill only the body, leave title blank.
    await user.type(screen.getByLabelText(/Notes/), "body only");
    expect(screen.getByRole("button", { name: "Add entry" })).toBeDisabled();
    expect(client.createJournalEntry).not.toHaveBeenCalled();
  });

  it("edits an entry through the inline edit panel", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    vi.mocked(client.updateJournalEntry).mockResolvedValue(makeCharacter([ENTRY]));

    render(<JournalSection character={makeCharacter([ENTRY])} onUpdate={onUpdate} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const titleInput = screen.getByLabelText(/Title/);
    await user.clear(titleInput);
    await user.type(titleInput, "Revised Title");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(client.updateJournalEntry).toHaveBeenCalledWith(
      "char-1",
      "entry-1",
      expect.objectContaining({ title: "Revised Title" }),
    );
    expect(onUpdate).toHaveBeenCalled();
  });

  it("deletes an entry after inline confirmation", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    vi.mocked(client.deleteJournalEntry).mockResolvedValue(makeCharacter([]));

    render(<JournalSection character={makeCharacter([ENTRY])} onUpdate={onUpdate} />);

    // First Delete click reveals the inline confirm; it does not call the API.
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(client.deleteJournalEntry).not.toHaveBeenCalled();
    expect(screen.getByText(/Delete this entry\?/i)).toBeInTheDocument();

    // Confirm.
    const confirmRow = screen.getByText(/Delete this entry\?/i).parentElement!;
    await user.click(within(confirmRow).getByRole("button", { name: "Delete" }));

    expect(client.deleteJournalEntry).toHaveBeenCalledWith("char-1", "entry-1");
    expect(onUpdate).toHaveBeenCalled();
  });

  it("surfaces an error when a call fails", async () => {
    const user = userEvent.setup();
    vi.mocked(client.createJournalEntry).mockRejectedValue(new Error("Boom"));

    render(<JournalSection character={makeCharacter([])} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "+ Add entry" }));
    await user.type(screen.getByLabelText(/Title/), "T");
    await user.type(screen.getByLabelText(/Notes/), "B");
    await user.click(screen.getByRole("button", { name: "Add entry" }));

    expect(await screen.findByText("Boom")).toBeInTheDocument();
  });
});
