import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import EntityDetailPage from "@/features/entities/EntityDetailPage";
import * as client from "@/api/client";
import type { Campaign, CampaignEntity, EntityBacklink } from "@/types/character";
import { axe } from "@/test/axe";

vi.mock("@/api/client", () => ({
  fetchCampaign: vi.fn(),
  fetchEntities: vi.fn(),
  fetchEntityBacklinks: vi.fn(),
  updateEntity: vi.fn(),
  deleteEntity: vi.fn(),
}));

const ENTITY_ID = "ent-1";
const CAMPAIGN_ID = "camp-1";

const ENTITY: CampaignEntity = {
  id: ENTITY_ID,
  campaignId: CAMPAIGN_ID,
  type: "NPC",
  name: "Goblin Chief",
  aliases: ["Grik"],
  notes: "Leads the warren.",
  createdAt: "",
  updatedAt: "",
};

const BACKLINK: EntityBacklink = {
  entry: {
    id: "entry-1",
    characterId: "char-9",
    sessionId: null,
    kind: "NOTE",
    title: "Ambush",
    date: "2026-06-22T00:00:00.000Z",
    loggedAt: "2026-06-22T00:00:00.000Z",
    body: "We fought the goblin chief at the bridge.",
  },
  characterName: "Thorne",
};

function campaign(role: "OWNER" | "PLAYER"): Campaign {
  return {
    id: CAMPAIGN_ID,
    name: "Camp",
    ownerId: "u1",
    inviteCode: "x",
    createdAt: "",
    members: [],
    role,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/campaigns/${CAMPAIGN_ID}/entities/${ENTITY_ID}`]}>
      <Routes>
        <Route path="/campaigns/:id/entities/:entityId" element={<EntityDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.fetchEntities).mockResolvedValue([ENTITY]);
  vi.mocked(client.fetchEntityBacklinks).mockResolvedValue([BACKLINK]);
  vi.mocked(client.fetchCampaign).mockResolvedValue(campaign("PLAYER"));
});

describe("EntityDetailPage (#248)", () => {
  it("renders the entity and its backlinks", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /Goblin Chief/ })).toBeInTheDocument();
    expect(screen.getByText(/Leads the warren/)).toBeInTheDocument();
    expect(await screen.findByText(/fought the goblin chief/)).toBeInTheDocument();
  });

  it("shows the delete control to an OWNER", async () => {
    vi.mocked(client.fetchCampaign).mockResolvedValue(campaign("OWNER"));
    renderPage();
    expect(await screen.findByRole("button", { name: /delete entity/i })).toBeInTheDocument();
  });

  it("hides the delete control from a PLAYER", async () => {
    renderPage();
    await screen.findByRole("heading", { name: /Goblin Chief/ });
    expect(screen.queryByRole("button", { name: /delete entity/i })).not.toBeInTheDocument();
  });

  it("shows a zero-state when there are no backlinks", async () => {
    vi.mocked(client.fetchEntityBacklinks).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/No mentions yet/)).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: /Goblin Chief/ });
    expect(await axe(container)).toHaveNoViolations();
  });
});
