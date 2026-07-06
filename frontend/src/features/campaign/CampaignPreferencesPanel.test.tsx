import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CampaignPreferencesPanel from "@/features/campaign/CampaignPreferencesPanel";
import * as client from "@/api/client";
import type { CampaignPreferences, Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  updateCampaignPreferences: vi.fn(),
}));

function makeCharacter(campaignPreferences?: CampaignPreferences): Character {
  return {
    id: "char-1",
    campaignId: "camp-1",
    campaignPreferences,
  } as unknown as Character;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CampaignPreferencesPanel", () => {
  it("reads the serialized prefs into the toggles", () => {
    render(
      <CampaignPreferencesPanel
        character={makeCharacter({ shareWithDm: true, autoFriendlyHealing: false })}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByRole("checkbox", { name: /share sheet with dm/i })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /auto-roll friendly healing/i }),
    ).not.toBeChecked();
  });

  it("defaults both toggles to off when prefs are absent", () => {
    render(<CampaignPreferencesPanel character={makeCharacter()} onUpdate={vi.fn()} />);
    for (const cb of screen.getAllByRole("checkbox")) {
      expect(cb).not.toBeChecked();
    }
  });

  it("writes a single-flag patch through the client and swaps the returned character", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const mockUpdate = vi.mocked(client.updateCampaignPreferences);
    mockUpdate.mockResolvedValue(
      makeCharacter({ shareWithDm: true, autoFriendlyHealing: false }),
    );

    render(
      <CampaignPreferencesPanel
        character={makeCharacter({ shareWithDm: false, autoFriendlyHealing: false })}
        onUpdate={onUpdate}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /share sheet with dm/i }));

    expect(mockUpdate).toHaveBeenCalledWith("char-1", { shareWithDm: true });
    expect(onUpdate).toHaveBeenCalled();
  });

  it("surfaces an error when the write fails", async () => {
    const user = userEvent.setup();
    const mockUpdate = vi.mocked(client.updateCampaignPreferences);
    mockUpdate.mockRejectedValue(new Error("nope"));

    render(
      <CampaignPreferencesPanel
        character={makeCharacter({ shareWithDm: false, autoFriendlyHealing: false })}
        onUpdate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /auto-roll friendly healing/i }));

    expect(await screen.findByText("nope")).toBeInTheDocument();
  });
});
