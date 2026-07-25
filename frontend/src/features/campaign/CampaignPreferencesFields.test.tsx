import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { updateCampaignPreferences } from "@/api/client";
import CampaignPreferencesFields from "@/features/campaign/CampaignPreferencesFields";
import { cachedCharacter } from "@/test/renderWithCharacter";
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
  // GENUINE RED (plan §0/§2/§9.4): today this calls updateCampaignPreferences()
  // directly and only forwards the result via `onUpdate` — nothing writes the
  // character query cache, so a toggle here would silently not reach any sibling
  // reading useCurrentCharacter() until a full reload.
  it("reaches the character cache after a preference toggle", async () => {
    const updated = makeCharacter({
      campaignPreferences: { shareWithDm: true, autoFriendlyHealing: false },
    });
    vi.mocked(updateCampaignPreferences).mockResolvedValue(updated);

    render(<CampaignPreferencesFields character={makeCharacter()} onUpdate={vi.fn()} />);

    screen.getByLabelText(/share sheet with dm/i).click();

    await waitFor(() => expect(cachedCharacter("c1")?.campaignPreferences?.shareWithDm).toBe(true));
  });
});
