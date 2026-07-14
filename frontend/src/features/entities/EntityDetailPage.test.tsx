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
  fetchEntityConnections: vi.fn(),
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

const authState = vi.hoisted(() => ({ userId: "u1" }));
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: { id: authState.userId, email: null, name: null, imageUrl: null },
    logout: vi.fn(),
  }),
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
  characterId: null,
  createdAt: "",
  updatedAt: "",
};

function backlink(overrides?: {
  id?: string;
  sessionId?: string | null;
  sessionTitle?: string | null;
  sessionOrdinal?: number | null;
  body?: string;
  identity?: { id: string; name: string };
}): EntityBacklink {
  return {
    entry: {
      id: overrides?.id ?? "entry-1",
      characterId: "char-9",
      sessionId: overrides?.sessionId ?? null,
      sessionTitle: overrides?.sessionTitle ?? null,
      sessionOrdinal: overrides?.sessionOrdinal ?? null,
      kind: "NOTE",
      title: "Ambush",
      date: "2026-06-22T00:00:00.000Z",
      loggedAt: "2026-06-22T00:00:00.000Z",
      body: overrides?.body ?? "We fought the goblin chief at the bridge.",
    },
    characterName: "Thorne",
    identity: overrides?.identity ?? { id: ENTITY_ID, name: "Goblin Chief" },
  };
}

const BACKLINK = backlink();

