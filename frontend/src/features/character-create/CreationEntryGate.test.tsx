import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { axe } from "@/test/axe";
import CreationEntryGate from "@/features/character-create/CreationEntryGate";
import { fetchCampaigns } from "@/api/client";
import type { Campaign } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchCampaigns: vi.fn(),
}));

const mockFetchCampaigns = vi.mocked(fetchCampaigns);

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp-1",
    name: "The Sunless Citadel",
    ownerId: "u1",
    rulesEdition: "EDITION_2024",
    rulesEditionLabel: "2024 rules",
    inviteCode: "abc123",
    createdAt: new Date().toISOString(),
    role: "PLAYER",
    members: [],
    ...overrides,
  };
}

// #1343: a distinct id/name per campaign, so a spec can address "Campaign 17"
// specifically to prove the scrolled-past cards are still real radios.
function makeCampaigns(n: number): Campaign[] {
  return Array.from({ length: n }, (_, i) =>
    makeCampaign({ id: `camp-${i + 1}`, name: `Campaign ${i + 1}` }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreationEntryGate (#1286)", () => {
  it("with no campaigns, skips straight to the edition picker defaulting to 2024", async () => {
    mockFetchCampaigns.mockResolvedValue([]);
    const onResolved = vi.fn();
    render(<CreationEntryGate onResolved={onResolved} />);

    await waitFor(() => expect(mockFetchCampaigns).toHaveBeenCalled());
    expect(await screen.findByRole("radio", { name: "2024 rules" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("radiogroup", { name: /campaign/i })).not.toBeInTheDocument();

    // Irreversibility stated at the moment of choosing. Scoped to "locked in at
    // creation" (not the shorter "can't be changed later") because #1371's
    // EDITION_UNAVAILABLE reason text also contains "can't be changed later",
    // and its sr-only span is in the DOM here too (the 2014 card always renders).
    expect(screen.getByText(/locked in at creation/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onResolved).toHaveBeenCalledWith({ campaignId: null, campaignName: null, rulesEdition: "EDITION_2024" });
  });

  it("does not let a solo player pick 2014 while its content is gated (#1371)", async () => {
    mockFetchCampaigns.mockResolvedValue([]);
    const onResolved = vi.fn();
    render(<CreationEntryGate onResolved={onResolved} />);

    await userEvent.click(await screen.findByRole("radio", { name: "2014 rules" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onResolved).toHaveBeenCalledWith({ campaignId: null, campaignName: null, rulesEdition: "EDITION_2024" });
  });

  it("with campaigns, asks which campaign first and defaults to Solo", async () => {
    mockFetchCampaigns.mockResolvedValue([makeCampaign()]);
    const onResolved = vi.fn();
    render(<CreationEntryGate onResolved={onResolved} />);

    expect(await screen.findByRole("radio", { name: /solo/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /the sunless citadel/i })).toBeInTheDocument();
    // Solo is selected by default, so the edition picker (not an inherited display) shows.
    expect(screen.getByRole("radio", { name: "2024 rules" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onResolved).toHaveBeenCalledWith({ campaignId: null, campaignName: null, rulesEdition: "EDITION_2024" });
  });

  it("picking a campaign displays its inherited edition instead of asking", async () => {
    // Both fields set explicitly — deriving the label from the key in a fixture
    // would re-implement the mapping #1436 moved server-side.
    mockFetchCampaigns.mockResolvedValue([
      makeCampaign({ rulesEdition: "EDITION_2014", rulesEditionLabel: "2014 rules" }),
    ]);
    const onResolved = vi.fn();
    render(<CreationEntryGate onResolved={onResolved} />);

    await userEvent.click(await screen.findByRole("radio", { name: /the sunless citadel/i }));

    // No edition picker once a campaign is chosen — it's inherited, not asked.
    expect(screen.queryByRole("radio", { name: "2024 rules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "2014 rules" })).not.toBeInTheDocument();
    expect(screen.getByText(/2014 rules/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onResolved).toHaveBeenCalledWith({
      campaignId: "camp-1",
      campaignName: "The Sunless Citadel",
      rulesEdition: "EDITION_2014",
    });
  });

  it("switching back to Solo after picking a campaign re-reveals the edition picker", async () => {
    mockFetchCampaigns.mockResolvedValue([
      makeCampaign({ rulesEdition: "EDITION_2014", rulesEditionLabel: "2014 rules" }),
    ]);
    render(<CreationEntryGate onResolved={vi.fn()} />);

    await userEvent.click(await screen.findByRole("radio", { name: /the sunless citadel/i }));
    expect(screen.queryByRole("radio", { name: "2024 rules" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /solo/i }));
    expect(screen.getByRole("radio", { name: "2024 rules" })).toBeInTheDocument();
  });

  it("keyboard: arrow keys move focus and selection together across campaign/solo cards (#1111)", async () => {
    mockFetchCampaigns.mockResolvedValue([makeCampaign()]);
    render(<CreationEntryGate onResolved={vi.fn()} />);

    const solo = await screen.findByRole("radio", { name: /solo/i });
    const campaign = screen.getByRole("radio", { name: /the sunless citadel/i });
    expect(solo).toHaveAttribute("tabindex", "0");
    expect(campaign).toHaveAttribute("tabindex", "-1");

    solo.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(campaign).toHaveFocus();
    expect(campaign).toHaveAttribute("aria-checked", "true");
  });

  // #1286: the choice is irreversible, so a transient fetch failure must never
  // silently steer the player into "no campaigns" and a picked-for-them edition.
  describe("campaign list fails to load", () => {
    it("shows an error state and blocks Continue rather than defaulting to Solo", async () => {
      mockFetchCampaigns.mockRejectedValue(new Error("network down"));
      const onResolved = vi.fn();
      render(<CreationEntryGate onResolved={onResolved} />);

      expect(await screen.findByText(/couldn't check your campaigns/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /continue/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
      expect(onResolved).not.toHaveBeenCalled();
    });

    it("Try again re-fetches and recovers into the normal picker", async () => {
      mockFetchCampaigns.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce([]);
      render(<CreationEntryGate onResolved={vi.fn()} />);

      await screen.findByText(/couldn't check your campaigns/i);
      await userEvent.click(screen.getByRole("button", { name: /try again/i }));

      expect(await screen.findByRole("radio", { name: "2024 rules" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
    });
  });

  // #1343: an unbounded campaign list pushed EditionSection and Continue below
  // the fold for a DM with many campaigns — one screenshot showed 18 cards with
  // no visible way forward. jsdom can only assert the class strings that drive
  // the cap; it can't verify anything about layout (no stylesheet, zero-size
  // bounding rects) — the browser check is the real gate for this issue.
  describe("campaign list overflow (#1343)", () => {
    it("caps and scrolls the campaign list past three campaigns", async () => {
      mockFetchCampaigns.mockResolvedValue(makeCampaigns(20));
      render(<CreationEntryGate onResolved={vi.fn()} />);

      const group = await screen.findByRole("radiogroup", { name: /which campaign/i });
      expect(group.className).toContain("overflow-y-auto");
      expect(group.className).toContain("max-h-48");
      expect(group.className).toContain("sm:max-h-60");
      expect(group.className).toContain("thin-scrollbar");
    });

    it("leaves the list uncapped at three campaigns or fewer, so the common case is unchanged", async () => {
      mockFetchCampaigns.mockResolvedValue(makeCampaigns(3));
      render(<CreationEntryGate onResolved={vi.fn()} />);

      const group = await screen.findByRole("radiogroup", { name: /which campaign/i });
      // Byte-identical to the pre-#1343 markup — not just "no scroll classes" —
      // so a stray p-0.5/padding class applied unconditionally also fails this.
      expect(group.className).toBe("grid gap-3 sm:grid-cols-2");
    });

    it("keeps radiogroup semantics and per-card selection when the list scrolls", async () => {
      mockFetchCampaigns.mockResolvedValue(makeCampaigns(20));
      render(<CreationEntryGate onResolved={vi.fn()} />);

      const group = await screen.findByRole("radiogroup", { name: /which campaign/i });
      // Solo + 20 campaigns — scoped to the campaign group, since EditionPicker's
      // own two radios (2024/2014) are also on the page once Solo is selected.
      expect(within(group).getAllByRole("radio")).toHaveLength(21);

      await userEvent.click(screen.getByRole("radio", { name: "Campaign 17" }));
      expect(screen.getByRole("radio", { name: "Campaign 17" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByText(/inherited from Campaign 17/)).toBeInTheDocument();
    });

    it("has no axe violations with a long campaign list", async () => {
      mockFetchCampaigns.mockResolvedValue(makeCampaigns(20));
      const { container } = render(<CreationEntryGate onResolved={vi.fn()} />);
      await screen.findAllByRole("radio");
      expect(await axe(container)).toHaveNoViolations();
    });

    it("scrolls the arrow-key-focused campaign card into view", async () => {
      mockFetchCampaigns.mockResolvedValue(makeCampaigns(20));
      render(<CreationEntryGate onResolved={vi.fn()} />);

      const solo = await screen.findByRole("radio", { name: /solo/i });
      const spy = vi.spyOn(Element.prototype, "scrollIntoView");
      solo.focus();
      // Anti-vacuity: nothing scrolls on mount/focus alone — only the keypress does.
      expect(spy).not.toHaveBeenCalled();

      await userEvent.keyboard("{ArrowRight}");
      expect(spy).toHaveBeenCalledWith({ block: "nearest" });
      spy.mockRestore();
    });
  });
});
