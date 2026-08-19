import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InboxBell from "@/features/inbox/InboxBell";
import type { InboxRow } from "@/types/character";

const fetchInbox = vi.fn();
const dismissInboxFlag = vi.fn();
const fetchEntities = vi.fn();
const fetchEntityMerges = vi.fn();
const combineEntities = vi.fn();
vi.mock("@/api/client", () => ({
  fetchInbox: (...args: unknown[]) => fetchInbox(...args),
  dismissInboxFlag: (...args: unknown[]) => dismissInboxFlag(...args),
  fetchEntities: (...args: unknown[]) => fetchEntities(...args),
  fetchEntityMerges: (...args: unknown[]) => fetchEntityMerges(...args),
  combineEntities: (...args: unknown[]) => combineEntities(...args),
}));

// Freshly "now" (not a fixed fixture date): formatRelativeDay's calendar-day
// diff against Date.now() lands on "today" for any signalAt this close to
// test execution, without pinning down system time and risking a userEvent +
// fake-timer interaction (see CampaignInviteLink.test.tsx's own note on that).
// Exact bucket wording ("yesterday", "N days ago") is formatRelativeDay's own
// unit-tested territory (lib/formatJournalDate.test.ts) — this file only
// checks that signalAt actually reaches the row.
const NOW_ISO = new Date().toISOString();

const DUPLICATE_ROW: InboxRow = {
  kind: "DUPLICATE_CLUSTER",
  campaignId: "camp-1",
  campaignName: "Curse of Strahd",
  signature: "sig-dupe",
  entities: [
    { id: "e1", name: "Lil", type: "NPC", visibility: "REVEALED", mentionCount: 1 },
    { id: "e2", name: "lili", type: "NPC", visibility: "REVEALED", mentionCount: 0 },
    { id: "e3", name: "Lili", type: "NPC", visibility: "REVEALED", mentionCount: 3 },
  ],
  defaultSurvivorId: "e3",
  signalAt: NOW_ISO,
};

const CHRONICLING_ROW: InboxRow = {
  kind: "NEEDS_CHRONICLING",
  campaignId: "camp-1",
  campaignName: "Curse of Strahd",
  signature: "camp-1",
  count: 4,
  signalAt: NOW_ISO,
};

function renderBell() {
  return render(
    <MemoryRouter>
      <InboxBell />
    </MemoryRouter>,
  );
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("InboxBell", () => {
  beforeEach(() => {
    fetchInbox.mockReset();
    dismissInboxFlag.mockReset();
    fetchEntities.mockReset();
    fetchEntityMerges.mockReset();
    combineEntities.mockReset();
    fetchEntities.mockResolvedValue([]);
    fetchEntityMerges.mockResolvedValue([]);
    // md+ (desktop) unless a test overrides it.
    stubMatchMedia(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when the inbox is empty", async () => {
    fetchInbox.mockResolvedValue([]);
    const { container } = renderBell();
    await waitFor(() => expect(fetchInbox).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the bell with a badge counting the rows", async () => {
    fetchInbox.mockResolvedValue([DUPLICATE_ROW, CHRONICLING_ROW]);
    renderBell();
    const trigger = await screen.findByRole("button", { name: /inbox, 2 items/i });
    expect(within(trigger).getByText("2")).toBeInTheDocument();
  });

  it("opens a popover under the bell listing grouped rows with a DM only badge", async () => {
    fetchInbox.mockResolvedValue([DUPLICATE_ROW, CHRONICLING_ROW]);
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: /inbox/i }));

    const panel = screen.getByRole("dialog", { name: /inbox/i });
    expect(within(panel).getByText("Curse of Strahd")).toBeInTheDocument();
    expect(within(panel).getByText("DM only")).toBeInTheDocument();
    expect(
      within(panel).getByText("Lil · lili · Lili look like duplicates of each other."),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("4 entries have been mentioned but have no description yet."),
    ).toBeInTheDocument();
    // Trailing relative-time meta off signalAt (#1946 follow-up).
    expect(within(panel).getAllByText("today")).toHaveLength(2);
  });

  it("opens the Review-duplicates modal from a row and closes the popover", async () => {
    fetchInbox.mockResolvedValue([DUPLICATE_ROW]);
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: /inbox/i }));
    await user.click(screen.getByRole("button", { name: "Review duplicates" }));

    expect(screen.getByRole("dialog", { name: "Review duplicates" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /^inbox/i })).not.toBeInTheDocument();
  });

  it("disregards a row optimistically, removing it without opening the modal", async () => {
    fetchInbox.mockResolvedValue([CHRONICLING_ROW]);
    dismissInboxFlag.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: /inbox/i }));
    await user.click(screen.getByRole("button", { name: "Disregard" }));

    expect(dismissInboxFlag).toHaveBeenCalledWith({
      campaignId: "camp-1",
      kind: "NEEDS_CHRONICLING",
      signature: "camp-1",
    });
    await waitFor(() =>
      expect(
        screen.queryByText("4 entries have been mentioned but have no description yet."),
      ).not.toBeInTheDocument(),
    );
  });

  it("mobile: the same trigger opens a BottomSheet titled Inbox", async () => {
    stubMatchMedia(false);
    fetchInbox.mockResolvedValue([CHRONICLING_ROW]);
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: /inbox/i }));

    const sheet = screen.getByRole("dialog", { name: "Inbox" });
    expect(within(sheet).getByText("1 for the DM")).toBeInTheDocument();
    // Full-width 44px mobile action targets.
    const openCodex = within(sheet).getByRole("button", { name: "Open codex" });
    expect(openCodex.className).toMatch(/min-h-11/);
  });
});
