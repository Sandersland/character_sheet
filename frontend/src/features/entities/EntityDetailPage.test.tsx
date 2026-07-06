import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import EntityDetailPage from "@/features/entities/EntityDetailPage";
import * as client from "@/api/client";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import type {
  Campaign,
  CampaignEntity,
  CampaignEntityMerge,
  EntityBacklink,
} from "@/types/character";
import { axe } from "@/test/axe";

vi.mock("@/api/client", () => ({
  fetchCampaign: vi.fn(),
  fetchEntities: vi.fn(),
  fetchEntityBacklinks: vi.fn(),
  updateEntity: vi.fn(),
  deleteEntity: vi.fn(),
}));

vi.mock("@/hooks/useCampaignEntities", () => ({
  useCampaignEntities: vi.fn(),
  primeCampaignEntities: vi.fn(),
}));

const mergeState = vi.hoisted(() => ({ merges: [] as CampaignEntityMerge[] }));
vi.mock("@/hooks/useCampaignMerges", () => ({
  useCampaignMerges: () => ({ merges: mergeState.merges }),
  primeCampaignMerges: vi.fn(),
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
  visibility: "REVEALED",
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
  identity: { id: ENTITY_ID, name: "Goblin Chief" },
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

function renderPage(
  entry:
    | string
    | { pathname: string; search?: string; state?: unknown } = `/campaigns/${CAMPAIGN_ID}/entities/${ENTITY_ID}`,
) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/campaigns/:id/entities/:entityId" element={<EntityDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const ENTITY_PATH = `/campaigns/${CAMPAIGN_ID}/entities/${ENTITY_ID}`;

beforeEach(() => {
  vi.clearAllMocks();
  mergeState.merges = [];
  vi.mocked(client.fetchEntities).mockResolvedValue([ENTITY]);
  vi.mocked(client.fetchEntityBacklinks).mockResolvedValue([BACKLINK]);
  vi.mocked(client.fetchCampaign).mockResolvedValue(campaign("PLAYER"));
  vi.mocked(useCampaignEntities).mockReturnValue({
    entities: [ENTITY],
    byId: new Map([[ENTITY_ID, ENTITY]]),
  });
});

describe("EntityDetailPage (#248)", () => {
  it("primes the shared entity cache on rename so live chips update", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchCampaign).mockResolvedValue(campaign("OWNER"));
    vi.mocked(client.updateEntity).mockResolvedValue({ ...ENTITY, name: "Goblin King" });

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const nameInput = screen.getByLabelText(/Name/);
    await user.clear(nameInput);
    await user.type(nameInput, "Goblin King");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(vi.mocked(primeCampaignEntities)).toHaveBeenCalledWith(
        CAMPAIGN_ID,
        expect.arrayContaining([expect.objectContaining({ id: ENTITY_ID, name: "Goblin King" })]),
      ),
    );
  });

  it("renders the entity and its backlinks", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /Goblin Chief/ })).toBeInTheDocument();
    expect(screen.getByText(/Leads the warren/)).toBeInTheDocument();
    expect(await screen.findByText(/fought the goblin chief/)).toBeInTheDocument();
  });

  it("shows a 'Revealed to be' banner on an executed merged identity (#387)", async () => {
    const survivor: CampaignEntity = { ...ENTITY, id: "ent-2", name: "Vecna" };
    vi.mocked(useCampaignEntities).mockReturnValue({
      entities: [ENTITY, survivor],
      byId: new Map([
        [ENTITY_ID, ENTITY],
        ["ent-2", survivor],
      ]),
    });
    mergeState.merges = [
      {
        id: "m1",
        campaignId: CAMPAIGN_ID,
        mergedEntityId: ENTITY_ID,
        survivorEntityId: "ent-2",
        status: "EXECUTED",
        note: null,
        preparedAt: "2026-01-01T00:00:00.000Z",
        executedAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    renderPage();
    expect(await screen.findByText(/Revealed to be/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "@Vecna" })).toHaveAttribute(
      "href",
      `/campaigns/${CAMPAIGN_ID}/entities/ent-2`,
    );
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

  it("links back to the campaign codex by default (#367)", async () => {
    renderPage();
    const back = await screen.findByRole("link", { name: /back to campaign/i });
    expect(back).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/codex`);
  });

  it("links back to Manage when navigated from Manage via location.state (#489)", async () => {
    renderPage({ pathname: ENTITY_PATH, state: { from: `/campaigns/${CAMPAIGN_ID}/manage` } });
    const back = await screen.findByRole("link", { name: /back to campaign/i });
    expect(back).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/manage`);
  });

  it("ignores a non-relative location.state origin and falls back to Codex (#489)", async () => {
    renderPage({ pathname: ENTITY_PATH, state: { from: "https://evil.example/phish" } });
    const back = await screen.findByRole("link", { name: /back to campaign/i });
    expect(back).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/codex`);
  });

  it("links back to Manage when ?from=manage is present (#489)", async () => {
    renderPage({ pathname: ENTITY_PATH, search: "?from=manage" });
    const back = await screen.findByRole("link", { name: /back to campaign/i });
    expect(back).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/manage`);
  });

  it("honors the Manage origin on the not-found back affordance (#489)", async () => {
    vi.mocked(client.fetchEntities).mockResolvedValue([]);
    renderPage({ pathname: ENTITY_PATH, state: { from: `/campaigns/${CAMPAIGN_ID}/manage` } });
    const back = await screen.findByRole("link", { name: /back to campaign/i });
    expect(back).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/manage`);
  });
});
