import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import CampaignManagePanel from "@/features/entities/CampaignManagePanel";
import * as client from "@/api/client";
import { __resetCampaignEntitiesCacheForTests } from "@/hooks/useCampaignEntities";
import type { CampaignEntity } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchEntities: vi.fn(),
  createEntity: vi.fn(),
  updateEntity: vi.fn(),
  deleteEntity: vi.fn(),
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
  __resetCampaignEntitiesCacheForTests();
});

describe("CampaignManagePanel (#379)", () => {
  it("shows a Hidden badge and a Reveal action for a hidden entity", async () => {
    vi.mocked(client.fetchEntities).mockResolvedValue([
      entity({ id: "e1", name: "Secret Cult", visibility: "HIDDEN" }),
    ]);

    renderPanel();

    expect(await screen.findByText("Secret Cult")).toBeInTheDocument();
    expect(screen.getByText(/Hidden/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reveal/i })).toBeInTheDocument();
  });

  it("toggles visibility via updateEntity", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchEntities).mockResolvedValue([
      entity({ id: "e1", name: "Klarg", visibility: "REVEALED" }),
    ]);
    vi.mocked(client.updateEntity).mockResolvedValue(
      entity({ id: "e1", name: "Klarg", visibility: "HIDDEN" }),
    );

    renderPanel();

    await screen.findByText("Klarg");
    await user.click(screen.getByRole("button", { name: /hide/i }));

    expect(vi.mocked(client.updateEntity)).toHaveBeenCalledWith(CAMPAIGN_ID, "e1", {
      visibility: "HIDDEN",
    });
  });

  it("deletes an entity via deleteEntity and drops it from the list", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchEntities).mockResolvedValue([
      entity({ id: "e1", name: "Disposable" }),
    ]);
    vi.mocked(client.deleteEntity).mockResolvedValue(undefined);

    renderPanel();

    await screen.findByText("Disposable");
    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(vi.mocked(client.deleteEntity)).toHaveBeenCalledWith(CAMPAIGN_ID, "e1");
    await waitFor(() => expect(screen.queryByText("Disposable")).not.toBeInTheDocument());
  });

  it("opens the entity detail page carrying the Manage origin (#489)", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchEntities).mockResolvedValue([entity({ id: "e1", name: "Klarg" })]);

    function OriginProbe() {
      const location = useLocation();
      return <div data-testid="from">{(location.state as { from?: string } | null)?.from ?? ""}</div>;
    }

    render(
      <MemoryRouter initialEntries={[`/campaigns/${CAMPAIGN_ID}/manage`]}>
        <Routes>
          <Route
            path="/campaigns/:id/manage"
            element={<CampaignManagePanel campaignId={CAMPAIGN_ID} />}
          />
          <Route path="/campaigns/:id/entities/:entityId" element={<OriginProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("link", { name: "Klarg" }));
    expect(screen.getByTestId("from")).toHaveTextContent(`/campaigns/${CAMPAIGN_ID}/manage`);
  });

  it("creates a hidden entity from the new-entity form by default", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchEntities).mockResolvedValue([]);
    vi.mocked(client.createEntity).mockResolvedValue(
      entity({ id: "new", name: "Big Bad", visibility: "HIDDEN" }),
    );

    renderPanel();

    await screen.findByText(/No entities yet/i);
    await user.click(screen.getByRole("button", { name: /new entity/i }));
    await user.type(screen.getByLabelText(/Name/i), "Big Bad");
    await user.click(screen.getByRole("button", { name: /create entity/i }));

    expect(vi.mocked(client.createEntity)).toHaveBeenCalledWith(CAMPAIGN_ID, {
      type: "NPC",
      name: "Big Bad",
      visibility: "HIDDEN",
    });
  });
});
