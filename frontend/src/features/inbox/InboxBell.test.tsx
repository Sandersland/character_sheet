import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getQueryClient } from "@/api/queryClient";
import { inboxKeys } from "@/api/queryKeys";
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

// Freshly "now" (not a fixed fixture date): formatInboxSignalAge's calendar-
// day diff against Date.now() lands on "today" for any signalAt this close
// to test execution, without pinning down system time and risking a
// userEvent + fake-timer interaction (see CampaignInviteLink.test.tsx's own
// note on that). Exact bucket wording ("yesterday", "N days ago") is
// formatInboxSignalAge's own unit-tested territory (lib/inboxMessages.test.ts)
// — this file only checks that signalAt actually reaches the row.
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

  it("hides the bell trigger when the inbox is empty — no accessible Inbox control to find or activate", async () => {
    fetchInbox.mockResolvedValue([]);
    renderBell();
    await waitFor(() => expect(fetchInbox).toHaveBeenCalled());
    // DesktopInboxPopover stays mounted (so an already-open popover survives
    // rows going empty — see the "survives" test below); only ITS trigger
    // content is hidden, which is what "hidden entirely" actually means here.
    expect(screen.queryByRole("button", { name: /inbox/i })).not.toBeInTheDocument();
  });

  it("keeps an open Review-duplicates modal mounted even if a background refetch empties the inbox mid-interaction", async () => {
    fetchInbox.mockResolvedValue([DUPLICATE_ROW]);
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: /inbox/i }));
    await user.click(screen.getByRole("button", { name: "Review duplicates" }));
    expect(screen.getByRole("dialog", { name: "Review duplicates" })).toBeInTheDocument();

    // Simulate the feed going empty out from under the open modal (e.g. some
    // other tab dismissed/resolved the last flag) — only the trigger's
    // visibility may depend on rows, per #1946 follow-up.
    getQueryClient().setQueryData(inboxKeys.all, []);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /inbox/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: "Review duplicates" })).toBeInTheDocument();
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

  it("surfaces a failed dismissal as a self-clearing status message, and rolls the row back", async () => {
    fetchInbox.mockResolvedValue([CHRONICLING_ROW]);
    dismissInboxFlag.mockRejectedValue(new Error("Failed to dismiss inbox flag"));
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: /inbox/i }));
    await user.click(screen.getByRole("button", { name: "Disregard" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Failed to dismiss inbox flag");
    // Rolled back — the row is back and the trigger's badge count is intact.
    expect(
      await screen.findByText("4 entries have been mentioned but have no description yet."),
    ).toBeInTheDocument();
  });

  it("mobile: an already-open sheet keeps rendering (and can still close itself) after a background refetch empties the inbox", async () => {
    stubMatchMedia(false);
    fetchInbox.mockResolvedValue([CHRONICLING_ROW]);
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: /inbox/i }));
    expect(screen.getByRole("dialog", { name: "Inbox" })).toBeInTheDocument();

    getQueryClient().setQueryData(inboxKeys.all, []);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /inbox/i })).not.toBeInTheDocument(),
    );
    // The sheet itself — not just the (now-hidden) trigger — is unaffected.
    expect(screen.getByRole("dialog", { name: "Inbox" })).toBeInTheDocument();
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
