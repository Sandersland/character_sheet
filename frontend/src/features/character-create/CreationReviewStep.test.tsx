import { beforeEach, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import CreationReviewStep from "@/features/character-create/CreationReviewStep";
import { getQueryClient } from "@/api/queryClient";
import { catalogKeys } from "@/api/queryKeys";
import { seedEditions } from "@/test/editions";
import type { CreationPreview } from "@/lib/characterCreation";

const PREVIEW: CreationPreview = { armorClass: 10, dexModifier: 0, speed: 30, maxHp: 10 };

// This file mocks @/api/client not at all, so without a seeded cache useEditions
// would fire a real fetch in jsdom (#1436) — a silent hang, not a loud failure.
beforeEach(() => {
  seedEditions();
});

describe("CreationReviewStep", () => {
  it("shows the real error message verbatim, not a generic form-check message", () => {
    render(
      <CreationReviewStep
        preview={PREVIEW}
        missing={[]}
        submitError="Character created, but couldn't join the campaign — Campaign not found"
        campaignName={null}
        rulesEdition="EDITION_2024"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Character created, but couldn't join the campaign — Campaign not found",
    );
    expect(screen.queryByText(/check the form/i)).not.toBeInTheDocument();
  });

  it("renders nothing for submitError when null", () => {
    render(
      <CreationReviewStep preview={PREVIEW} missing={[]} submitError={null} campaignName={null} rulesEdition="EDITION_2024" />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // #1286: the last screen before an irreversible write echoes the choice —
  // it's otherwise invisible here and unchangeable except via Start Over.
  it("echoes 'Solo character' and the edition for a solo build", () => {
    render(
      <CreationReviewStep preview={PREVIEW} missing={[]} submitError={null} campaignName={null} rulesEdition="EDITION_2024" />,
    );
    expect(screen.getByText(/solo character/i)).toBeInTheDocument();
    expect(screen.getByText("2024 rules")).toBeInTheDocument();
  });

  it("echoes the campaign name and its inherited edition when joining one", () => {
    render(
      <CreationReviewStep
        preview={PREVIEW}
        missing={[]}
        submitError={null}
        campaignName="The Old Rules Table"
        rulesEdition="EDITION_2014"
      />,
    );
    expect(screen.getByText(/the old rules table/i)).toBeInTheDocument();
    expect(screen.getByText("2014 rules")).toBeInTheDocument();
  });

  // #1436: mid-creation there is no server row to carry a rulesEditionLabel, so
  // the label comes out of the served rows — and before they arrive the edition
  // fragment renders NOTHING rather than a raw EDITION_* key, while the rest of
  // the line still renders.
  it("omits only the edition fragment before /api/editions resolves", () => {
    getQueryClient().removeQueries({ queryKey: catalogKeys.editions() });
    render(
      <CreationReviewStep
        preview={PREVIEW}
        missing={[]}
        submitError={null}
        campaignName="The Old Rules Table"
        rulesEdition="EDITION_2014"
      />,
    );
    expect(screen.getByText(/joining the old rules table/i)).toBeInTheDocument();
    expect(screen.queryByText("2014 rules")).not.toBeInTheDocument();
    expect(screen.queryByText(/EDITION_/)).not.toBeInTheDocument();
  });
});
