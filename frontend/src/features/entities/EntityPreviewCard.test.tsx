import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import EntityPreviewCard from "@/features/entities/EntityPreviewCard";
import type { EntityPreview } from "@/features/entities/useEntityPreview";

function anchorRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    top: 100,
    left: 40,
    right: 400,
    bottom: 144,
    width: 360,
    height: 44,
    x: 40,
    y: 100,
    toJSON: () => ({}),
    ...overrides,
  } as DOMRect;
}

function preview(overrides: Partial<EntityPreview> = {}): EntityPreview {
  return {
    entity: {
      id: "ent-npc",
      name: "Goblin Chief",
      type: "NPC",
      aliases: ["Grik"],
      notes: "Leads the Cragmaw tribe.\nSworn enemy of the party.",
      visibility: "REVEALED",
    },
    anchorRect: anchorRect(),
    ...overrides,
  };
}

describe("EntityPreviewCard (#843)", () => {
  it("renders nothing when closed", () => {
    render(<EntityPreviewCard preview={null} />);
    expect(screen.queryByTestId("entity-preview-card")).not.toBeInTheDocument();
  });

  it("renders monogram, name, aliases and notes excerpt", () => {
    render(<EntityPreviewCard preview={preview()} />);
    const card = screen.getByTestId("entity-preview-card");
    expect(card).toHaveTextContent("G");
    expect(card).toHaveTextContent("Goblin Chief");
    expect(card).toHaveTextContent("Grik");
    expect(card).toHaveTextContent(/Leads the Cragmaw tribe/);
  });

  it("is a pure enhancement: hidden from AT and pointer-inert", () => {
    render(<EntityPreviewCard preview={preview()} />);
    const card = screen.getByTestId("entity-preview-card");
    expect(card).toHaveAttribute("aria-hidden", "true");
    expect(card.className).toContain("pointer-events-none");
  });

  it("shows the italic fallback when notes are empty", () => {
    const p = preview();
    p.entity = { ...p.entity, notes: null };
    render(<EntityPreviewCard preview={p} />);
    expect(screen.getByText(/no description yet/i)).toBeInTheDocument();
  });

  it("shows a Hidden lock badge for a HIDDEN entity", () => {
    const p = preview();
    p.entity = { ...p.entity, visibility: "HIDDEN" };
    render(<EntityPreviewCard preview={p} />);
    expect(screen.getByText("Hidden")).toBeInTheDocument();
  });

  it("shows a portrait thumbnail when set and the monogram when absent (#844)", () => {
    const url = "https://example.com/goblin.png";
    const p = preview();
    p.entity = { ...p.entity, portraitUrl: url };
    render(<EntityPreviewCard preview={p} />);
    const card = screen.getByTestId("entity-preview-card");
    expect(card.querySelector("img")).toHaveAttribute("src", url);

    render(<EntityPreviewCard preview={preview()} />);
    const cards = screen.getAllByTestId("entity-preview-card");
    expect(cards[1].querySelector("img")).toBeNull();
    expect(cards[1]).toHaveTextContent("G");
  });

  it("omits the lock for a revealed entity", () => {
    render(<EntityPreviewCard preview={preview()} />);
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("renders connection chips once loaded", () => {
    render(
      <EntityPreviewCard
        preview={preview({
          connections: [
            { entity: { id: "ent-loc", name: "Greenest", type: "LOCATION" }, count: 4 },
            { entity: { id: "ent-pc", name: "Thordak", type: "PC" }, count: 2 },
          ],
        })}
      />,
    );
    expect(screen.getByText("Greenest")).toBeInTheDocument();
    expect(screen.getByText("×4")).toBeInTheDocument();
    expect(screen.getByText("Thordak")).toBeInTheDocument();
  });

  it("shows mention stats in the footer with the Open hint", () => {
    render(
      <EntityPreviewCard
        preview={preview({
          stats: {
            mentionCount: 7,
            firstMentioned: null,
            lastMentioned: {
              sessionId: "s1",
              sessionTitle: "Session 3",
              sessionOrdinal: 3,
              date: "2026-07-01",
            },
            chroniclers: [],
            hasDescription: true,
          },
        })}
      />,
    );
    expect(screen.getByText("7 mentions · last in Session 3")).toBeInTheDocument();
    expect(screen.getByText("Open ↵")).toBeInTheDocument();
  });

  it("opens to the anchor's right by default", () => {
    render(<EntityPreviewCard preview={preview()} />);
    const card = screen.getByTestId("entity-preview-card");
    // jsdom viewport is 1024 wide; right(400) + gap(12) fits.
    expect(card.style.left).toBe("412px");
    expect(card.style.top).toBe("100px");
  });

  it("flips to the anchor's left when the right edge would overflow", () => {
    render(
      <EntityPreviewCard
        preview={preview({ anchorRect: anchorRect({ left: 700, right: 1000 }) })}
      />,
    );
    const card = screen.getByTestId("entity-preview-card");
    // 1000 + 12 + 304 overflows 1024, so it flips: 700 - 12 - 304.
    expect(card.style.left).toBe("384px");
  });

  it("clamps the top so the card never leaves the viewport bottom", () => {
    render(<EntityPreviewCard preview={preview({ anchorRect: anchorRect({ top: 700 }) })} />);
    const card = screen.getByTestId("entity-preview-card");
    // jsdom viewport is 768 tall; 768 - 320 - 8 = 440.
    expect(card.style.top).toBe("440px");
  });
});
