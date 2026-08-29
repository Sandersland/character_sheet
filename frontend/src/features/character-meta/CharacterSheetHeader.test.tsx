import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import CharacterSheetHeader from "@/features/character-meta/CharacterSheetHeader";
import { fetchEditions } from "@/api/client";
import { RollProvider } from "@/features/dice/RollContext";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import { DiceRollStyleProvider } from "@/features/dice/DiceRollStyleProvider";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { SheetTab } from "@/features/character-meta/sheetTabs";
import type { Character } from "@/types/character";

// Desktop's "Sheet actions" trigger is always last in DOM order — indexing by position broke when it moved.
function desktopSheetActions(): HTMLElement {
  const triggers = screen.getAllByRole("button", { name: /sheet actions/i });
  return triggers[triggers.length - 1];
}


// fetchEditions is mocked only so the badge spec below can prove it's never called —
// the label is served with the sheet (#1436), no separate fetch.
vi.mock("@/api/client", () => ({
  checkHealth: vi.fn().mockResolvedValue(true),
  fetchEditions: vi.fn(),
}));

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

function renderHeader(
  props: Partial<Parameters<typeof CharacterSheetHeader>[0]> = {},
  character: Character = makeCharacter(),
) {
  return renderWithCharacter(
    <MemoryRouter>
      <ThemeProvider>
        <DiceRollStyleProvider>
          <RollProvider>
            <CharacterSheetHeader
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
        </DiceRollStyleProvider>
      </ThemeProvider>
    </MemoryRouter>,
    character,
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
  it("shows 'Campaign settings…' in the desktop ⋮ and fires its handler when campaign-attached", () => {
    const onOpenCampaignSettings = vi.fn();
    renderHeader({ activeTab: "overview", onOpenCampaignSettings });
    fireEvent.click(desktopSheetActions());
    fireEvent.click(screen.getByRole("menuitem", { name: /campaign settings/i }));
    expect(onOpenCampaignSettings).toHaveBeenCalledTimes(1);
  });

  it("omits 'Campaign settings…' for a campaign-less character", () => {
    renderHeader(
      {
        activeTab: "overview",
        onOpenCampaignSettings: vi.fn(),
      },
      makeCharacter({ campaignId: undefined }),
    );
    fireEvent.click(desktopSheetActions());
    expect(screen.queryByRole("menuitem", { name: /campaign settings/i })).not.toBeInTheDocument();
  });
});

describe("CharacterSheetHeader desktop Preferences entry (#1167)", () => {
  it("adds a 'Preferences…' item to the desktop ⋮, and its sheet shows the Campaign settings cross-link for a campaign-attached character", () => {
    const onOpenCampaignSettings = vi.fn();
    renderHeader({ activeTab: "overview", onOpenCampaignSettings });

    fireEvent.click(desktopSheetActions());
    fireEvent.click(screen.getByRole("menuitem", { name: /preferences/i }));

    expect(screen.getByRole("dialog", { name: /preferences/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /campaign settings/i }));
    expect(onOpenCampaignSettings).toHaveBeenCalledTimes(1);
  });

  it("omits the Campaign settings cross-link inside desktop Preferences for a campaign-less character", () => {
    renderHeader(
      { activeTab: "overview", onOpenCampaignSettings: vi.fn() },
      makeCharacter({ campaignId: undefined }),
    );

    fireEvent.click(desktopSheetActions());
    fireEvent.click(screen.getByRole("menuitem", { name: /preferences/i }));

    expect(screen.getByRole("dialog", { name: /preferences/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /campaign settings/i })).not.toBeInTheDocument();
  });
});

describe("CharacterSheetHeader banner chrome (#985)", () => {
  it("puts Delete behind the ⋯ overflow, never as a bare banner button", () => {
    renderHeader({ activeTab: "overview" });
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

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

    renderHeader({
      activeTab: "overview",
      isLive: true,
      isLiveJoined: true,
      onLeaveSession: vi.fn(),
      onEndSession: vi.fn(),
    });
    expect(screen.getAllByRole("button", { name: /Note/ })).toHaveLength(1);
  });

  // jsdom renders both breakpoints; scope the live-pill count to the desktop <header> (md:block).
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

// Both fields set explicitly — deriving one from the other would re-implement
// the mapping this test proves moved server-side (#1436).
describe("CharacterSheetHeader rules edition (#1286)", () => {
  it("shows the character's 2024 rules edition in the desktop banner", () => {
    renderHeader(
      { activeTab: "overview" },
      makeCharacter({ rulesEdition: "EDITION_2024", rulesEditionLabel: "2024 rules" }),
    );
    const desktopHeader = screen.getAllByRole("banner").find((h) => h.className.includes("md:block"))!;
    expect(within(desktopHeader).getByText("2024 rules")).toBeInTheDocument();
  });

  it("shows the character's 2014 rules edition in the desktop banner", () => {
    renderHeader(
      { activeTab: "overview" },
      makeCharacter({ rulesEdition: "EDITION_2014", rulesEditionLabel: "2014 rules" }),
    );
    const desktopHeader = screen.getAllByRole("banner").find((h) => h.className.includes("md:block"))!;
    expect(within(desktopHeader).getByText("2014 rules")).toBeInTheDocument();
  });

  // Never calls useEditions at all (#1436) — "never requested" is the observable
  // claim, so the editions cache is deliberately left unseeded.
  it("renders the badge without ever requesting /api/editions", () => {
    renderHeader(
      { activeTab: "overview" },
      makeCharacter({ rulesEdition: "EDITION_2014", rulesEditionLabel: "2014 rules" }),
    );
    const desktopHeader = screen.getAllByRole("banner").find((h) => h.className.includes("md:block"))!;
    expect(within(desktopHeader).getByText("2014 rules")).toBeInTheDocument();
    expect(vi.mocked(fetchEditions)).not.toHaveBeenCalled();
  });
});
