import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import CodexActivityRail from "@/features/entities/CodexActivityRail";
import type { CampaignEntity, CodexActivityItem, EntityStats } from "@/types/character";
import { axe } from "@/test/axe";

const CAMPAIGN_ID = "camp-1";

function stats(partial: Partial<EntityStats>): EntityStats {
  return {
    mentionCount: 0,
    firstMentioned: null,
    lastMentioned: null,
    chroniclers: [],
    hasDescription: false,
    ...partial,
  };
}

function entity(
  partial: Partial<CampaignEntity> & { id: string; name: string; stats: EntityStats },
): CampaignEntity {
  return {
    campaignId: CAMPAIGN_ID,
    type: "NPC",
    aliases: [],
    notes: null,
    visibility: "REVEALED",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

const LEOSIN = entity({
  id: "ent-leosin",
  name: "Leosin Erlanthar",
  stats: stats({ mentionCount: 7 }),
});
const MASK = entity({
  id: "ent-mask",
  type: "ITEM",
  name: "Blue Dragon Mask",
  stats: stats({ mentionCount: 3, hasDescription: true }),
});
const KEEP = entity({
  id: "ent-keep",
  type: "LOCATION",
  name: "Greenest Keep",
  stats: stats({ mentionCount: 1 }),
});

const MENTION: CodexActivityItem = {
  kind: "mention",
  characterName: "Nora",
  entity: { id: "ent-leosin", name: "Leosin Erlanthar", type: "NPC" },
  sessionOrdinal: 12,
  date: "2026-07-10T00:00:00.000Z",
};
const MENTION_NO_SESSION: CodexActivityItem = {
  kind: "mention",
  characterName: "Joseph",
  entity: { id: "ent-keep", name: "Greenest Keep", type: "LOCATION" },
  sessionOrdinal: null,
  date: "2026-07-09T00:00:00.000Z",
};
const CREATED: CodexActivityItem = {
  kind: "created",
  entity: { id: "ent-mask", name: "Blue Dragon Mask", type: "ITEM" },
  date: "2026-07-08T00:00:00.000Z",
};

function renderRail(over?: { statsEntities?: CampaignEntity[]; activity?: CodexActivityItem[] }) {
  return render(
    <MemoryRouter>
      <CodexActivityRail
        campaignId={CAMPAIGN_ID}
        statsEntities={over?.statsEntities ?? [LEOSIN, MASK, KEEP]}
        activity={over?.activity ?? [MENTION, MENTION_NO_SESSION, CREATED]}
      />
    </MemoryRouter>,
  );
}

function card(name: RegExp) {
  return screen.getByRole("heading", { name }).closest("section")!;
}

describe("CodexActivityRail — Recently chronicled (#841)", () => {
  it("phrases a mention with chronicler, chip and session ordinal", () => {
    renderRail();
    const timeline = card(/recently chronicled/i);
    expect(within(timeline).getByText("Nora")).toBeInTheDocument();
    expect(within(timeline).getByText(/in a Session 12 note/)).toBeInTheDocument();
    expect(within(timeline).getByRole("link", { name: "@Leosin Erlanthar" })).toHaveAttribute(
      "href",
      `/campaigns/${CAMPAIGN_ID}/entities/ent-leosin`,
    );
  });

  it("says just 'in a note' when the mention has no session", () => {
    renderRail();
    const item = within(card(/recently chronicled/i)).getByText(/in a note\b/);
    expect(item.textContent).not.toContain("Session");
  });

  it("phrases a created item passively with a chip link", () => {
    renderRail();
    const timeline = card(/recently chronicled/i);
    expect(within(timeline).getByText(/was added to the codex/)).toBeInTheDocument();
    expect(within(timeline).getByRole("link", { name: "@Blue Dragon Mask" })).toHaveAttribute(
      "href",
      `/campaigns/${CAMPAIGN_ID}/entities/ent-mask`,
    );
  });

  it("renders relative timestamps with the absolute date as title", () => {
    renderRail();
    const times = card(/recently chronicled/i).querySelectorAll("time");
    expect(times).toHaveLength(3);
    expect(times[0].getAttribute("datetime")).toBe("2026-07-10T00:00:00.000Z");
    expect(times[0].getAttribute("title")).toBe("Jul 10, 2026");
  });

  it("shows an inviting line instead of an empty card when there is no activity", () => {
    renderRail({ activity: [] });
    expect(
      within(card(/recently chronicled/i)).getByText(/@-mention/i),
    ).toBeInTheDocument();
  });
});

describe("CodexActivityRail — Needs chronicling (#841)", () => {
  it("lists exactly the mentioned, descriptionless entities with an ?edit=1 CTA", () => {
    renderRail();
    const gold = card(/needs chronicling/i);
    expect(within(gold).getByText(/2 entries/)).toBeInTheDocument();
    expect(within(gold).getByRole("link", { name: "@Leosin Erlanthar" })).toBeInTheDocument();
    expect(within(gold).getByRole("link", { name: "@Greenest Keep" })).toBeInTheDocument();
    expect(within(gold).queryByRole("link", { name: "@Blue Dragon Mask" })).not.toBeInTheDocument();
    expect(within(gold).getByRole("link", { name: /add what you know/i })).toHaveAttribute(
      "href",
      `/campaigns/${CAMPAIGN_ID}/entities/ent-leosin?edit=1`,
    );
  });

  it("caps the chip list at six entities", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      entity({ id: `ent-${i}`, name: `Entity ${i}`, stats: stats({ mentionCount: 8 - i }) }),
    );
    renderRail({ statsEntities: many });
    const gold = card(/needs chronicling/i);
    expect(within(gold).getByText(/8 entries/)).toBeInTheDocument();
    expect(within(gold).getAllByRole("link", { name: /^@Entity/ })).toHaveLength(6);
  });

  it("disappears entirely when every mentioned entity has a description", () => {
    renderRail({ statsEntities: [MASK] });
    expect(screen.queryByRole("heading", { name: /needs chronicling/i })).not.toBeInTheDocument();
  });
});

describe("CodexActivityRail — Most mentioned (#841)", () => {
  it("ranks the top three by mention count with ×N counts", () => {
    renderRail();
    const board = card(/most mentioned/i);
    const rows = within(board).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Leosin Erlanthar"),
      expect.stringContaining("Blue Dragon Mask"),
      expect.stringContaining("Greenest Keep"),
    ]);
    expect(rows[0].textContent).toContain("×7");
    expect(within(rows[2]).getByRole("link", { name: "@Greenest Keep" })).toHaveAttribute(
      "href",
      `/campaigns/${CAMPAIGN_ID}/entities/ent-keep`,
    );
  });

  it("hides the card when nothing has been mentioned", () => {
    renderRail({
      statsEntities: [entity({ id: "e1", name: "Quiet", stats: stats({ mentionCount: 0 }) })],
    });
    expect(screen.queryByRole("heading", { name: /most mentioned/i })).not.toBeInTheDocument();
  });
});

describe("CodexActivityRail — a11y", () => {
  it("has no axe violations", async () => {
    const { container } = renderRail();
    expect(await axe(container)).toHaveNoViolations();
  });
});
