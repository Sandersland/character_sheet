import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import CodexLedger from "@/features/entities/CodexLedger";
import { __resetEntityPreviewCacheForTests } from "@/features/entities/entityPreviewData";
import * as client from "@/api/client";
import { groupByInitial } from "@/lib/codexLedger";
import type { CampaignEntity, CampaignRole, EntityConnection } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchEntities: vi.fn(),
  fetchEntityConnections: vi.fn(),
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
  name: "Goblin Chief",
  aliases: ["Grik"],
  notes: "Leads the Cragmaw tribe.",
});
const GATE = entity({ id: "ent-loc", type: "LOCATION", name: "Baldur's Gate" });

const CONNECTIONS: EntityConnection[] = [
  { entity: { id: "ent-loc", name: "Baldur's Gate", type: "LOCATION" }, count: 3 },
];

function stubPointer(fine: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: fine,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const OWNER: CampaignRole = "OWNER";

function renderLedger(entities: CampaignEntity[] = [GOBLIN, GATE]) {
  return render(
    <MemoryRouter>
      <CodexLedger
        campaignId={CAMPAIGN_ID}
        groups={groupByInitial(entities)}
        matchedInNotesIds={new Set()}
        role={OWNER}
        sort="alpha"
      />
    </MemoryRouter>,
  );
}

async function hover(el: Element, ms = 300) {
  fireEvent.pointerOver(el);
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  __resetEntityPreviewCacheForTests();
  stubPointer(true);
  vi.mocked(client.fetchEntities).mockResolvedValue([
    {
      ...GOBLIN,
      stats: {
        mentionCount: 7,
        firstMentioned: null,
        lastMentioned: { sessionId: "s3", sessionTitle: null, sessionOrdinal: 3, date: "" },
        chroniclers: [],
        hasDescription: true,
      },
    },
  ]);
  vi.mocked(client.fetchEntityConnections).mockResolvedValue(CONNECTIONS);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("CodexLedger hover preview (#843)", () => {
  it("shows the preview card after the 300ms hover intent delay", async () => {
    renderLedger();
    const row = screen.getByRole("link", { name: /Goblin Chief/ });
    await hover(row);

    const card = screen.getByTestId("entity-preview-card");
    expect(card).toHaveTextContent("Goblin Chief");
    expect(card).toHaveTextContent(/Leads the Cragmaw tribe/);
    expect(card).toHaveTextContent("7 mentions · last in Session 3");
    expect(card).toHaveTextContent("Baldur's Gate");
  });

  it("shows nothing when the pointer leaves before the delay elapses", async () => {
    renderLedger();
    const row = screen.getByRole("link", { name: /Goblin Chief/ });
    fireEvent.pointerOver(row);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerOut(row);
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByTestId("entity-preview-card")).not.toBeInTheDocument();
    expect(vi.mocked(client.fetchEntityConnections)).not.toHaveBeenCalled();
  });

  it("closes on pointer leave", async () => {
    renderLedger();
    const row = screen.getByRole("link", { name: /Goblin Chief/ });
    await hover(row);
    expect(screen.getByTestId("entity-preview-card")).toBeInTheDocument();
    fireEvent.pointerOut(row);
    expect(screen.queryByTestId("entity-preview-card")).not.toBeInTheDocument();
  });

  it("fetches stats and connections once across re-hovers (cached)", async () => {
    renderLedger();
    const row = screen.getByRole("link", { name: /Goblin Chief/ });
    await hover(row);
    fireEvent.pointerOut(row);
    await hover(row);

    expect(vi.mocked(client.fetchEntities)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.fetchEntities)).toHaveBeenCalledWith(CAMPAIGN_ID, {
      includeStats: true,
    });
    expect(vi.mocked(client.fetchEntityConnections)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.fetchEntityConnections)).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      "ent-npc",
      { limit: 3 },
    );
  });

  it("dismisses on Escape", async () => {
    renderLedger();
    await hover(screen.getByRole("link", { name: /Goblin Chief/ }));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByTestId("entity-preview-card")).not.toBeInTheDocument();
  });

  it("dismisses on scroll", async () => {
    renderLedger();
    await hover(screen.getByRole("link", { name: /Goblin Chief/ }));
    fireEvent.scroll(window);
    expect(screen.queryByTestId("entity-preview-card")).not.toBeInTheDocument();
  });

  it("never opens on a coarse pointer (touch)", async () => {
    stubPointer(false);
    renderLedger();
    await hover(screen.getByRole("link", { name: /Goblin Chief/ }), 1000);
    expect(screen.queryByTestId("entity-preview-card")).not.toBeInTheDocument();
    expect(vi.mocked(client.fetchEntities)).not.toHaveBeenCalled();
  });

  it("keeps the row link target unchanged", () => {
    renderLedger();
    expect(screen.getByRole("link", { name: /Goblin Chief/ })).toHaveAttribute(
      "href",
      `/campaigns/${CAMPAIGN_ID}/entities/ent-npc`,
    );
  });
});
