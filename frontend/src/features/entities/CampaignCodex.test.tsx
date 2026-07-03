import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CampaignCodex from "@/features/entities/CampaignCodex";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import type { CampaignEntity } from "@/types/character";
import { axe } from "@/test/axe";

vi.mock("@/api/client", () => ({
  createEntity: vi.fn(),
}));

vi.mock("@/hooks/useCampaignEntities", () => ({
  useCampaignEntities: vi.fn(),
  primeCampaignEntities: vi.fn(),
}));

const CAMPAIGN_ID = "camp-1";

function entity(overrides: Partial<CampaignEntity>): CampaignEntity {
  return {
    id: "ent-x",
    campaignId: CAMPAIGN_ID,
    type: "NPC",
    name: "Unnamed",
    aliases: [],
    notes: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

const GOBLIN = entity({ id: "ent-npc", type: "NPC", name: "Goblin Chief", aliases: ["Grik"] });
const GATE = entity({ id: "ent-loc", type: "LOCATION", name: "Baldur's Gate" });
const THORDAK = entity({ id: "ent-pc", type: "PC", name: "Thordak" });
const ENTITIES = [THORDAK, GOBLIN, GATE];

function mockEntities(list: CampaignEntity[]) {
  vi.mocked(useCampaignEntities).mockReturnValue({
    entities: list,
    byId: new Map(list.map((e) => [e.id, e])),
  });
}

function renderCodex() {
  return render(
    <MemoryRouter>
      <CampaignCodex campaignId={CAMPAIGN_ID} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEntities(ENTITIES);
});

describe("CampaignCodex (#367)", () => {
  it("lists all entities sorted by name with type badges", () => {
    renderCodex();
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining("Baldur's Gate"),
      expect.stringContaining("Goblin Chief"),
      expect.stringContaining("Thordak"),
    ]);
    // Type labels also appear as filter chips — scope badge checks to the list.
    const list = screen.getByRole("list");
    expect(within(list).getByText("Location")).toBeInTheDocument();
    expect(within(list).getByText("NPC")).toBeInTheDocument();
    expect(within(list).getByText("PC")).toBeInTheDocument();
  });

  it("shows an alias hint on rows that have aliases", () => {
    renderCodex();
    expect(screen.getByText(/Grik/)).toBeInTheDocument();
  });

  it("links each row to the entity detail page", () => {
    renderCodex();
    const link = screen.getByRole("link", { name: /Goblin Chief/ });
    expect(link).toHaveAttribute("href", `/campaigns/${CAMPAIGN_ID}/entities/ent-npc`);
  });

  it("narrows by type chip", async () => {
    const user = userEvent.setup();
    renderCodex();
    await user.click(screen.getByRole("button", { name: "NPC" }));
    expect(screen.getByRole("link", { name: /Goblin Chief/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Thordak/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Baldur's Gate/ })).not.toBeInTheDocument();
  });

  it("searches by name", async () => {
    const user = userEvent.setup();
    renderCodex();
    await user.type(screen.getByRole("searchbox", { name: /search/i }), "gob");
    expect(screen.getByRole("link", { name: /Goblin Chief/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Thordak/ })).not.toBeInTheDocument();
  });

  it("searches by alias", async () => {
    const user = userEvent.setup();
    renderCodex();
    await user.type(screen.getByRole("searchbox", { name: /search/i }), "grik");
    expect(screen.getByRole("link", { name: /Goblin Chief/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Baldur's Gate/ })).not.toBeInTheDocument();
  });

  it("matches apostrophe/case-insensitively like the @-autocomplete", async () => {
    const user = userEvent.setup();
    renderCodex();
    await user.type(screen.getByRole("searchbox", { name: /search/i }), "BALDURS gate");
    expect(screen.getByRole("link", { name: /Baldur's Gate/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Goblin Chief/ })).not.toBeInTheDocument();
  });

  it("composes search with the type filter", async () => {
    const user = userEvent.setup();
    renderCodex();
    await user.click(screen.getByRole("button", { name: "Location" }));
    await user.type(screen.getByRole("searchbox", { name: /search/i }), "goblin");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("shows the empty state when the campaign has no entities", () => {
    mockEntities([]);
    renderCodex();
    expect(screen.getByText(/no entities yet/i)).toBeInTheDocument();
  });

  it("shows a distinct no-match state when search eliminates everything", async () => {
    const user = userEvent.setup();
    renderCodex();
    await user.type(screen.getByRole("searchbox", { name: /search/i }), "zzz");
    expect(screen.getByText(/no entities match/i)).toBeInTheDocument();
    expect(screen.queryByText(/no entities yet/i)).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderCodex();
    expect(await axe(container)).toHaveNoViolations();
  });
});
