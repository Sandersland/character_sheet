import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import EntityList from "@/features/entities/EntityList";
import type { CampaignEntity } from "@/types/character";
import { axe } from "@/test/axe";

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
const SECRET = entity({ id: "ent-hid", type: "NPC", name: "Secret Cult", visibility: "HIDDEN" });
const ENTITIES = [THORDAK, GOBLIN, GATE];

function renderList(entities = ENTITIES, role?: "OWNER" | "PLAYER") {
  return render(
    <MemoryRouter>
      <EntityList campaignId={CAMPAIGN_ID} entities={entities} role={role} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // no shared state
});

describe("EntityList (#523)", () => {
  it("lists entities sorted by name with type badges linking to detail", () => {
    renderList();
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
    const list = screen.getByRole("list");
    expect(within(list).getByText("Location")).toBeInTheDocument();
  });

  it("shows an alias hint on rows that have aliases", () => {
    renderList();
    expect(screen.getByText(/Grik/)).toBeInTheDocument();
  });

  it("narrows by type chip", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "NPC" }));
    expect(screen.getByRole("link", { name: /Goblin Chief/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Thordak/ })).not.toBeInTheDocument();
  });

  it("searches by name and alias, case/apostrophe-insensitively", async () => {
    const user = userEvent.setup();
    renderList();
    const box = screen.getByRole("searchbox", { name: /search/i });
    await user.type(box, "grik");
    expect(screen.getByRole("link", { name: /Goblin Chief/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Baldur's Gate/ })).not.toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "BALDURS gate");
    expect(screen.getByRole("link", { name: /Baldur's Gate/ })).toBeInTheDocument();
  });

  it("composes search with the type filter", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Location" }));
    await user.type(screen.getByRole("searchbox", { name: /search/i }), "goblin");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("shows a no-match message when search eliminates everything", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(screen.getByRole("searchbox", { name: /search/i }), "zzz");
    expect(screen.getByText(/no entities match/i)).toBeInTheDocument();
  });

  it("shows a Hidden badge on hidden entities only for the owner", () => {
    const { unmount } = renderList([GOBLIN, SECRET], "OWNER");
    expect(within(screen.getByRole("list")).getByText(/Hidden/)).toBeInTheDocument();
    unmount();
    renderList([GOBLIN, SECRET], "PLAYER");
    expect(screen.queryByText(/Hidden/)).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderList();
    expect(await axe(container)).toHaveNoViolations();
  });
});
