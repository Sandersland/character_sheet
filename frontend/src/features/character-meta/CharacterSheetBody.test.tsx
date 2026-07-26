import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import CharacterSheetBody from "@/features/character-meta/CharacterSheetBody";

// Stub the panels so we assert only the combat-branch routing (#960 slot logic).
vi.mock("@/features/character-meta/panels/OverviewPanel", () => ({ default: () => <div>overview-panel</div> }));
vi.mock("@/features/character-meta/panels/ClassPanel", () => ({ default: () => <div>class-panel</div> }));
vi.mock("@/features/character-meta/panels/CombatPanel", () => ({ default: () => <div>static-combat-panel</div> }));
vi.mock("@/features/character-meta/panels/InventoryPanel", () => ({ default: () => null }));
vi.mock("@/features/character-meta/panels/MagicPanel", () => ({ default: () => null }));
vi.mock("@/features/character-meta/panels/StoryPanel", () => ({ default: () => null }));

const props = { reference: null };

describe("CharacterSheetBody combat slot (#960)", () => {
  it("renders the static CombatPanel on Combat when there is no live panel", async () => {
    // CombatPanel is tab-lazied (#1279) — the mock still resolves, just on
    // a microtask, so this assertion needs to await it.
    render(<CharacterSheetBody {...props} activeTab="combat" />);
    expect(await screen.findByText("static-combat-panel")).toBeInTheDocument();
  });

  it("suppresses the static panel while the live session is still loading (no flash)", () => {
    render(<CharacterSheetBody {...props} activeTab="combat" sessionLoading />);
    expect(screen.queryByText("static-combat-panel")).not.toBeInTheDocument();
  });

  it("the live panel supersedes the static panel on Combat", () => {
    render(
      <CharacterSheetBody {...props} activeTab="combat" livePanel={<div>live-turn-tracker</div>} />,
    );
    expect(screen.getByText("live-turn-tracker")).toBeVisible();
    expect(screen.queryByText("static-combat-panel")).not.toBeInTheDocument();
  });

  it("keeps the live panel mounted-but-hidden on other tabs (survives a swipe)", () => {
    render(
      <CharacterSheetBody {...props} activeTab="overview" livePanel={<div>live-turn-tracker</div>} />,
    );
    // Still in the DOM (state survives), but hidden.
    const live = screen.getByText("live-turn-tracker");
    expect(live).toBeInTheDocument();
    expect(live.closest("[hidden]")).not.toBeNull();
    expect(screen.getByText("overview-panel")).toBeInTheDocument();
  });
});

// #1169: the Class tab routes to its own panel.
describe("CharacterSheetBody Class tab (#1169)", () => {
  it("renders ClassPanel when activeTab is class", () => {
    render(<CharacterSheetBody {...props} activeTab="class" />);
    expect(screen.getByText("class-panel")).toBeInTheDocument();
  });
});

// #1083: +16px mobile breathing room under the collapsed-flush header.
describe("CharacterSheetBody mobile breathing room (#1083)", () => {
  it("pads the main landmark's top on mobile (pt-4), flush at bottom", () => {
    render(<CharacterSheetBody {...props} activeTab="overview" />);
    const main = screen.getByRole("main");
    expect(main.className).toContain("pt-4");
    expect(main.className).toContain("pb-0");
  });
});
