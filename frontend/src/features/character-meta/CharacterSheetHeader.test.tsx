import { render, screen, within } from "@testing-library/react";
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

    expect(screen.getByText("Round 3")).toBeInTheDocument();
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
