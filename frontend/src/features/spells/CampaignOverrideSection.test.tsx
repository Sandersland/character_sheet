import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import CampaignOverrideSection from "@/features/spells/CampaignOverrideSection";
import type { Campaign } from "@/types/character";

const DM_CAMPAIGN: Campaign = {
  id: "camp-a",
  name: "The Sunless Citadel",
  ownerId: "u1",
  rulesEdition: "EDITION_2014",
  rulesEditionLabel: "2014",
  inviteCode: "ABC123",
  createdAt: "2024-01-01T00:00:00.000Z",
  members: [],
  role: "OWNER",
};

const PLAYER_CAMPAIGN: Campaign = { ...DM_CAMPAIGN, id: "camp-b", name: "Curse of Strahd", role: "PLAYER" };

describe("CampaignOverrideSection", () => {
  it("shows a spinner while campaigns are loading", () => {
    render(<CampaignOverrideSection entryId="e1" campaigns={null} loadError={null} onForked={() => {}} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the load error instead of the list", () => {
    render(<CampaignOverrideSection entryId="e1" campaigns={null} loadError="Couldn't load your campaigns." onForked={() => {}} />);
    expect(screen.getByText("Couldn't load your campaigns.")).toBeInTheDocument();
  });

  it("renders nothing when the caller DMs no campaigns", () => {
    const { container } = render(
      <CampaignOverrideSection entryId="e1" campaigns={[PLAYER_CAMPAIGN]} loadError={null} onForked={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when entryId is absent (no catalog metadata to fork)", () => {
    const { container } = render(
      <CampaignOverrideSection entryId={undefined} campaigns={[DM_CAMPAIGN]} loadError={null} onForked={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // claude-review finding: the `!entryId` guard used to run AFTER the
  // loading/error guards, so a spell with no catalog metadata still flashed
  // a Spinner during the campaign-fetch window even though the outcome was
  // always going to be "nothing here" — pinned here with campaigns still
  // `null` (the in-flight state) rather than resolved, since that's exactly
  // the window the old ordering leaked a spinner into.
  it("renders nothing (not a spinner) when entryId is absent, even while campaigns are still loading", () => {
    const { container } = render(
      <CampaignOverrideSection entryId={undefined} campaigns={null} loadError={null} onForked={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  // Same reasoning as above but for the load-error branch.
  it("renders nothing (not the load error) when entryId is absent, even if the campaign fetch failed", () => {
    const { container } = render(
      <CampaignOverrideSection entryId={undefined} campaigns={null} loadError="Couldn't load your campaigns." onForked={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists only campaigns the caller DMs", () => {
    render(<CampaignOverrideSection entryId="e1" campaigns={[DM_CAMPAIGN, PLAYER_CAMPAIGN]} loadError={null} onForked={() => {}} />);
    expect(screen.getByText("The Sunless Citadel")).toBeInTheDocument();
    expect(screen.queryByText("Curse of Strahd")).not.toBeInTheDocument();
  });
});
