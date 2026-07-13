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

const GOBLIN = entity({
  id: "ent-npc",
  type: "NPC",
  name: "Goblin Chief",
  aliases: ["Grik"],
  notes: "Leads the Cragmaw tribe.\nSworn enemy of the party.",
});
const GATE = entity({ id: "ent-loc", type: "LOCATION", name: "Baldur's Gate" });
const THORDAK = entity({ id: "ent-pc", type: "PC", name: "Thordak" });
const SECRET = entity({ id: "ent-hid", type: "NPC", name: "Secret Cult", visibility: "HIDDEN" });
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
      <CampaignCodex campaignId={CAMPAIGN_ID} role={role} campaignName="The Sunless Citadel" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEntities(ENTITIES);
});

describe("CampaignCodex ledger (#840)", () => {
  it("lists all entities sorted by name, linking to the detail page", () => {
    renderCodex();
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining("Baldur's Gate"),
      expect.stringContaining("Goblin Chief"),
      expect.stringContaining("Thordak"),
    ]);
    expect(screen.getByRole("link", { name: /Goblin Chief/ })).toHaveAttribute(
      "href",
      `/campaigns/${CAMPAIGN_ID}/entities/ent-npc`,
    );
  });

  it("groups rows under ordered letter dividers", () => {
    renderCodex();
    const sections = screen.getAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Entries starting with B",
      "Entries starting with G",
      "Entries starting with T",
    ]);
    expect(within(sections[1]).getByRole("link", { name: /Goblin Chief/ })).toBeInTheDocument();
  });

  it("shows a type badge on each row", () => {
    renderCodex();
    expect(
      within(screen.getByRole("link", { name: /Baldur's Gate/ })).getByText("Location"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("link", { name: /Thordak/ })).getByText("PC"),
    ).toBeInTheDocument();
  });

  it("shows monogram, italic alias and first-line snippet on a row", () => {
    renderCodex();
    const row = screen.getByRole("link", { name: /Goblin Chief/ });
    expect(within(row).getByText("G")).toBeInTheDocument();
    expect(within(row).getByText(/Grik/)).toBeInTheDocument();
    expect(within(row).getByText("Leads the Cragmaw tribe.")).toBeInTheDocument();
    expect(within(row).queryByText(/Sworn enemy/)).not.toBeInTheDocument();
  });

  it("shows the no-description fallback when notes are empty", () => {
    renderCodex();
    const row = screen.getByRole("link", { name: /Thordak/ });
    expect(within(row).getByText(/no description yet/i)).toBeInTheDocument();
  });

  it("renders an alphabet jump rail with only present letters enabled", () => {
    renderCodex();
    const rail = screen.getByRole("navigation", { name: /jump to letter/i });
    expect(within(rail).getByRole("button", { name: "B" })).toBeEnabled();
    expect(within(rail).getByRole("button", { name: "G" })).toBeEnabled();
    expect(within(rail).getByRole("button", { name: "Z" })).toBeDisabled();
  });
});

describe("CampaignCodex rail filters (#840)", () => {
  it("shows per-type counts in the filter list", () => {
    renderCodex();
    const filters = screen.getByRole("group", { name: /filter by type/i });
    expect(within(filters).getByRole("button", { name: /All entries 3/ })).toBeInTheDocument();
    expect(within(filters).getByRole("button", { name: /NPC 1/ })).toBeInTheDocument();
    expect(within(filters).getByRole("button", { name: /Location 1/ })).toBeInTheDocument();
    expect(within(filters).getByRole("button", { name: /Faction 0/ })).toBeInTheDocument();
  });

  it("narrows by type filter", async () => {
    const user = userEvent.setup();
    renderCodex();
    await user.click(screen.getByRole("button", { name: /NPC/ }));
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

  it("flags a row that only matched in its description", async () => {
    const user = userEvent.setup();
    renderCodex();
    await user.type(screen.getByRole("searchbox", { name: /search/i }), "cragmaw");
    const row = screen.getByRole("link", { name: /Goblin Chief/ });
    expect(within(row).getByText(/matched in description/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Thordak/ })).not.toBeInTheDocument();
  });

  it("keeps a name/alias hit unflagged even when notes also match", async () => {
    const user = userEvent.setup();
    renderCodex();
    await user.type(screen.getByRole("searchbox", { name: /search/i }), "grik");
    expect(screen.queryByText(/matched in description/i)).not.toBeInTheDocument();
  });

  it("composes search with the type filter", async () => {
    const user = userEvent.setup();
    renderCodex();
    await user.click(screen.getByRole("button", { name: /Location/ }));
    await user.type(screen.getByRole("searchbox", { name: /search/i }), "goblin");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("offers A→Z sort and disables mention sorts until stats land", () => {
    renderCodex();
    const sortSelect = screen.getByLabelText("Sort");
    expect(sortSelect).toHaveValue("alpha");
    expect(screen.getByRole("option", { name: "A → Z" })).toBeEnabled();
    expect(screen.getByRole("option", { name: "Recently mentioned" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Most mentioned" })).toBeDisabled();
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

describe("CampaignCodex hidden entities (#523)", () => {
  it("shows a Hidden lock badge to the owner only", () => {
    mockEntities([GOBLIN, SECRET]);
    renderCodex("OWNER");
    const row = screen.getByRole("link", { name: /Secret Cult/ });
    expect(within(row).getByText(/Hidden/)).toBeInTheDocument();
    expect(row.className).toContain("opacity-60");
  });

  it("never marks rows Hidden for a player", () => {
    mockEntities([GOBLIN, SECRET]);
    renderCodex("PLAYER");
    expect(screen.queryByText(/Hidden/)).not.toBeInTheDocument();
  });
});

describe("CampaignCodex create flow (#367)", () => {
  it("creates an entity and primes the shared cache", async () => {
    const user = userEvent.setup();
    const created = entity({ id: "ent-new", type: "NPC", name: "Sildar Hallwinter" });
    vi.mocked(client.createEntity).mockResolvedValue(created);
    renderCodex();

    await user.click(screen.getByRole("button", { name: /new entry/i }));
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

    await user.click(screen.getByRole("button", { name: /new entry/i }));
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
    await user.click(screen.getByRole("button", { name: /new entry/i }));
    expect(screen.getByRole("button", { name: /create entity/i })).toBeDisabled();
  });

  it("shows an in-panel error when the create fails", async () => {
    const user = userEvent.setup();
    vi.mocked(client.createEntity).mockRejectedValue(new Error("Entity already exists"));
    renderCodex();

    await user.click(screen.getByRole("button", { name: /new entry/i }));
    await user.type(screen.getByLabelText(/name/i), "Sildar");
    await user.click(screen.getByRole("button", { name: /create entity/i }));

    expect(await screen.findByText("Entity already exists")).toBeInTheDocument();
    expect(vi.mocked(primeCampaignEntities)).not.toHaveBeenCalled();
  });

  it("closes the create panel on Escape and returns focus to the toggle", async () => {
    const user = userEvent.setup();
    renderCodex();

    const toggle = screen.getByRole("button", { name: /new entry/i });
    await user.click(toggle);
    await user.type(screen.getByLabelText(/name/i), "Sildar");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: /create entity/i })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(toggle);
  });

  it("returns focus to the toggle when the panel is cancelled", async () => {
    const user = userEvent.setup();
    renderCodex();

    const toggle = screen.getByRole("button", { name: /new entry/i });
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(document.activeElement).toBe(toggle);
  });

  it("offers the create toggle and an empty-state CTA when the campaign has no entities", async () => {
    const user = userEvent.setup();
    mockEntities([]);
    renderCodex();
    expect(screen.getByRole("button", { name: /new entry/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /create your first entry/i }));
    expect(screen.getByRole("button", { name: /create entity/i })).toBeInTheDocument();
  });
});

describe("CampaignCodex owner start-hidden (#523)", () => {
  it("creates a hidden entity when the owner checks 'Start hidden'", async () => {
    const user = userEvent.setup();
    vi.mocked(client.createEntity).mockResolvedValue(
      entity({ id: "ent-new", name: "Big Bad", visibility: "HIDDEN" }),
    );
    renderCodex("OWNER");

    await user.click(screen.getByRole("button", { name: /new entry/i }));
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

    await user.click(screen.getByRole("button", { name: /new entry/i }));
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
    await user.click(screen.getByRole("button", { name: /new entry/i }));
    expect(screen.queryByLabelText(/start hidden/i)).not.toBeInTheDocument();
  });
});
