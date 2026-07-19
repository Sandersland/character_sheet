import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import StoryPanel from "@/features/character-meta/panels/StoryPanel";
import type { Character } from "@/types/character";

// JournalDoorway drives useChronicle (arcs + sessions) via @/api/client; stub it.
vi.mock("@/api/client", () => ({
  fetchCampaignArcs: vi.fn().mockResolvedValue([]),
  fetchChronicleSessions: vi.fn().mockResolvedValue([]),
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
  it("renders journal and identity", () => {
    renderPanel(makeCharacter({ campaignId: "camp-1" }));
    expect(screen.getByText("Journal")).toBeInTheDocument();
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Sage")).toBeInTheDocument();
  });

  // Campaign preferences moved to the header ⋮ "Campaign settings" sheet (#1087);
  // the Story tab no longer carries them, even for a campaign-attached character.
  it("no longer renders campaign preferences", () => {
    renderPanel(makeCharacter({ campaignId: "camp-1" }));
    expect(screen.queryByText("Campaign preferences")).not.toBeInTheDocument();
  });
});
