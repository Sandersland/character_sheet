import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import CharacterSheetHeader from "@/features/character-meta/CharacterSheetHeader";
import { RollProvider } from "@/features/dice/RollContext";
import type { SheetTab } from "@/features/character-meta/sheetTabs";
import type { Character } from "@/types/character";

// BackendStatus pings the API on mount; keep it quiet + healthy in tests.
vi.mock("@/api/client", () => ({ checkHealth: vi.fn().mockResolvedValue(true) }));

const TABS: SheetTab[] = [
  { id: "overview", label: "Overview" },
  { id: "combat", label: "Combat" },
  { id: "inventory", label: "Inventory" },
  { id: "story", label: "Story" },
];

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "c1",
    name: "Aldric",
    race: "Human",
    class: "Fighter",
    subclass: "Champion",
    background: "Soldier",
    alignment: "LN",
    level: 7,
    campaignId: "camp1",
    armorClass: 18,
    armorClassBreakdown: [],
    initiativeBonus: 2,
    speed: 30,
    proficiencyBonus: 3,
    hitPoints: { current: 44, max: 62, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    ...overrides,
  } as Character;
}

function renderHeader(props: Partial<Parameters<typeof CharacterSheetHeader>[0]> = {}) {
  return render(
    <MemoryRouter>
      <RollProvider>
        <CharacterSheetHeader
          character={makeCharacter()}
          onUpdate={vi.fn()}
          tabs={TABS}
          activeTab="combat"
          onTabChange={vi.fn()}
          onOpenCapture={vi.fn()}
          onOpenSessions={vi.fn()}
          onOpenActivity={vi.fn()}
          onOpenDelete={vi.fn()}
          {...props}
        />
      </RollProvider>
    </MemoryRouter>,
  );
}

describe("CharacterSheetHeader live state (#964)", () => {
  it("shows the round badge + Combat tab pip when live and in combat", () => {
    renderHeader({ isLive: true, liveRound: 3 });

    expect(screen.getByText(/Round 3/)).toBeInTheDocument();
    const combatTab = screen.getByRole("tab", { name: /Combat/ });
    expect(within(combatTab).getByText(/session live/i)).toBeInTheDocument();
  });

  it("shows a 'Live' badge when live but not in combat (no round)", () => {
    renderHeader({ isLive: true, liveRound: null });

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.queryByText(/^Round/)).not.toBeInTheDocument();
  });

  it("renders no live badge and no Combat pip when not live", () => {
    renderHeader({ isLive: false });

    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Round/)).not.toBeInTheDocument();
    const combatTab = screen.getByRole("tab", { name: /Combat/ });
    expect(within(combatTab).queryByText(/session live/i)).not.toBeInTheDocument();
  });
});

