import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MentionText from "@/features/journal/MentionText";
import { __resetEntityPreviewCacheForTests } from "@/features/entities/entityPreviewData";
import * as client from "@/api/client";
import type { CampaignEntity } from "@/types/character";
import { axe } from "@/test/axe";

vi.mock("@/api/client", () => ({
  fetchEntities: vi.fn(),
  fetchEntityConnections: vi.fn(),
}));

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

type MentionEntity = Pick<CampaignEntity, "name" | "type" | "aliases" | "notes" | "visibility">;

function chief(overrides: Partial<MentionEntity> = {}): MentionEntity {
  return {
    name: "Goblin Chief",
    type: "NPC",
    aliases: [],
    notes: "Leads the Cragmaw tribe.",
    visibility: "REVEALED",
    ...overrides,
  };
}

function map(entries: [string, MentionEntity][] = [[A, chief()]]): Map<string, MentionEntity> {
  return new Map(entries);
}

function renderText(body: string, entities = map(), campaignId: string | null = "camp-1") {
  return render(
    <MemoryRouter>
      <MentionText body={body} entities={entities} campaignId={campaignId} />
    </MemoryRouter>,
  );
}

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

beforeEach(() => {
  vi.clearAllMocks();
  __resetEntityPreviewCacheForTests();
  stubPointer(true);
  vi.mocked(client.fetchEntities).mockResolvedValue([]);
  vi.mocked(client.fetchEntityConnections).mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MentionText (#248)", () => {
  it("renders a known id as a chip linking to the entity", () => {
    renderText(`Met @[${A}] today`);
    const link = screen.getByRole("link", { name: /Goblin Chief/ });
    expect(link).toHaveAttribute("href", `/campaigns/camp-1/entities/${A}`);
  });

  it("renders an unresolved (hidden/deleted) id as a redacted chip, never the raw token", () => {
    renderText(`Saw @[${B}]`, map([]));
    expect(screen.queryByText(`@[${B}]`, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Hidden entity")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders mixed text and chips", () => {
    renderText(`Before @[${A}] after`);
    expect(screen.getByText(/Before/)).toBeInTheDocument();
    expect(screen.getByText(/after/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Goblin Chief/ })).toBeInTheDocument();
  });

  it("reflects a rename (name resolved from the map at render)", () => {
    const { rerender } = renderText(`@[${A}]`);
    expect(screen.getByText(/Goblin Chief/)).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <MentionText
          body={`@[${A}]`}
          entities={map([[A, chief({ name: "Goblin Warlord" })]])}
          campaignId="camp-1"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Goblin Warlord/)).toBeInTheDocument();
    expect(screen.queryByText(/Goblin Chief/)).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderText(`Met @[${A}] at the gate`);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("MentionText inked-name styling (#862)", () => {
  const INK: [CampaignEntity["type"], string][] = [
    ["NPC", "text-garnet-800"],
    ["PC", "text-garnet-800"],
    ["LOCATION", "text-vitality-800"],
    ["ITEM", "text-gold-800"],
    ["FACTION", "text-arcane-800"],
    ["OTHER", "text-parchment-800"],
  ];

  it.each(INK)("renders a %s mention as inked small-caps in %s with a dotted underline", (type, inkClass) => {
    renderText(`@[${A}]`, map([[A, chief({ type })]]));
    const link = screen.getByRole("link", { name: /Goblin Chief/ });
    expect(link).toHaveClass(inkClass);
    expect(link.className).toContain("[font-variant-caps:small-caps]");
    expect(link).toHaveClass("font-semibold", "border-b", "border-dotted");
    // No pill: never a rounded background chip.
    expect(link.className).not.toMatch(/\brounded-full\b/);
    expect(link.className).not.toMatch(/\bbg-/);
  });

  it("inks the no-campaignId (inert) mention with the same recipe, still no link", () => {
    renderText(`@[${A}]`, map([[A, chief({ type: "ITEM" })]]), null);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    const ink = screen.getByText(/Goblin Chief/);
    expect(ink).toHaveClass("text-gold-800", "border-dotted", "font-semibold");
    expect(ink.className).not.toMatch(/\bbg-/);
  });

  it("renders the redacted (hidden) fallback without a pill background", () => {
    renderText(`Saw @[${B}]`, map([]));
    const hidden = screen.getByLabelText("Hidden entity");
    expect(hidden.className).not.toMatch(/\brounded-full\b/);
    expect(hidden.className).not.toMatch(/\bbg-/);
  });
});

describe("MentionText hover preview (#843)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function hover(el: Element, ms = 300) {
    fireEvent.pointerOver(el);
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  }

  it("renders without fetching anything (data is hover-lazy)", () => {
    renderText(`Met @[${A}] today`);
    expect(vi.mocked(client.fetchEntities)).not.toHaveBeenCalled();
    expect(vi.mocked(client.fetchEntityConnections)).not.toHaveBeenCalled();
  });

  it("shows the preview card after the hover intent delay", async () => {
    renderText(`Met @[${A}] today`);
    await hover(screen.getByRole("link", { name: /Goblin Chief/ }));
    const card = screen.getByTestId("entity-preview-card");
    expect(card).toHaveTextContent("Goblin Chief");
    expect(card).toHaveTextContent(/Leads the Cragmaw tribe/);
  });

  it("fetches stats and connections once across re-hovers (shared cache)", async () => {
    renderText(`Met @[${A}] today`);
    const chip = screen.getByRole("link", { name: /Goblin Chief/ });
    await hover(chip);
    fireEvent.pointerOut(chip);
    await hover(chip);

    expect(vi.mocked(client.fetchEntities)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.fetchEntityConnections)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.fetchEntityConnections)).toHaveBeenCalledWith("camp-1", A, {
      limit: 3,
    });
  });

  it("gives a redacted chip no link and no preview", async () => {
    renderText(`Saw @[${B}]`, map([]));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await hover(screen.getByLabelText("Hidden entity"));
    expect(screen.queryByTestId("entity-preview-card")).not.toBeInTheDocument();
    expect(vi.mocked(client.fetchEntities)).not.toHaveBeenCalled();
  });

  it("keeps a no-campaignId chip inert: no link, no preview", async () => {
    renderText(`Met @[${A}]`, map(), null);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await hover(screen.getByText(/Goblin Chief/));
    expect(screen.queryByTestId("entity-preview-card")).not.toBeInTheDocument();
    expect(vi.mocked(client.fetchEntities)).not.toHaveBeenCalled();
  });

  it("does nothing on a coarse pointer while keeping the chip's link for tap nav", async () => {
    stubPointer(false);
    renderText(`Met @[${A}] today`);
    const chip = screen.getByRole("link", { name: /Goblin Chief/ });
    await hover(chip, 1000);
    expect(screen.queryByTestId("entity-preview-card")).not.toBeInTheDocument();
    expect(chip).toHaveAttribute("href", `/campaigns/camp-1/entities/${A}`);
  });
});
