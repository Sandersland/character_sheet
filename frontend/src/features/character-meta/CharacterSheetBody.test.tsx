import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import CharacterSheetBody from "@/features/character-meta/CharacterSheetBody";

vi.mock("@/features/character-meta/panels/OverviewPanel", () => ({ default: () => <div>overview-panel</div> }));
vi.mock("@/features/character-meta/panels/ClassPanel", () => ({ default: () => <div>class-panel</div> }));
vi.mock("@/features/character-meta/panels/CombatPanel", () => ({ default: () => <div>static-combat-panel</div> }));
vi.mock("@/features/character-meta/panels/InventoryPanel", () => ({ default: () => null }));
vi.mock("@/features/character-meta/panels/MagicPanel", () => ({ default: () => null }));
vi.mock("@/features/character-meta/panels/StoryPanel", () => ({ default: () => null }));

const props = { reference: null };

describe("CharacterSheetBody combat slot (#960)", () => {
  it("renders the static CombatPanel on Combat when there is no live panel", async () => {
    // CombatPanel is tab-lazied — the mock resolves on a microtask, so this needs to await it.
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
    const live = screen.getByText("live-turn-tracker");
    expect(live).toBeInTheDocument();
    expect(live.closest("[hidden]")).not.toBeNull();
    expect(screen.getByText("overview-panel")).toBeInTheDocument();
  });
});

describe("CharacterSheetBody Class tab (#1169)", () => {
  it("renders ClassPanel when activeTab is class", () => {
    render(<CharacterSheetBody {...props} activeTab="class" />);
    expect(screen.getByText("class-panel")).toBeInTheDocument();
  });
});

describe("CharacterSheetBody mobile breathing room (#1083)", () => {
  it("pads the main landmark's top on mobile (pt-4), flush at bottom", () => {
    render(<CharacterSheetBody {...props} activeTab="overview" />);
    const main = screen.getByRole("main");
    expect(main.className).toContain("pt-4");
    expect(main.className).toContain("pb-0");
  });
});
