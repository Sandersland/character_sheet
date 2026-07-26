import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

import SessionLog from "@/features/session/SessionLog";
import { fetchSession } from "@/api/client";
import type { CharacterEvent } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchSession: vi.fn(),
}));

const mockFetchSession = vi.mocked(fetchSession);
const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

function makeEvent(overrides: Partial<CharacterEvent>): CharacterEvent {
  return {
    id: "evt-1",
    category: "combat",
    type: "attackRoll",
    summary: "Longsword: 17 (1d20 + 5)",
    actor: "player",
    reverted: false,
    createdAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
}

function renderWith(events: CharacterEvent[]) {
  mockFetchSession.mockResolvedValue({ events } as never);
  return render(<SessionLog characterId="char-1" sessionId="sess-1" refreshKey={0} />);
}

// Sentences are split across multiple <span> segments (bold/toned pieces), so
// a plain text query matches every ancestor span — find the containing <li> instead.
function findRow(substring: string): Promise<HTMLElement> {
  return screen.findByText(
    (_, element) => element?.tagName === "LI" && Boolean(element.textContent?.includes(substring)),
  );
}

describe("SessionLog (#1237 chat feed)", () => {
  it("renders a swing as one sentence with the total emphasized and the weapon name bold", async () => {
    renderWith([
      makeEvent({
        id: "dmg",
        type: "damageRoll",
        category: "roll",
        summary: "Shortsword: 8 piercing",
        data: { kind: "damage", source: "Shortsword", total: 8, damageType: "piercing", specLabel: "1d6 + 4", faces: [4], swingId: "s1", verdict: "hit" },
      }),
      makeEvent({
        id: "atk",
        type: "attackRoll",
        category: "roll",
        summary: "Shortsword: 17",
        data: { kind: "attack", source: "Shortsword", total: 17, specLabel: "1d20 + 5", faces: [12], swingId: "s1", verdict: "hit" },
      }),
    ]);

    const row = await findRow("Shortsword — hit for");
    expect(row.textContent).toContain("8");
    expect(row.textContent).toContain("piercing");
    // Only one line — attack + damage merged into a single swing (the scroll
    // sentinel li is aria-hidden and excluded from the listitem role query).
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("expands a roll line's drill-in on click, showing the decomposed attack + damage math", async () => {
    renderWith([
      makeEvent({
        id: "dmg",
        type: "damageRoll",
        category: "roll",
        data: {
          kind: "damage", source: "Shortsword", total: 8, damageType: "piercing",
          specLabel: "1d6 + 4", faces: [4], swingId: "s1", verdict: "hit",
          damageComponents: { abilityMod: 4, meleeDamageBonus: 0 },
        },
      }),
      makeEvent({
        id: "atk",
        type: "attackRoll",
        category: "roll",
        data: {
          kind: "attack", source: "Shortsword", total: 17, specLabel: "1d20 + 5",
          faces: [12], swingId: "s1", verdict: "hit",
          attackComponents: { abilityMod: 4, proficiencyBonus: 3, rangedBonus: 0, attackRollBonus: 0 },
        },
      }),
    ]);

    const row = await findRow("Shortsword — hit for");
    // A closed <details>'s children stay in the DOM (just CSS-hidden) — assert
    // via visibility, not presence, that the drill-in starts collapsed.
    const proficiency = within(row).getByText(/Proficiency/);
    expect(proficiency).not.toBeVisible();
    fireEvent.click(row.querySelector("summary")!);
    expect(proficiency).toBeVisible();
  });

  it("renders a miss as an italic, muted line with no damage", async () => {
    renderWith([
      makeEvent({
        id: "atk",
        type: "attackRoll",
        category: "roll",
        data: { kind: "attack", source: "Shortsword", total: 9, specLabel: "1d20 + 3", faces: [5], swingId: "s2", verdict: "miss" },
      }),
    ]);

    const row = await findRow("— missed.");
    expect(row.textContent).toContain("Shortsword");
  });

  it("names the recipient on a DM loot award event (#382)", async () => {
    renderWith([
      makeEvent({
        id: "evt-loot",
        category: "inventory",
        type: "awarded",
        summary: "Awarded Flametongue ×2",
        data: { itemName: "Flametongue", quantityDelta: 2, recipientName: "Bruenor" },
      }),
    ]);

    expect(await screen.findByText("Awarded Flametongue ×2 → Bruenor")).toBeInTheDocument();
  });

  // #962: the Combat Turn/Log sub-nav mounts the log on demand, so it renders
  // without a refreshKey — each mount refetches on its own.
  it("fetches and renders with no refreshKey prop", async () => {
    mockFetchSession.mockResolvedValue({
      events: [makeEvent({ category: "hitPoints", type: "damage", data: { amount: 5 } })],
    } as never);

    render(<SessionLog characterId="char-1" sessionId="sess-1" />);

    expect(await screen.findByText("Took 5 damage.")).toBeInTheDocument();
    expect(mockFetchSession).toHaveBeenCalledWith("char-1", "sess-1");
  });

  // #964: both live-Combat call sites stay mounted and pass the shared
  // logRefresh counter, so bumping refreshKey must re-fetch (a stale mounted log
  // was the review regression this guards).
  it("re-fetches when refreshKey changes", async () => {
    mockFetchSession.mockResolvedValue({ events: [] } as never);

    const { rerender } = render(
      <SessionLog characterId="char-1" sessionId="sess-1" refreshKey={0} />,
    );
    await waitFor(() => expect(mockFetchSession).toHaveBeenCalledTimes(1));

    rerender(<SessionLog characterId="char-1" sessionId="sess-1" refreshKey={1} />);
    await waitFor(() => expect(mockFetchSession).toHaveBeenCalledTimes(2));
  });

  // A refreshKey bump must NOT clear `events` before the refetch resolves — a
  // naive `setEvents(null)` on every bump unmounts every rendered row (and any
  // open <details> drill-in) on every character write, since the log's own
  // refreshKey counter bumps on every one (investigate item, #1237).
  it("keeps the previously rendered row visible while a refreshKey-triggered refetch is in flight", async () => {
    const firstEvents = [makeEvent({ id: "a", category: "hitPoints", type: "damage", data: { amount: 3 } })];
    mockFetchSession.mockResolvedValueOnce({ events: firstEvents } as never);
    const { rerender } = render(<SessionLog characterId="char-1" sessionId="sess-1" refreshKey={0} />);
    await screen.findByText("Took 3 damage.");

    let resolveSecond!: (value: { events: CharacterEvent[] }) => void;
    mockFetchSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }) as never,
    );
    rerender(<SessionLog characterId="char-1" sessionId="sess-1" refreshKey={1} />);

    // Still pending — the old row must still be there, not replaced by a spinner.
    expect(screen.getByText("Took 3 damage.")).toBeInTheDocument();

    resolveSecond({
      events: [...firstEvents, makeEvent({ id: "b", category: "hitPoints", type: "damage", data: { amount: 5 } })],
    });
    await screen.findByText("Took 5 damage.");
  });

  it("filters out reverted events and revert entries", async () => {
    renderWith([
      makeEvent({ id: "a", category: "hitPoints", type: "damage", reverted: true, data: { amount: 99 } }),
      makeEvent({ id: "b", category: "hitPoints", type: "revert" }),
      makeEvent({ id: "c", category: "hitPoints", type: "damage", data: { amount: 4 } }),
    ]);

    expect(await screen.findByText("Took 4 damage.")).toBeInTheDocument();
    expect(screen.queryByText(/99/)).not.toBeInTheDocument();
  });
});

