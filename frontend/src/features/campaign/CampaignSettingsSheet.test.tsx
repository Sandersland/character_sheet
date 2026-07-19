import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CampaignSettingsSheet from "@/features/campaign/CampaignSettingsSheet";
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

describe("CampaignSettingsSheet (#1087)", () => {
  it("renders a dialog titled 'Campaign settings'", () => {
    render(
      <CampaignSettingsSheet character={makeCharacter()} onUpdate={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole("dialog", { name: /campaign settings/i })).toBeInTheDocument();
  });

  it("shows the campaign name and DM line once the campaign loads", async () => {
    render(
      <CampaignSettingsSheet character={makeCharacter()} onUpdate={vi.fn()} onClose={vi.fn()} />,
    );
    expect(await screen.findByText(/Curse of Strahd/)).toBeInTheDocument();
    expect(screen.getByText(/DM: Maya/)).toBeInTheDocument();
    expect(client.fetchCampaign).toHaveBeenCalledWith("camp-1");
  });

  it("omits the campaign line gracefully when the fetch fails", async () => {
    vi.mocked(client.fetchCampaign).mockRejectedValue(new Error("boom"));
    render(
      <CampaignSettingsSheet character={makeCharacter()} onUpdate={vi.fn()} onClose={vi.fn()} />,
    );
    // The toggles still render; no error UI for the header line.
    expect(await screen.findByRole("checkbox", { name: /share sheet with dm/i })).toBeInTheDocument();
    expect(screen.queryByText(/Curse of Strahd/)).not.toBeInTheDocument();
  });

  it("writes a single-flag patch through the client and echoes onUpdate", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    vi.mocked(client.updateCampaignPreferences).mockResolvedValue(
      makeCharacter({ shareWithDm: true, autoFriendlyHealing: false }),
    );

    render(
      <CampaignSettingsSheet
        character={makeCharacter({ shareWithDm: false, autoFriendlyHealing: false })}
        onUpdate={onUpdate}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /share sheet with dm/i }));

    expect(client.updateCampaignPreferences).toHaveBeenCalledWith("char-1", { shareWithDm: true });
    expect(onUpdate).toHaveBeenCalled();
  });

  it("surfaces a save error", async () => {
    const user = userEvent.setup();
    vi.mocked(client.updateCampaignPreferences).mockRejectedValue(new Error("nope"));

    render(
      <CampaignSettingsSheet
        character={makeCharacter({ shareWithDm: false, autoFriendlyHealing: false })}
        onUpdate={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /allow party members to heal my sheet/i }));
    expect(await screen.findByText("nope")).toBeInTheDocument();
  });
});