describe("CharacterSheetHeader desktop session controls (#979)", () => {
  it("shows Leave / End Session in the banner while joined and fires their handlers", () => {
    const onLeaveSession = vi.fn();
    const onEndSession = vi.fn();
    renderHeader({ isLive: true, isLiveJoined: true, onLeaveSession, onEndSession });

    // The desktop banner buttons (role=button); the mobile menu items are
    // role=menuitem and only exist after opening the ⋮, so no ambiguity here.
    fireEvent.click(screen.getByRole("button", { name: "End Session" }));
    expect(onEndSession).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Leave Session" }));
    expect(onLeaveSession).toHaveBeenCalledTimes(1);
  });

  it("disables the banner session controls while an action is in flight", () => {
    const onEndSession = vi.fn();
    renderHeader({ isLive: true, isLiveJoined: true, sessionActionBusy: true, onLeaveSession: vi.fn(), onEndSession });

    const end = screen.getByRole("button", { name: "End Session" });
    expect(end).toBeDisabled();
    fireEvent.click(end);
    expect(onEndSession).not.toHaveBeenCalled();
  });

  it("shows no session controls when not joined", () => {
    renderHeader({ isLive: true, isLiveJoined: false });
    expect(screen.queryByRole("button", { name: "Leave Session" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End Session" })).not.toBeInTheDocument();
  });
});

describe("CharacterSheetHeader campaign settings (#1087)", () => {
  // Both breakpoints render in jsdom; the desktop banner's kebab is the second
  // "Sheet actions" menu (MobileSheetHeader renders first).
  it("shows 'Campaign settings…' in the desktop ⋮ and fires its handler when campaign-attached", () => {
    const onOpenCampaignSettings = vi.fn();
    renderHeader({ activeTab: "overview", onOpenCampaignSettings });
    fireEvent.click(screen.getAllByRole("button", { name: /sheet actions/i })[1]);
    fireEvent.click(screen.getByRole("menuitem", { name: /campaign settings/i }));
    expect(onOpenCampaignSettings).toHaveBeenCalledTimes(1);
  });

  it("omits 'Campaign settings…' for a campaign-less character", () => {
    renderHeader({
      activeTab: "overview",
      character: makeCharacter({ campaignId: undefined }),
      onOpenCampaignSettings: vi.fn(),
    });
    fireEvent.click(screen.getAllByRole("button", { name: /sheet actions/i })[1]);
    expect(screen.queryByRole("menuitem", { name: /campaign settings/i })).not.toBeInTheDocument();
  });
});

describe("CharacterSheetHeader banner chrome (#985)", () => {
  it("puts Delete behind the ⋯ overflow, never as a bare banner button", () => {
    renderHeader({ activeTab: "overview" });
    // No bare Delete button — it lives in the menu.
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    // The desktop banner's kebab is "Sheet actions" (mobile header is md:hidden
    // but also renders one in jsdom; scope to the first opened menu's item).
    fireEvent.click(screen.getAllByRole("button", { name: /sheet actions/i })[0]);
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("fires onOpenDelete from the overflow menu", () => {
    const onOpenDelete = vi.fn();
    renderHeader({ activeTab: "overview", onOpenDelete });
    fireEvent.click(screen.getAllByRole("button", { name: /sheet actions/i })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onOpenDelete).toHaveBeenCalledTimes(1);
  });

  it("keeps a single ＋ Note quick-capture chip in the banner cluster (joined or not)", () => {
    const { unmount } = renderHeader({ activeTab: "overview", isLive: false });
    expect(screen.getByRole("button", { name: /Note/ })).toBeInTheDocument();
    unmount();

    // Joined: the live pill + Leave/End join the same cluster, but ＋ Note is not
    // duplicated (the old separate live strip is gone, #1085).
    renderHeader({
      activeTab: "overview",
      isLive: true,
      isLiveJoined: true,
      onLeaveSession: vi.fn(),
      onEndSession: vi.fn(),
    });
    expect(screen.getAllByRole("button", { name: /Note/ })).toHaveLength(1);
  });

  // #1085: the old under-tabs LiveSessionStrip is deleted — the banner's right
  // cluster is now the ONLY desktop live indicator. jsdom also paints the mobile
  // header pill, so scope the count to the desktop <header>.
  it("shows the live pill exactly once in the desktop header (no duplicate live state)", () => {
    renderHeader({
      activeTab: "overview",
      isLive: true,
      liveRound: 3,
      isLiveJoined: true,
      onLeaveSession: vi.fn(),
      onEndSession: vi.fn(),
    });
    const desktopHeader = screen
      .getAllByRole("banner")
      .find((h) => h.className.includes("md:block"))!;
    expect(within(desktopHeader).getAllByText(/Round 3/)).toHaveLength(1);
    expect(within(desktopHeader).getByText(/Live · Round 3/)).toBeInTheDocument();
  });

  it("reads 'Live' with no round when live but not in combat", () => {
    renderHeader({
      activeTab: "overview",
      isLive: true,
      liveRound: null,
      isLiveJoined: true,
      onLeaveSession: vi.fn(),
      onEndSession: vi.fn(),
    });
    const desktopHeader = screen
      .getAllByRole("banner")
      .find((h) => h.className.includes("md:block"))!;
    expect(within(desktopHeader).getByText("Live")).toBeInTheDocument();
    expect(within(desktopHeader).queryByText(/Round/)).not.toBeInTheDocument();
  });
});
