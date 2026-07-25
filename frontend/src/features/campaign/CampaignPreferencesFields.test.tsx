import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { updateCampaignPreferences } from "@/api/client";
import CampaignPreferencesFields from "@/features/campaign/CampaignPreferencesFields";
import { cachedCharacter, renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({ updateCampaignPreferences: vi.fn() }));

function makeCharacter(over: Partial<Character> = {}): Character {
  return {
    id: "c1",
    campaignPreferences: { shareWithDm: false, autoFriendlyHealing: false },
    ...over,
  } as unknown as Character;
}

describe("CampaignPreferencesFields", () => {
  // Was GENUINE RED pre-#1284 C2 (plan §0/§2/§9.4): this used to call
  // updateCampaignPreferences() directly and only forward the result via a
  // since-deleted `onUpdate` prop — nothing wrote the character query cache.
  // Now routed through useCharacterMutation + useCurrentCharacter().setCharacter.
  it("reaches the character cache after a preference toggle", async () => {
    const updated = makeCharacter({
      campaignPreferences: { shareWithDm: true, autoFriendlyHealing: false },
    });
    vi.mocked(updateCampaignPreferences).mockResolvedValue(updated);

    renderWithCharacter(<CampaignPreferencesFields character={makeCharacter()} />, makeCharacter());

    screen.getByLabelText(/share sheet with dm/i).click();

    await waitFor(() => expect(cachedCharacter("c1")?.campaignPreferences?.shareWithDm).toBe(true));
  });
});
