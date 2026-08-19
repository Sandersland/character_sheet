import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  uploadEntityPortrait: vi.fn(),
  deleteEntityPortrait: vi.fn(),
  combineEntities: vi.fn(),
  fetchCampaignItemByEntity: vi.fn(),
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

function backlink(overrides: Partial<EntityBacklink["entry"] & { identity: EntityBacklink["identity"] }> = {}): EntityBacklink {
  const { identity, ...entry } = overrides;
  return {
    entry: {
      id: "entry-1",
      characterId: "char-9",
      sessionId: null,
      sessionTitle: null,
      sessionOrdinal: null,
      kind: "NOTE",
      title: "Ambush",
      date: "2026-06-22T00:00:00.000Z",
      loggedAt: "2026-06-22T00:00:00.000Z",
      body: "We fought the goblin chief at the bridge.",
      ...entry,
    },
    characterName: "Thorne",
    identity: identity ?? { id: ENTITY_ID, name: "Goblin Chief" },
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
    rulesEdition: "EDITION_2024",
    rulesEditionLabel: "2024 rules",
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
  // Only reachable for an ITEM-typed entity (useEntityDetail's own type guard);
  // default to "fronts no item" so a test that types an entity ITEM without
  // caring about this signal doesn't hit an unhandled rejection.
  vi.mocked(client.fetchCampaignItemByEntity).mockRejectedValue(new Error("no item"));
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

  it("links the chronicler name to the sheet only on the viewer's own note (#842)", async () => {
    vi.mocked(client.fetchCampaign).mockResolvedValue(
      campaign("PLAYER", [{ id: "char-9", name: "Thorne", ownerId: "u1" }]),
    );
    renderPage();
    expect(await screen.findByRole("link", { name: "Thorne" })).toHaveAttribute(
      "href",
      "/characters/char-9",
    );
  });

  it("renders another member's chronicler name as plain text — sheets are owner-only (#842)", async () => {
    vi.mocked(client.fetchCampaign).mockResolvedValue(
      campaign("PLAYER", [{ id: "char-9", name: "Thorne", ownerId: "someone-else" }]),
    );
    renderPage();
    expect(await screen.findByText("Thorne")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Thorne" })).not.toBeInTheDocument();
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

  it("saves a PATCH that carries no portraitUrl — the portrait rides its own endpoints (#1617)", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchCampaign).mockResolvedValue(campaign("OWNER"));
    vi.mocked(client.updateEntity).mockResolvedValue(ENTITY);

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit entry" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(vi.mocked(client.updateEntity)).toHaveBeenCalled());
    expect(vi.mocked(client.updateEntity).mock.calls[0][2]).not.toHaveProperty("portraitUrl");
  });

  it("uploads a picked file from the edit form and merges the response into the shared cache (#1617)", async () => {
    const user = userEvent.setup();
    const url = `/api/campaigns/${CAMPAIGN_ID}/entities/${ENTITY_ID}/portrait?v=uuid-1`;
    const file = new File([new Uint8Array(8)], "goblin.png", { type: "image/png" });
    vi.mocked(client.fetchCampaign).mockResolvedValue(campaign("OWNER"));
    vi.mocked(client.uploadEntityPortrait).mockResolvedValue({ ...ENTITY, portraitUrl: url });

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit entry" }));
    await user.upload(screen.getByLabelText("Portrait"), file);

    await waitFor(() =>
      expect(vi.mocked(client.uploadEntityPortrait)).toHaveBeenCalledWith(
        CAMPAIGN_ID,
        ENTITY_ID,
        file,
      ),
    );
    expect(vi.mocked(primeCampaignEntities)).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.arrayContaining([expect.objectContaining({ id: ENTITY_ID, portraitUrl: url })]),
    );
  });

  it("removes the portrait from the edit form via deleteEntityPortrait (#1617)", async () => {
    const user = userEvent.setup();
    const withPortrait: CampaignEntity = {
      ...ENTITY,
      portraitUrl: `/api/campaigns/${CAMPAIGN_ID}/entities/${ENTITY_ID}/portrait?v=uuid-1`,
    };
    vi.mocked(client.fetchEntities).mockResolvedValue([withPortrait]);
    vi.mocked(client.fetchCampaign).mockResolvedValue(campaign("OWNER"));
    vi.mocked(client.deleteEntityPortrait).mockResolvedValue({ ...ENTITY, portraitUrl: null });

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit entry" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(vi.mocked(client.deleteEntityPortrait)).toHaveBeenCalledWith(CAMPAIGN_ID, ENTITY_ID),
    );
    expect(vi.mocked(primeCampaignEntities)).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.arrayContaining([expect.objectContaining({ id: ENTITY_ID, portraitUrl: null })]),
    );
  });

  it("hides the upload control from a PLAYER in the edit form — portrait writes are owner-only (#1617)", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /add to this entry/i }));
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Portrait")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /choose image/i })).not.toBeInTheDocument();
  });

  it("shows the owner an Add-a-portrait affordance that opens the edit form (#844)", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchCampaign).mockResolvedValue(campaign("OWNER"));
    renderPage();
    await user.click(await screen.findByRole("button", { name: /add a portrait/i }));
    expect(screen.getByRole("button", { name: /choose image/i })).toBeInTheDocument();
  });

  it("hides the Add-a-portrait affordance from a PLAYER (#844)", async () => {
    renderPage();
    await screen.findByRole("heading", { name: /Goblin Chief/ });
    expect(screen.queryByRole("button", { name: /add a portrait/i })).not.toBeInTheDocument();
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

  describe("pane rail (#842)", () => {
    const stats = (mentionCount: number) => ({
      mentionCount,
      firstMentioned: null,
      lastMentioned: null,
      chroniclers: [],
      hasDescription: true,
    });
    const FIRST: CampaignEntity = { ...ENTITY, stats: stats(5) };
    const SECOND: CampaignEntity = {
      ...ENTITY,
      id: "ent-2",
      name: "Cragmaw Hideout",
      type: "LOCATION",
      aliases: [],
      notes: "A cave.",
      stats: stats(4),
    };

    beforeEach(() => {
      vi.mocked(client.fetchEntities).mockResolvedValue([FIRST, SECOND]);
    });

    it("lists sibling entities with mention counts and marks the current row", async () => {
      renderPage();
      const rail = await screen.findByRole("navigation", { name: /codex entries/i });
      const current = within(rail).getByRole("link", { current: "page" });
      expect(current).toHaveTextContent("Goblin Chief");
      expect(current).toHaveTextContent("5");
      const sibling = within(rail).getByRole("link", { name: /Cragmaw Hideout/ });
      expect(sibling).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/entities/ent-2`);
      expect(sibling).not.toHaveAttribute("aria-current");
      expect(sibling).toHaveTextContent("4");
    });

    it("filters rail rows by search and type chips", async () => {
      const user = userEvent.setup();
      renderPage();
      const rail = await screen.findByRole("navigation", { name: /codex entries/i });

      await user.type(within(rail).getByRole("searchbox", { name: /search entities/i }), "crag");
      expect(within(rail).queryByRole("link", { name: /Goblin Chief/ })).not.toBeInTheDocument();
      expect(within(rail).getByRole("link", { name: /Cragmaw Hideout/ })).toBeInTheDocument();

      await user.clear(within(rail).getByRole("searchbox", { name: /search entities/i }));
      await user.click(within(rail).getByRole("button", { name: /NPC/ }));
      expect(within(rail).getByRole("link", { name: /Goblin Chief/ })).toBeInTheDocument();
      expect(within(rail).queryByRole("link", { name: /Cragmaw Hideout/ })).not.toBeInTheDocument();
    });

    it("swaps only the pane on row navigation, fetching the new entity's data", async () => {
      const user = userEvent.setup();
      renderPage();
      const rail = await screen.findByRole("navigation", { name: /codex entries/i });

      await user.click(within(rail).getByRole("link", { name: /Cragmaw Hideout/ }));
      await waitFor(() =>
        expect(vi.mocked(client.fetchEntityBacklinks)).toHaveBeenCalledWith(CAMPAIGN_ID, "ent-2"),
      );
      expect(await screen.findByRole("heading", { name: /Cragmaw Hideout/ })).toBeInTheDocument();
      expect(
        within(screen.getByRole("navigation", { name: /codex entries/i })).getByRole("link", {
          current: "page",
        }),
      ).toHaveTextContent("Cragmaw Hideout");
    });
  });

  it("honors the Manage origin on the not-found back affordance (#489)", async () => {
    vi.mocked(client.fetchEntities).mockResolvedValue([]);
    renderPage({ pathname: ENTITY_PATH, state: { from: `/campaigns/${CAMPAIGN_ID}/manage` } });
    const back = await screen.findByRole("link", { name: /back to campaign/i });
    expect(back).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/manage`);
  });

  describe("Combine into… (#1943)", () => {
    const SURVIVOR: CampaignEntity = {
      ...ENTITY,
      id: "ent-2",
      name: "Lili",
      aliases: [],
      notes: null,
      portraitUrl: null,
      visibility: "REVEALED",
    };
    const DUPLICATE: CampaignEntity = {
      ...ENTITY,
      name: "lili",
      aliases: ["Lil"],
      notes: "A hedge witch.",
      visibility: "HIDDEN",
      stats: {
        mentionCount: 3,
        firstMentioned: null,
        lastMentioned: null,
        chroniclers: [],
        hasDescription: true,
      },
    };

    beforeEach(() => {
      vi.mocked(client.fetchCampaign).mockResolvedValue(campaign("OWNER"));
      vi.mocked(client.fetchEntities).mockResolvedValue([DUPLICATE, SURVIVOR]);
      vi.mocked(useCampaignEntities).mockReturnValue({
        entities: [DUPLICATE, SURVIVOR],
        byId: new Map([
          [DUPLICATE.id, DUPLICATE],
          [SURVIVOR.id, SURVIVOR],
        ]),
      });
    });

    it("hides the action from a PLAYER", async () => {
      vi.mocked(client.fetchCampaign).mockResolvedValue(campaign("PLAYER"));
      renderPage();
      await screen.findByRole("heading", { name: "lili" });
      expect(screen.queryByRole("button", { name: /combine into/i })).not.toBeInTheDocument();
    });

    it("shows a searchable survivor picker that excludes the duplicate", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("heading", { name: "Combine into…" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /Lili/ })).toBeInTheDocument();

      await user.type(within(dialog).getByRole("searchbox"), "xyz-no-match");
      expect(within(dialog).queryByRole("button", { name: /Lili/ })).not.toBeInTheDocument();
      expect(within(dialog).getByText(/No entities match/i)).toBeInTheDocument();
    });

    it("keeps ONE Modal instance across the picker → confirm step change — no unmount/remount (review finding #1)", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));

      const pickerDialog = screen.getByRole("dialog");
      await user.click(within(pickerDialog).getByRole("button", { name: /Lili/ }));

      // Same underlying DOM node, not just "a dialog with the same role" —
      // a remount would hand back a different element, which `toBe` (strict
      // reference equality) catches even though both pass the same query.
      const confirmDialog = screen.getByRole("dialog");
      expect(confirmDialog).toBe(pickerDialog);
      expect(within(confirmDialog).getByRole("heading", { name: "Combine into Lili" })).toBeInTheDocument();
    });

    it("won't dismiss via Escape while the combine is in flight (review finding #2)", async () => {
      let resolveCombine: ((entity: CampaignEntity) => void) | undefined;
      vi.mocked(client.combineEntities).mockImplementation(
        () => new Promise((resolve) => { resolveCombine = resolve; }),
      );
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lili/ }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: /combine and delete lili/i }),
      );

      // The mutation is deliberately left pending (resolveCombine never
      // called) — Escape routes through useDialogChrome straight to Modal's
      // onClose, the same path the Close link and an overlay click use, so
      // this exercises all three at once.
      await user.keyboard("{Escape}");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(
        within(screen.getByRole("dialog")).getByRole("button", { name: /combining/i }),
      ).toBeInTheDocument();

      resolveCombine?.(SURVIVOR);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("shows the consequence preview with real counts and the loss list", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lili/ }));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("heading", { name: "Combine into Lili" })).toBeInTheDocument();
      expect(
        within(dialog).getByText(/prepare an identity merge instead/i),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          "3 mentions in 3 journal entries move to Lili, plus any mentions in players' private notes",
        ),
      ).toBeInTheDocument();
      expect(within(dialog).getByText("lili is deleted from the codex")).toBeInTheDocument();
      expect(within(dialog).getByText(/Discarded with lili/i)).toBeInTheDocument();
      expect(within(dialog).getByText("Description/notes")).toBeInTheDocument();
      expect(within(dialog).getByText("Aliases — Lil")).toBeInTheDocument();
      expect(within(dialog).getByText("Hidden visibility")).toBeInTheDocument();
      expect(within(dialog).queryByText("Portrait")).not.toBeInTheDocument();
      expect(within(dialog).getByText("This cannot be undone.")).toBeInTheDocument();
    });

    it("omits the loss box when the duplicate has no discardable content", async () => {
      const bareDuplicate: CampaignEntity = {
        ...DUPLICATE,
        aliases: [],
        notes: null,
        visibility: "REVEALED",
      };
      vi.mocked(client.fetchEntities).mockResolvedValue([bareDuplicate, SURVIVOR]);
      vi.mocked(useCampaignEntities).mockReturnValue({
        entities: [bareDuplicate, SURVIVOR],
        byId: new Map([
          [bareDuplicate.id, bareDuplicate],
          [SURVIVOR.id, SURVIVOR],
        ]),
      });
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lili/ }));

      expect(screen.queryByText(/Discarded with/i)).not.toBeInTheDocument();
    });

    it("warns inline when the duplicate is in a PREPARED identity merge", async () => {
      mergeState.merges = [
        {
          id: "m1",
          campaignId: CAMPAIGN_ID,
          mergedEntityId: ENTITY_ID,
          survivorEntityId: "someone-else",
          status: "PREPARED",
          note: null,
          preparedAt: "2026-01-01T00:00:00.000Z",
          executedAt: null,
        },
      ];
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lili/ }));

      expect(screen.getByText(/has a prepared identity merge/i)).toBeInTheDocument();
    });

    it("renders a 409 conflict inline in the dialog instead of a toast", async () => {
      vi.mocked(client.combineEntities).mockRejectedValue(
        new Error("Both entities are linked to a character"),
      );
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lili/ }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: /combine and delete lili/i }),
      );

      expect(
        await within(screen.getByRole("dialog")).findByText("Both entities are linked to a character"),
      ).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("combines, navigates to the survivor, and toasts on success", async () => {
      vi.mocked(client.combineEntities).mockResolvedValue(SURVIVOR);
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lili/ }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: /combine and delete lili/i }),
      );

      expect(vi.mocked(client.combineEntities)).toHaveBeenCalledWith(CAMPAIGN_ID, "ent-2", [ENTITY_ID]);
      expect(await screen.findByRole("heading", { name: "Lili" })).toBeInTheDocument();
      expect(await screen.findByText("lili combined into Lili.")).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders the character-link/non-PC-survivor 409 inline (#1942 round 2)", async () => {
      vi.mocked(client.combineEntities).mockRejectedValue(
        new Error("The survivor must be a PC entity to inherit the duplicate's character link"),
      );
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lili/ }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: /combine and delete lili/i }),
      );

      expect(
        await within(screen.getByRole("dialog")).findByText(
          "The survivor must be a PC entity to inherit the duplicate's character link",
        ),
      ).toBeInTheDocument();
    });

    it("renders the survivor-already-fronts-an-item 409 inline (#1942 round 2)", async () => {
      vi.mocked(client.combineEntities).mockRejectedValue(
        new Error(
          "The survivor already fronts a campaign item — combining would risk the character link being deleted along with it",
        ),
      );
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lili/ }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: /combine and delete lili/i }),
      );

      expect(
        await within(screen.getByRole("dialog")).findByText(
          "The survivor already fronts a campaign item — combining would risk the character link being deleted along with it",
        ),
      ).toBeInTheDocument();
    });

    it("warns that mentions render redacted when a REVEALED duplicate combines into a HIDDEN survivor", async () => {
      const revealedDuplicate: CampaignEntity = { ...DUPLICATE, visibility: "REVEALED" };
      const hiddenSurvivor: CampaignEntity = { ...SURVIVOR, visibility: "HIDDEN" };
      vi.mocked(client.fetchEntities).mockResolvedValue([revealedDuplicate, hiddenSurvivor]);
      vi.mocked(useCampaignEntities).mockReturnValue({
        entities: [revealedDuplicate, hiddenSurvivor],
        byId: new Map([
          [revealedDuplicate.id, revealedDuplicate],
          [hiddenSurvivor.id, hiddenSurvivor],
        ]),
      });
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lili/ }));

      expect(
        within(screen.getByRole("dialog")).getByText(/render as redacted "Hidden" chips/i),
      ).toBeInTheDocument();
    });

    it("omits the redacted-mention warning when the survivor is already REVEALED", async () => {
      const revealedDuplicate: CampaignEntity = { ...DUPLICATE, visibility: "REVEALED" };
      vi.mocked(client.fetchEntities).mockResolvedValue([revealedDuplicate, SURVIVOR]);
      vi.mocked(useCampaignEntities).mockReturnValue({
        entities: [revealedDuplicate, SURVIVOR],
        byId: new Map([
          [revealedDuplicate.id, revealedDuplicate],
          [SURVIVOR.id, SURVIVOR],
        ]),
      });
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lili/ }));

      expect(screen.queryByText(/render as redacted/i)).not.toBeInTheDocument();
    });

    it("warns that the survivor inherits the duplicate's campaign item when both are ITEM-typed", async () => {
      const itemDuplicate: CampaignEntity = { ...DUPLICATE, type: "ITEM" };
      const itemSurvivor: CampaignEntity = { ...SURVIVOR, type: "ITEM" };
      vi.mocked(client.fetchEntities).mockResolvedValue([itemDuplicate, itemSurvivor]);
      vi.mocked(useCampaignEntities).mockReturnValue({
        entities: [itemDuplicate, itemSurvivor],
        byId: new Map([
          [itemDuplicate.id, itemDuplicate],
          [itemSurvivor.id, itemSurvivor],
        ]),
      });
      vi.mocked(client.fetchCampaignItemByEntity).mockResolvedValue({
        id: "item-1",
        campaignId: CAMPAIGN_ID,
        name: "Ring of lili",
        category: "gear",
        requiresAttunement: false,
        isUnique: true,
        createdAt: "",
        updatedAt: "",
      });
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lili/ }));

      expect(
        await within(screen.getByRole("dialog")).findByText(/becomes lili's campaign item entry/i),
      ).toBeInTheDocument();
    });

    it("omits the item-link warning when the duplicate doesn't front a campaign item", async () => {
      const itemDuplicate: CampaignEntity = { ...DUPLICATE, type: "ITEM" };
      const itemSurvivor: CampaignEntity = { ...SURVIVOR, type: "ITEM" };
      vi.mocked(client.fetchEntities).mockResolvedValue([itemDuplicate, itemSurvivor]);
      vi.mocked(useCampaignEntities).mockReturnValue({
        entities: [itemDuplicate, itemSurvivor],
        byId: new Map([
          [itemDuplicate.id, itemDuplicate],
          [itemSurvivor.id, itemSurvivor],
        ]),
      });
      // beforeEach's default fetchCampaignItemByEntity rejection stands: no item.
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lili/ }));
      await screen.findByRole("heading", { name: "Combine into Lili" });

      expect(screen.queryByText(/campaign item entry/i)).not.toBeInTheDocument();
    });

    it("omits the item-link warning when the survivor already fronts its own item — the combine 409s instead (#1942 itemId)", async () => {
      const itemDuplicate: CampaignEntity = { ...DUPLICATE, type: "ITEM" };
      const linkedSurvivor: CampaignEntity = { ...SURVIVOR, type: "ITEM", itemId: "item-9" };
      vi.mocked(client.fetchEntities).mockResolvedValue([itemDuplicate, linkedSurvivor]);
      vi.mocked(useCampaignEntities).mockReturnValue({
        entities: [itemDuplicate, linkedSurvivor],
        byId: new Map([
          [itemDuplicate.id, itemDuplicate],
          [linkedSurvivor.id, linkedSurvivor],
        ]),
      });
      vi.mocked(client.fetchCampaignItemByEntity).mockResolvedValue({
        id: "item-1",
        campaignId: CAMPAIGN_ID,
        name: "Ring of lili",
        category: "gear",
        requiresAttunement: false,
        isUnique: true,
        createdAt: "",
        updatedAt: "",
      });
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lili/ }));
      await screen.findByRole("heading", { name: "Combine into Lili" });

      expect(screen.queryByText(/campaign item entry/i)).not.toBeInTheDocument();
    });

    it("badges an item-linked entity in the survivor picker", async () => {
      const linkedSurvivor: CampaignEntity = { ...SURVIVOR, itemId: "item-9" };
      vi.mocked(client.fetchEntities).mockResolvedValue([DUPLICATE, linkedSurvivor]);
      vi.mocked(useCampaignEntities).mockReturnValue({
        entities: [DUPLICATE, linkedSurvivor],
        byId: new Map([
          [DUPLICATE.id, DUPLICATE],
          [linkedSurvivor.id, linkedSurvivor],
        ]),
      });
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /combine into/i }));

      expect(
        within(screen.getByRole("dialog")).getByText(/Fronts an item/i),
      ).toBeInTheDocument();
    });

    it("resets stale item state on navigation — a false item-transfer warning doesn't survive ITEM-A → ITEM-B (#1943 staleness fix)", async () => {
      const itemA: CampaignEntity = { ...DUPLICATE, id: "item-a", name: "Wand A", type: "ITEM" };
      const itemB: CampaignEntity = { ...DUPLICATE, id: "item-b", name: "Wand B", type: "ITEM" };
      const itemC: CampaignEntity = { ...SURVIVOR, id: "item-c", name: "Wand C", type: "ITEM" };
      vi.mocked(client.fetchEntities).mockResolvedValue([itemA, itemB, itemC]);
      vi.mocked(useCampaignEntities).mockReturnValue({
        entities: [itemA, itemB, itemC],
        byId: new Map([
          [itemA.id, itemA],
          [itemB.id, itemB],
          [itemC.id, itemC],
        ]),
      });
      // item-b's own fetch is deliberately left pending for the whole test —
      // if `item` isn't reset synchronously on navigation, its stale value
      // from item-a (which DOES front one) would still read non-null when the
      // combine dialog opens for item-b.
      let resolveBFetch: (() => void) | undefined;
      vi.mocked(client.fetchCampaignItemByEntity).mockImplementation((_campaignId, entityId) => {
        if (entityId === "item-a") {
          return Promise.resolve({
            id: "item-1",
            campaignId: CAMPAIGN_ID,
            name: "Ring of A",
            category: "gear",
            requiresAttunement: false,
            isUnique: true,
            createdAt: "",
            updatedAt: "",
          });
        }
        if (entityId === "item-b") {
          return new Promise((resolve) => {
            resolveBFetch = () => resolve({
              id: "item-2",
              campaignId: CAMPAIGN_ID,
              name: "Ring of B",
              category: "gear",
              requiresAttunement: false,
              isUnique: true,
              createdAt: "",
              updatedAt: "",
            });
          });
        }
        return Promise.reject(new Error("no item"));
      });

      const user = userEvent.setup();
      renderPage({ pathname: `/campaigns/${CAMPAIGN_ID}/entities/item-a` });
      await waitFor(() =>
        expect(vi.mocked(client.fetchCampaignItemByEntity)).toHaveBeenCalledWith(CAMPAIGN_ID, "item-a"),
      );
      // CampaignItemCard's own heading ("Item") only renders once detail.item
      // resolves non-null — the item's name doesn't appear on the card itself.
      await screen.findByRole("heading", { name: "Item" });

      const rail = await screen.findByRole("navigation", { name: /codex entries/i });
      await user.click(within(rail).getByRole("link", { name: /Wand B/ }));
      await screen.findByRole("heading", { name: "Wand B" });

      await user.click(screen.getByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Wand C/ }));

      expect(screen.queryByText(/campaign item entry/i)).not.toBeInTheDocument();
      expect(resolveBFetch).toBeDefined();
    });

    it("preserves the back-link (from) across a combine, in both the toast state and its clearing", async () => {
      vi.mocked(client.combineEntities).mockResolvedValue(SURVIVOR);
      const user = userEvent.setup();
      renderPage({
        pathname: ENTITY_PATH,
        state: { from: `/campaigns/${CAMPAIGN_ID}/manage` },
      });
      await user.click(await screen.findByRole("button", { name: /combine into/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lili/ }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: /combine and delete lili/i }),
      );

      await screen.findByRole("heading", { name: "Lili" });
      const back = await screen.findByRole("link", { name: "← Codex" });
      expect(back).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/manage`);
    });
  });
});
