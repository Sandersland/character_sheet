import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import StoryPanel from "@/features/character-meta/panels/StoryPanel";
import type { Character } from "@/types/character";

// JournalDoorway drives useChronicle (arcs + sessions) and CampaignPreferencesPanel
// reads/writes prefs — both go through @/api/client; stub the surface.
vi.mock("@/api/client", () => ({
  fetchCampaignArcs: vi.fn().mockResolvedValue([]),
  fetchChronicleSessions: vi.fn().mockResolvedValue([]),
  updateCampaignPreferences: vi.fn().mockResolvedValue({}),
}));

function makeCharacter(partial: Partial<Character>): Character {
  return {
    id: "char-1",
    background: "Sage",
    alignment: "Lawful Good",
    journal: [],
    ...partial,
  } as unknown as Character;
}

function renderPanel(character: Character) {
  return render(
    <MemoryRouter>
      <StoryPanel character={character} reference={null} onUpdate={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("StoryPanel (#927)", () => {
  it("renders journal, identity, and campaign preferences for a campaign-attached character", () => {
    renderPanel(makeCharacter({ campaignId: "camp-1" }));
    expect(screen.getByText("Journal")).toBeInTheDocument();
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Sage")).toBeInTheDocument();
    expect(screen.getByText("Campaign preferences")).toBeInTheDocument();
  });

  it("omits campaign preferences when the character has no campaign", () => {
    renderPanel(makeCharacter({ campaignId: undefined }));
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.queryByText("Campaign preferences")).not.toBeInTheDocument();
  });
});
