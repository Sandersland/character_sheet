import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CampaignCodex from "@/features/entities/CampaignCodex";
import * as client from "@/api/client";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
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
    visibility: "REVEALED",
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

function renderCodex(role?: "OWNER" | "PLAYER") {
  return render(
    <MemoryRouter>
      <CampaignCodex campaignId={CAMPAIGN_ID} role={role} />
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

describe("CampaignCodex create flow (#367)", () => {
  it("creates an entity and primes the shared cache", async () => {
    const user = userEvent.setup();
    const created = entity({ id: "ent-new", type: "NPC", name: "Sildar Hallwinter" });
    vi.mocked(client.createEntity).mockResolvedValue(created);
    renderCodex();

    await user.click(screen.getByRole("button", { name: /new entity/i }));
    await user.selectOptions(screen.getByLabelText("Type"), "NPC");
    await user.type(screen.getByLabelText(/name/i), "  Sildar Hallwinter  ");
    await user.type(screen.getByLabelText(/aliases/i), "Sil, the Knight");
    await user.type(screen.getByLabelText(/notes/i), "Rescued near Phandalin.");
    await user.click(screen.getByRole("button", { name: /create entity/i }));

    expect(vi.mocked(client.createEntity)).toHaveBeenCalledWith(CAMPAIGN_ID, {
      type: "NPC",
      name: "Sildar Hallwinter",
      aliases: ["Sil", "the Knight"],
      notes: "Rescued near Phandalin.",
    });
    expect(vi.mocked(primeCampaignEntities)).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.arrayContaining([expect.objectContaining({ id: "ent-new" })]),
    );
    // Panel collapses back to the toggle after a successful create.
    expect(screen.queryByRole("button", { name: /create entity/i })).not.toBeInTheDocument();
  });

  it("omits notes when the field is blank", async () => {
    const user = userEvent.setup();
    vi.mocked(client.createEntity).mockResolvedValue(entity({ id: "ent-new", name: "Sildar" }));
    renderCodex();

    await user.click(screen.getByRole("button", { name: /new entity/i }));
    await user.type(screen.getByLabelText(/name/i), "Sildar");
    await user.click(screen.getByRole("button", { name: /create entity/i }));

    expect(vi.mocked(client.createEntity)).toHaveBeenCalledWith(CAMPAIGN_ID, {
      type: "NPC",
      name: "Sildar",
      aliases: [],
      notes: undefined,
    });
  });

  it("disables submit while the name is blank", async () => {
    const user = userEvent.setup();
    renderCodex();
    await user.click(screen.getByRole("button", { name: /new entity/i }));
    expect(screen.getByRole("button", { name: /create entity/i })).toBeDisabled();
  });

  it("shows an in-panel error when the create fails", async () => {
    const user = userEvent.setup();
    vi.mocked(client.createEntity).mockRejectedValue(new Error("Entity already exists"));
    renderCodex();

    await user.click(screen.getByRole("button", { name: /new entity/i }));
    await user.type(screen.getByLabelText(/name/i), "Sildar");
    await user.click(screen.getByRole("button", { name: /create entity/i }));

    expect(await screen.findByText("Entity already exists")).toBeInTheDocument();
    expect(vi.mocked(primeCampaignEntities)).not.toHaveBeenCalled();
  });

  it("closes the create panel on Escape and returns focus to the toggle", async () => {
    const user = userEvent.setup();
    renderCodex();

    const toggle = screen.getByRole("button", { name: /new entity/i });
    await user.click(toggle);
    await user.type(screen.getByLabelText(/name/i), "Sildar");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: /create entity/i })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(toggle);
  });

  it("returns focus to the toggle when the panel is cancelled", async () => {
    const user = userEvent.setup();
    renderCodex();

    const toggle = screen.getByRole("button", { name: /new entity/i });
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(document.activeElement).toBe(toggle);
  });

  it("offers the create toggle even when the campaign has no entities", () => {
    mockEntities([]);
    renderCodex();
    expect(screen.getByRole("button", { name: /new entity/i })).toBeInTheDocument();
  });
});

describe("CampaignCodex owner start-hidden (#523)", () => {
  it("creates a hidden entity when the owner checks 'Start hidden'", async () => {
    const user = userEvent.setup();
    vi.mocked(client.createEntity).mockResolvedValue(
      entity({ id: "ent-new", name: "Big Bad", visibility: "HIDDEN" }),
    );
    renderCodex("OWNER");

    await user.click(screen.getByRole("button", { name: /new entity/i }));
    await user.type(screen.getByLabelText(/name/i), "Big Bad");
    await user.click(screen.getByLabelText(/start hidden/i));
    await user.click(screen.getByRole("button", { name: /create entity/i }));

    expect(vi.mocked(client.createEntity)).toHaveBeenCalledWith(CAMPAIGN_ID, {
      type: "NPC",
      name: "Big Bad",
      aliases: [],
      notes: undefined,
      visibility: "HIDDEN",
    });
  });

  it("omits visibility when the owner leaves 'Start hidden' unchecked", async () => {
    const user = userEvent.setup();
    vi.mocked(client.createEntity).mockResolvedValue(entity({ id: "ent-new", name: "Barkeep" }));
    renderCodex("OWNER");

    await user.click(screen.getByRole("button", { name: /new entity/i }));
    await user.type(screen.getByLabelText(/name/i), "Barkeep");
    await user.click(screen.getByRole("button", { name: /create entity/i }));

    expect(vi.mocked(client.createEntity)).toHaveBeenCalledWith(CAMPAIGN_ID, {
      type: "NPC",
      name: "Barkeep",
      aliases: [],
      notes: undefined,
    });
  });

  it("hides the 'Start hidden' option from a player", async () => {
    const user = userEvent.setup();
    renderCodex("PLAYER");
    await user.click(screen.getByRole("button", { name: /new entity/i }));
    expect(screen.queryByLabelText(/start hidden/i)).not.toBeInTheDocument();
  });
});
