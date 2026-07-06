import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CampaignManagePanel from "@/features/entities/CampaignManagePanel";
import * as client from "@/api/client";
import { __resetCampaignEntitiesCacheForTests } from "@/hooks/useCampaignEntities";
import type { CampaignEntity } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchEntities: vi.fn(),
  prepareEntityMerge: vi.fn(),
  executeEntityMerge: vi.fn(),
  unmergeEntityMerge: vi.fn(),
}));

const mergeState = vi.hoisted(() => ({ merges: [] as import("@/types/character").CampaignEntityMerge[] }));
vi.mock("@/hooks/useCampaignMerges", () => ({
  useCampaignMerges: () => ({ merges: mergeState.merges }),
  primeCampaignMerges: vi.fn(),
}));

const CAMPAIGN_ID = "camp-1";

function entity(overrides: Partial<CampaignEntity> & { id: string; name: string }): CampaignEntity {
  return {
    campaignId: CAMPAIGN_ID,
    type: "NPC",
    aliases: [],
    notes: null,
    visibility: "REVEALED",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <CampaignManagePanel campaignId={CAMPAIGN_ID} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mergeState.merges = [];
  __resetCampaignEntitiesCacheForTests();
});

describe("CampaignManagePanel (#379/#523)", () => {
  it("no longer renders the entity list or a create form (moved to Codex, #523)", async () => {
    vi.mocked(client.fetchEntities).mockResolvedValue([
      entity({ id: "e1", name: "Secret Cult", visibility: "HIDDEN" }),
    ]);

    renderPanel();

    // The Identity-merges section still renders...
    expect(await screen.findByRole("heading", { name: /identity merges/i })).toBeInTheDocument();
    // ...but the entity row, its reveal/delete actions, and the new-entity form are gone.
    expect(screen.queryByText("Secret Cult")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: /search entities/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new entity/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^reveal$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it("prepares a merge from the two-entity form (#387)", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchEntities).mockResolvedValue([
      entity({ id: "jenkins", name: "Jenkins" }),
      entity({ id: "vecna", name: "Vecna", visibility: "HIDDEN" }),
    ]);
    vi.mocked(client.prepareEntityMerge).mockResolvedValue({
      id: "m1",
      campaignId: CAMPAIGN_ID,
      mergedEntityId: "jenkins",
      survivorEntityId: "vecna",
      status: "PREPARED",
      note: null,
      preparedAt: "2026-01-01T00:00:00.000Z",
      executedAt: null,
    });

    renderPanel();

    await user.click(await screen.findByRole("button", { name: /open prepare merge form/i }));
    await user.selectOptions(screen.getByLabelText(/Old identity/i), "jenkins");
    await user.selectOptions(screen.getByLabelText(/Revealed to be/i), "vecna");
    await user.click(screen.getByRole("button", { name: /^Prepare merge$/i }));

    expect(vi.mocked(client.prepareEntityMerge)).toHaveBeenCalledWith(CAMPAIGN_ID, {
      mergedEntityId: "jenkins",
      survivorEntityId: "vecna",
      note: undefined,
    });
  });

  it("disables the prepare-merge toggle when fewer than two entities exist", async () => {
    vi.mocked(client.fetchEntities).mockResolvedValue([entity({ id: "solo", name: "Solo" })]);
    renderPanel();
    expect(await screen.findByRole("button", { name: /open prepare merge form/i })).toBeDisabled();
  });

  it("renders a prepared merge with Execute-reveal and Cancel (#387)", async () => {
    vi.mocked(client.fetchEntities).mockResolvedValue([
      entity({ id: "jenkins", name: "Jenkins" }),
      entity({ id: "vecna", name: "Vecna", visibility: "HIDDEN" }),
    ]);
    mergeState.merges = [
      {
        id: "m1",
        campaignId: CAMPAIGN_ID,
        mergedEntityId: "jenkins",
        survivorEntityId: "vecna",
        status: "PREPARED",
        note: null,
        preparedAt: "2026-01-01T00:00:00.000Z",
        executedAt: null,
      },
    ];

    renderPanel();

    expect(await screen.findByText(/Jenkins/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /execute reveal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });
});
