import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CampaignSettingsSheet from "@/features/campaign/CampaignSettingsSheet";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import * as client from "@/api/client";
import type { Campaign, CampaignPreferences, Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  updateCampaignPreferences: vi.fn(),
  fetchCampaign: vi.fn(),
}));

function makeCharacter(campaignPreferences?: CampaignPreferences): Character {
  return {
    id: "char-1",
    name: "Aldric",
    campaignId: "camp-1",
    campaignPreferences,
  } as unknown as Character;
}

function makeCampaign(): Campaign {
  return {
    id: "camp-1",
    name: "Curse of Strahd",
    members: [{ role: "OWNER", user: { name: "Maya" } }],
  } as unknown as Campaign;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.fetchCampaign).mockResolvedValue(makeCampaign());
});

// CampaignSettingsSheet's nested CampaignPreferencesFields reads
// useCurrentCharacter(), so every render seeds the cache and mounts
// CurrentCharacterProvider via renderWithCharacter.
function render(character: Character, onClose: () => void = vi.fn()) {
  return renderWithCharacter(
    <CampaignSettingsSheet character={character} onClose={onClose} />,
    character,
  );
}

describe("CampaignSettingsSheet (#1087)", () => {
  it("renders a dialog titled 'Campaign settings'", () => {
    render(makeCharacter());
    expect(screen.getByRole("dialog", { name: /campaign settings/i })).toBeInTheDocument();
  });

  it("shows the campaign name and DM line once the campaign loads", async () => {
    render(makeCharacter());
    expect(await screen.findByText(/Curse of Strahd/)).toBeInTheDocument();
    expect(screen.getByText(/DM: Maya/)).toBeInTheDocument();
    expect(client.fetchCampaign).toHaveBeenCalledWith("camp-1");
  });

  it("omits the campaign line gracefully when the fetch fails", async () => {
    vi.mocked(client.fetchCampaign).mockRejectedValue(new Error("boom"));
    render(makeCharacter());
    // The toggles still render; no error UI for the header line.
    expect(await screen.findByRole("checkbox", { name: /share sheet with dm/i })).toBeInTheDocument();
    expect(screen.queryByText(/Curse of Strahd/)).not.toBeInTheDocument();
  });

  it("writes a single-flag patch through the client", async () => {
    const user = userEvent.setup();
    vi.mocked(client.updateCampaignPreferences).mockResolvedValue(
      makeCharacter({ shareWithDm: true, autoFriendlyHealing: false }),
    );

    render(makeCharacter({ shareWithDm: false, autoFriendlyHealing: false }));

    await user.click(screen.getByRole("checkbox", { name: /share sheet with dm/i }));

    expect(client.updateCampaignPreferences).toHaveBeenCalledWith("char-1", { shareWithDm: true });
  });

  it("surfaces a save error", async () => {
    const user = userEvent.setup();
    vi.mocked(client.updateCampaignPreferences).mockRejectedValue(new Error("nope"));

    render(makeCharacter({ shareWithDm: false, autoFriendlyHealing: false }));

    await user.click(screen.getByRole("checkbox", { name: /allow party members to heal my sheet/i }));
    expect(await screen.findByText("nope")).toBeInTheDocument();
  });
});