describe("SessionLog ordering — newest at the bottom (#1237)", () => {
  it("renders the newest fetched event as the LAST row", async () => {
    renderWith([
      makeEvent({ id: "newest", category: "hitPoints", type: "damage", data: { amount: 3 } }),
      makeEvent({ id: "oldest", category: "hitPoints", type: "damage", data: { amount: 9 } }),
    ]);

    await screen.findByText("Took 9 damage.");
    const rows = screen.getAllByRole("listitem").filter((li) => li.textContent?.includes("damage"));
    expect(rows[0].textContent).toContain("9");
    expect(rows[rows.length - 1].textContent).toContain("3");
  });

  // jsdom stubs scrollIntoView as a no-op (test/setup.ts) — it can't verify
  // actual scroll position, only that the component REQUESTS the scroll on load.
  it("requests a scroll to the bottom sentinel on load", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderWith([makeEvent({ id: "a", category: "hitPoints", type: "damage", data: { amount: 3 } })]);
    await screen.findByText("Took 3 damage.");

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "end" });
  });
});

describe("SessionLog roll-run collapsing (#983, raised threshold #1237 §2)", () => {
  it("collapses 12 consecutive initiative rolls to a 3-visible disclosure of the remaining 9", async () => {
    const rolls = Array.from({ length: 12 }, (_, i) =>
      makeEvent({
        id: `init-${i}`,
        category: "roll",
        type: "initiativeRoll",
        data: { kind: "initiative", source: "Initiative", total: 20 - i, specLabel: "1d20", faces: [20 - i] },
      }),
    );
    renderWith(rolls);

    // The 3 most recent initiative rows stay visible — the hidden 9 are
    // collapsed behind the disclosure and not in the DOM at all until expanded
    // (unlike native <details>, whose closed children stay present but hidden).
    await screen.findByText(/9 earlier initiative rolls/);
    expect(document.querySelectorAll("details")).toHaveLength(3);
    const visibleRow = await findRow("Rolled Initiative — 20");
    expect(visibleRow.textContent).toContain("20");

    fireEvent.click(screen.getByText(/9 earlier initiative rolls/));

    // Expanding reveals every hidden row, on top of the 3 already visible.
    await waitFor(() => expect(document.querySelectorAll("details")).toHaveLength(12));
  });
});

describe("SessionLog empty state", () => {
  it("shows an empty-state message when there are no displayable events", async () => {
    renderWith([]);
    expect(await screen.findByText(/No events yet/)).toBeInTheDocument();
  });
});
