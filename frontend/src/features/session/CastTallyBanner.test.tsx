import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CastTallyBanner from "@/features/session/CastTallyBanner";
import type { CastTallyRow } from "@/features/session/useTurnState";

describe("CastTallyBanner", () => {
  it("renders nothing when there are no cast rows", () => {
    const { container } = render(<CastTallyBanner rows={[]} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each settled cast with its spell/level/total/announce line", () => {
    const rows: CastTallyRow[] = [
      { id: "1", spellName: "Burning Hands", level: 1, total: 14, damageType: "fire", announce: "DC 15 DEX save" },
      { id: "2", spellName: "Fire Bolt", level: 0, total: 8, damageType: "fire" },
    ];
    render(<CastTallyBanner rows={rows} onDismiss={vi.fn()} />);
    expect(screen.getByText("Burning Hands (L1) — 14 fire · announce DC 15 DEX save")).toBeInTheDocument();
    expect(screen.getByText("Fire Bolt — 8 fire")).toBeInTheDocument();
  });

  it("fires onDismiss from the Dismiss button", async () => {
    const onDismiss = vi.fn();
    render(<CastTallyBanner rows={[{ id: "1", spellName: "Mage Armor", level: 1 }]} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
