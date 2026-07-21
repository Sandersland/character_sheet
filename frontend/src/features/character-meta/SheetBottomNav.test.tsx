import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import SheetBottomNav from "@/features/character-meta/SheetBottomNav";
import { getSheetTabs } from "@/features/character-meta/sheetTabs";
import type { Character } from "@/types/character";

function makeCharacter(partial: Partial<Character>): Character {
  return { id: "c1", ...partial } as unknown as Character;
}

const caster = makeCharacter({ spellcasting: { ability: "intelligence" } as never });
const nonCaster = makeCharacter({ spellcasting: undefined });

describe("SheetBottomNav (#928)", () => {
  it("renders one nav button per tab (6 for a caster, incl. Class #1169)", () => {
    const tabs = getSheetTabs(caster);
    render(<SheetBottomNav tabs={tabs} activeTab="overview" onTabChange={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(6);
    for (const t of tabs) expect(screen.getByRole("button", { name: t.label })).toBeInTheDocument();
  });

  it("flags the active tab with aria-current", () => {
    render(
      <SheetBottomNav tabs={getSheetTabs(caster)} activeTab="combat" onTabChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Combat" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("calls onTabChange with the tab id when an item is clicked", () => {
    const onTabChange = vi.fn();
    render(
      <SheetBottomNav tabs={getSheetTabs(caster)} activeTab="overview" onTabChange={onTabChange} />,
    );
    screen.getByRole("button", { name: "Magic" }).click();
    expect(onTabChange).toHaveBeenCalledWith("magic");
  });

  it("renders 5 items for a non-caster (Magic hidden, Class still present)", () => {
    const tabs = getSheetTabs(nonCaster);
    render(<SheetBottomNav tabs={tabs} activeTab="overview" onTabChange={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: "Magic" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Class" })).toBeInTheDocument();
  });

  // #961: the Combat tab gains a "session live" pip while a session is live.
  it("marks the Combat tab with a live pip only when livePipTab is set", () => {
    const tabs = getSheetTabs(nonCaster);
    const { rerender } = render(
      <SheetBottomNav tabs={tabs} activeTab="overview" onTabChange={() => {}} livePipTab={null} />,
    );
    expect(screen.queryByText(/session live/i)).not.toBeInTheDocument();

    rerender(
      <SheetBottomNav tabs={tabs} activeTab="overview" onTabChange={() => {}} livePipTab="combat" />,
    );
    expect(screen.getByRole("button", { name: /combat/i })).toHaveTextContent(/session live/i);
  });
});
