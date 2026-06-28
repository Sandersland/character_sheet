import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ActivityModal from "@/features/character-meta/ActivityModal";
import * as client from "@/api/client";
import type { CharacterEvent, Session } from "@/types/character";

// Mock the API client — ActivityModal is an orchestrator over the activity
// timeline + session list + revert calls.
vi.mock("@/api/client", () => ({
  fetchActivity: vi.fn(),
  fetchSessions: vi.fn(),
  revertBatch: vi.fn(),
}));

function makeEvent(over: Partial<CharacterEvent>): CharacterEvent {
  return {
    id: "ev-1",
    category: "inventory",
    type: "sold",
    summary: "Sold Shortsword ×1",
    actor: "player",
    reverted: false,
    batchId: "batch-1",
    createdAt: new Date().toISOString(),
    ...over,
  };
}

const SESSIONS: Session[] = [
  { id: "sess-1", characterId: "char-1", status: "ended", startedAt: "2026-06-20T00:00:00.000Z", title: "Session One" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.fetchActivity).mockResolvedValue([makeEvent({})]);
  vi.mocked(client.fetchSessions).mockResolvedValue(SESSIONS);
});

describe("ActivityModal filtering", () => {
  it("loads unfiltered on mount (only includeFields)", async () => {
    render(<ActivityModal characterId="char-1" onClose={vi.fn()} onUpdate={vi.fn()} />);
    await screen.findByText("Sold Shortsword ×1");
    expect(client.fetchActivity).toHaveBeenNthCalledWith(
      1,
      "char-1",
      { includeFields: true },
      expect.any(AbortSignal),
    );
  });

  it("refetches with category + type when Inventory category and a type chip are chosen", async () => {
    const user = userEvent.setup();
    render(<ActivityModal characterId="char-1" onClose={vi.fn()} onUpdate={vi.fn()} />);
    await screen.findByText("Sold Shortsword ×1");

    await user.selectOptions(screen.getByRole("combobox", { name: "Category" }), "inventory");
    // The inventory type chips appear under Inventory.
    const soldChip = await screen.findByRole("button", { name: "sold", pressed: false });
    await user.click(soldChip);

    await waitFor(() =>
      expect(client.fetchActivity).toHaveBeenLastCalledWith(
        "char-1",
        { includeFields: true, category: "inventory", type: "sold" },
        expect.any(AbortSignal),
      ),
    );
  });

  it("refetches with sessionId when a session is selected", async () => {
    const user = userEvent.setup();
    render(<ActivityModal characterId="char-1" onClose={vi.fn()} onUpdate={vi.fn()} />);
    await screen.findByText("Sold Shortsword ×1");

    // Wait for the session picker (populated async) to appear, then select.
    const select = await screen.findByRole("combobox", { name: "Session" });
    await user.selectOptions(select, "sess-1");

    await waitFor(() =>
      expect(client.fetchActivity).toHaveBeenLastCalledWith(
        "char-1",
        { includeFields: true, sessionId: "sess-1" },
        expect.any(AbortSignal),
      ),
    );
  });

  it("renders one date header per calendar day", async () => {
    vi.mocked(client.fetchActivity).mockResolvedValue([
      makeEvent({ id: "ev-today", batchId: "b-today", createdAt: new Date().toISOString() }),
      makeEvent({ id: "ev-old", batchId: "b-old", summary: "Bought Longsword", type: "bought", createdAt: "2020-01-15T10:00:00.000Z" }),
    ]);
    render(<ActivityModal characterId="char-1" onClose={vi.fn()} onUpdate={vi.fn()} />);

    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.getByText(/Jan 15, 2020/)).toBeInTheDocument();
  });

  it("passes the entityId prop through to fetchActivity", async () => {
    render(
      <ActivityModal characterId="char-1" onClose={vi.fn()} onUpdate={vi.fn()} entityId="item-42" />,
    );
    await screen.findByText("Sold Shortsword ×1");
    expect(client.fetchActivity).toHaveBeenCalledWith(
      "char-1",
      expect.objectContaining({ includeFields: true, entityId: "item-42" }),
      expect.any(AbortSignal),
    );
  });

  it("aborts a superseded load when the filter changes again", async () => {
    const user = userEvent.setup();
    render(<ActivityModal characterId="char-1" onClose={vi.fn()} onUpdate={vi.fn()} />);
    await screen.findByText("Sold Shortsword ×1");

    // The mount load's AbortSignal (3rd arg of the first call).
    const firstSignal = vi.mocked(client.fetchActivity).mock.calls[0][2] as AbortSignal;
    expect(firstSignal).toBeInstanceOf(AbortSignal);
    expect(firstSignal.aborted).toBe(false);

    // Changing the category supersedes that load — its signal must abort so a
    // slow stale response can't overwrite the fresher one.
    await user.selectOptions(screen.getByRole("combobox", { name: "Category" }), "inventory");
    await waitFor(() => expect(firstSignal.aborted).toBe(true));
  });
});

describe("ActivityModal undo eligibility", () => {
  it("shows Undo on the most-recent batch when unfiltered", async () => {
    render(<ActivityModal characterId="char-1" onClose={vi.fn()} onUpdate={vi.fn()} />);
    await screen.findByText("Sold Shortsword ×1");
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("hides Undo while a category filter is active (server LIFO guard would 409)", async () => {
    const user = userEvent.setup();
    render(<ActivityModal characterId="char-1" onClose={vi.fn()} onUpdate={vi.fn()} />);
    await screen.findByText("Sold Shortsword ×1");
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Category" }), "inventory");
    await screen.findByText("Sold Shortsword ×1");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument(),
    );
  });

  it("hides Undo when scoped to a single entity", async () => {
    render(
      <ActivityModal characterId="char-1" onClose={vi.fn()} onUpdate={vi.fn()} entityId="item-42" />,
    );
    await screen.findByText("Sold Shortsword ×1");
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });
});
