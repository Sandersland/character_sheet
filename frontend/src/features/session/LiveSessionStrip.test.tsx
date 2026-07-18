import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import LiveSessionStrip from "@/features/session/LiveSessionStrip";
import SheetBottomNav from "@/features/character-meta/SheetBottomNav";
import type { SheetTab } from "@/features/character-meta/sheetTabs";

describe("LiveSessionStrip (#961)", () => {
  it("shows the title + round and jumps to combat on tap", () => {
    const onGoToCombat = vi.fn();
    render(<LiveSessionStrip title="Night One" round={3} onGoToCombat={onGoToCombat} />);
    expect(screen.getByText(/Night One/)).toBeInTheDocument();
    expect(screen.getByText(/Round 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /go to fight/i }));
    expect(onGoToCombat).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic label and omits the round when not in combat", () => {
    render(<LiveSessionStrip title={null} round={null} onGoToCombat={vi.fn()} />);
    expect(screen.getByText(/Session live/)).toBeInTheDocument();
    expect(screen.queryByText(/Round/)).not.toBeInTheDocument();
  });
});

const TABS: SheetTab[] = [
  { id: "overview", label: "Overview" },
  { id: "combat", label: "Combat" },
  { id: "inventory", label: "Inventory" },
];

describe("SheetBottomNav live pip (#961)", () => {
  it("marks the Combat tab with a live pip only when livePipTab is set", () => {
    const { rerender } = render(
      <SheetBottomNav tabs={TABS} activeTab="overview" onTabChange={vi.fn()} livePipTab={null} />,
    );
    expect(screen.queryByText(/session live/i)).not.toBeInTheDocument();

    rerender(
      <SheetBottomNav tabs={TABS} activeTab="overview" onTabChange={vi.fn()} livePipTab="combat" />,
    );
    // The pip's accessible hint rides the Combat button.
    const combat = screen.getByRole("button", { name: /combat/i });
    expect(combat).toHaveTextContent(/session live/i);
  });
});