function campaign(
  role: "OWNER" | "PLAYER",
  characters: { id: string; name: string; ownerId: string }[] = [],
): Campaign {
  return {
    id: CAMPAIGN_ID,
    name: "Camp",
    ownerId: "u1",
    inviteCode: "x",
    createdAt: "",
    members: [],
    characters,
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
  authState.userId = "u1";
  vi.mocked(client.fetchEntities).mockResolvedValue([ENTITY]);
  vi.mocked(client.fetchEntityBacklinks).mockResolvedValue([BACKLINK]);
  vi.mocked(client.fetchEntityConnections).mockResolvedValue([]);
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
    await user.click(await screen.findByRole("button", { name: "Edit entry" }));
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

  it("evicts the deleted entity from the shared cache so live chips drop it", async () => {
    const user = userEvent.setup();
    const survivor: CampaignEntity = { ...ENTITY, id: "ent-2", name: "Vecna" };
    vi.mocked(client.fetchCampaign).mockResolvedValue(campaign("OWNER"));
    vi.mocked(useCampaignEntities).mockReturnValue({
      entities: [ENTITY, survivor],
      byId: new Map([
        [ENTITY_ID, ENTITY],
        ["ent-2", survivor],
      ]),
    });
    vi.mocked(client.deleteEntity).mockResolvedValue(undefined);

    renderPage();
    await user.click(await screen.findByRole("button", { name: /delete entity/i }));

    await waitFor(() =>
      expect(vi.mocked(primeCampaignEntities)).toHaveBeenCalledWith(CAMPAIGN_ID, [survivor]),
    );
  });

  it("renders the article: entity lead, alias line, and its backlinks", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /Goblin Chief/ })).toBeInTheDocument();
    expect(screen.getByText(/Leads the warren/)).toBeInTheDocument();
    expect(screen.getByText(/Also known as Grik/)).toBeInTheDocument();
    expect(await screen.findByText(/fought the goblin chief/)).toBeInTheDocument();
    expect(vi.mocked(client.fetchEntities)).toHaveBeenCalledWith(CAMPAIGN_ID, {
      includeStats: true,
    });
  });

  it("groups chronicle entries under session headers and an Outside a session bucket (#842)", async () => {
    vi.mocked(client.fetchEntityBacklinks).mockResolvedValue([
      backlink({
        id: "e1",
        sessionId: "s12",
        sessionTitle: "The Dragon Hatchery",
        sessionOrdinal: 12,
        body: "Cornered him in the hatchery.",
      }),
      backlink({ id: "e2", body: "Met him on the road." }),
    ]);
    renderPage();
    expect(await screen.findByText(/Session 12 — The Dragon Hatchery/)).toBeInTheDocument();
    expect(screen.getByText("Outside a session")).toBeInTheDocument();
    expect(screen.getByText(/Cornered him in the hatchery/)).toBeInTheDocument();
  });

  it("caps the chronicle at three session groups behind an expander (#842)", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchEntityBacklinks).mockResolvedValue(
      [12, 11, 10, 9].map((n) =>
        backlink({ id: `e${n}`, sessionId: `s${n}`, sessionOrdinal: n, body: `Session ${n} note` }),
      ),
    );
    renderPage();
    await screen.findByText(/Session 12 note/);
    expect(screen.queryByText(/Session 9 note/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show earlier sessions \(1\)/i }));
    expect(screen.getByText(/Session 9 note/)).toBeInTheDocument();
  });

  it("labels a merged identity's entries with 'as {name}' (#387)", async () => {
    vi.mocked(client.fetchEntityBacklinks).mockResolvedValue([
      backlink({ id: "e1", identity: { id: "ent-old", name: "Jenkins" }, body: "Odd fellow." }),
    ]);
    renderPage();
    expect(await screen.findByRole("link", { name: "Jenkins" })).toHaveAttribute(
      "href",
      `/campaigns/${CAMPAIGN_ID}/entities/ent-old`,
    );
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

  it("lets an OWNER hide a revealed entity via updateEntity (#523)", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchCampaign).mockResolvedValue(campaign("OWNER"));
    vi.mocked(client.updateEntity).mockResolvedValue({ ...ENTITY, visibility: "HIDDEN" });

    renderPage();
    await user.click(await screen.findByRole("button", { name: /hide from players/i }));

    expect(vi.mocked(client.updateEntity)).toHaveBeenCalledWith(CAMPAIGN_ID, ENTITY_ID, {
      visibility: "HIDDEN",
    });
    // After the flip the control offers Reveal and the Hidden badge shows.
    expect(await screen.findByRole("button", { name: /reveal to players/i })).toBeInTheDocument();
    expect(await screen.findAllByText(/Hidden/)).not.toHaveLength(0);
  });

  it("lets an OWNER reveal a hidden entity via updateEntity (#523)", async () => {
    const user = userEvent.setup();
    const hidden: CampaignEntity = { ...ENTITY, visibility: "HIDDEN" };
    vi.mocked(client.fetchEntities).mockResolvedValue([hidden]);
    vi.mocked(client.fetchCampaign).mockResolvedValue(campaign("OWNER"));
    vi.mocked(useCampaignEntities).mockReturnValue({
      entities: [hidden],
      byId: new Map([[ENTITY_ID, hidden]]),
    });
    vi.mocked(client.updateEntity).mockResolvedValue({ ...ENTITY, visibility: "REVEALED" });

    renderPage();
    await user.click(await screen.findByRole("button", { name: /reveal to players/i }));

    expect(vi.mocked(client.updateEntity)).toHaveBeenCalledWith(CAMPAIGN_ID, ENTITY_ID, {
      visibility: "REVEALED",
    });
    expect(vi.mocked(primeCampaignEntities)).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.arrayContaining([expect.objectContaining({ id: ENTITY_ID, visibility: "REVEALED" })]),
    );
  });

  it("hides the reveal/hide control from a PLAYER (#523)", async () => {
    renderPage();
    await screen.findByRole("heading", { name: /Goblin Chief/ });
    expect(screen.queryByRole("button", { name: /reveal to players|hide from players/i })).not.toBeInTheDocument();
  });

  it("links the owning viewer's PC entity to its character sheet (#842)", async () => {
    const pc: CampaignEntity = { ...ENTITY, type: "PC", characterId: "char-9" };
    vi.mocked(client.fetchEntities).mockResolvedValue([pc]);
    vi.mocked(client.fetchCampaign).mockResolvedValue(
      campaign("PLAYER", [{ id: "char-9", name: "Thorne", ownerId: "u1" }]),
    );
    renderPage();
    expect(await screen.findByRole("link", { name: /character sheet/i })).toHaveAttribute(
      "href",
      "/characters/char-9",
    );
  });

  it("hides the character-sheet link from a viewer who doesn't own the character (#842)", async () => {
    const pc: CampaignEntity = { ...ENTITY, type: "PC", characterId: "char-9" };
    vi.mocked(client.fetchEntities).mockResolvedValue([pc]);
    vi.mocked(client.fetchCampaign).mockResolvedValue(
      campaign("PLAYER", [{ id: "char-9", name: "Thorne", ownerId: "someone-else" }]),
    );
    renderPage();
    await screen.findByRole("heading", { name: /Goblin Chief/ });
    expect(screen.queryByRole("link", { name: /character sheet/i })).not.toBeInTheDocument();
  });

  it("omits the character-sheet row when the entity has no linked character (#842)", async () => {
    renderPage();
    await screen.findByRole("heading", { name: /Goblin Chief/ });
    expect(screen.queryByRole("link", { name: /character sheet/i })).not.toBeInTheDocument();
  });

  it("renders co-mention connection chips linking to their entities (#842)", async () => {
    vi.mocked(client.fetchEntityConnections).mockResolvedValue([
      { entity: { id: "ent-9", name: "Sildar", type: "NPC" }, count: 3 },
    ]);
    renderPage();
    const chip = await screen.findByRole("link", { name: /Sildar\s*×3/ });
    expect(chip).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/entities/ent-9`);
  });

  it("hides the connections section when there are none (#842)", async () => {
    renderPage();
    await screen.findByRole("heading", { name: /Goblin Chief/ });
    expect(screen.queryByText("Connections")).not.toBeInTheDocument();
  });

  it("lands directly in edit state via ?edit=1 (#842)", async () => {
    renderPage({ pathname: ENTITY_PATH, search: "?edit=1" });
    expect(await screen.findByLabelText(/Name/)).toHaveValue("Goblin Chief");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("opens the edit form from the contribute band (#842)", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /add to this entry/i }));
    expect(screen.getByLabelText(/Name/)).toHaveValue("Goblin Chief");
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
    const back = await screen.findByRole("link", { name: "← Codex" });
    expect(back).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/codex`);
  });

  it("links back to Manage when navigated from Manage via location.state (#489)", async () => {
    renderPage({ pathname: ENTITY_PATH, state: { from: `/campaigns/${CAMPAIGN_ID}/manage` } });
    const back = await screen.findByRole("link", { name: "← Codex" });
    expect(back).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/manage`);
  });

  it("ignores a non-relative location.state origin and falls back to Codex (#489)", async () => {
    renderPage({ pathname: ENTITY_PATH, state: { from: "https://evil.example/phish" } });
    const back = await screen.findByRole("link", { name: "← Codex" });
    expect(back).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/codex`);
  });

  it("links back to Manage when ?from=manage is present (#489)", async () => {
    renderPage({ pathname: ENTITY_PATH, search: "?from=manage" });
    const back = await screen.findByRole("link", { name: "← Codex" });
    expect(back).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/manage`);
  });

  it("honors the Manage origin on the not-found back affordance (#489)", async () => {
    vi.mocked(client.fetchEntities).mockResolvedValue([]);
    renderPage({ pathname: ENTITY_PATH, state: { from: `/campaigns/${CAMPAIGN_ID}/manage` } });
    const back = await screen.findByRole("link", { name: /back to campaign/i });
    expect(back).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/manage`);
  });
});
