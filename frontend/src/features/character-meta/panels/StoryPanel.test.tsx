import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import StoryPanel from "@/features/character-meta/panels/StoryPanel";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character } from "@/types/character";

// JournalDoorway drives useChronicle (arcs + sessions) via @/api/client, and
// IdentityCard's portrait region imports the portrait mutations; stub all four.
vi.mock("@/api/client", () => ({
  fetchCampaignArcs: vi.fn().mockResolvedValue([]),
  fetchChronicleSessions: vi.fn().mockResolvedValue([]),
  uploadCharacterPortrait: vi.fn(),
  deleteCharacterPortrait: vi.fn(),
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

// StoryPanel and its nested JournalDoorway/IdentityCard read
// useCurrentCharacter(), so every render seeds the cache and mounts
// CurrentCharacterProvider.
function renderPanel(character: Character) {
  return renderWithCharacter(
    <MemoryRouter>
      <StoryPanel />
    </MemoryRouter>,
    character,
  );
}

describe("StoryPanel (#927)", () => {
  it("renders journal and identity", () => {
    renderPanel(makeCharacter({ campaignId: "camp-1" }));
    expect(screen.getByText("Journal")).toBeInTheDocument();
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Sage")).toBeInTheDocument();
  });

  // The portrait editor merged into the Identity card (#1618) — no standalone
  // Portrait card heading, but its upload affordance renders inside Identity.
  it("renders the portrait editor inside Identity, not as its own card", () => {
    renderPanel(makeCharacter({ campaignId: "camp-1" }));
    expect(screen.queryByRole("heading", { name: "Portrait" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose image" })).toBeInTheDocument();
  });

  // Campaign preferences moved to the header ⋮ "Campaign settings" sheet (#1087);
  // the Story tab no longer carries them, even for a campaign-attached character.
  it("no longer renders campaign preferences", () => {
    renderPanel(makeCharacter({ campaignId: "camp-1" }));
    expect(screen.queryByText("Campaign preferences")).not.toBeInTheDocument();
  });
});
