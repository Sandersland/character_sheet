import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import CampaignItemCard from "@/features/entities/CampaignItemCard";
import type { CampaignItem } from "@/types/character";

function item(overrides: Partial<CampaignItem> = {}): CampaignItem {
  return {
    id: "item-1",
    campaignId: "camp-1",
    name: "Flametongue",
    category: "weapon",
    rarity: "rare",
    requiresAttunement: true,
    isUnique: false,
    weight: 3,
    cost: { cp: 0, sp: 0, gp: 5000, pp: 0 },
    dmNotes: "Crypt reward.",
    weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 0, damageType: "slashing", finesse: false, light: false, heavy: false, twoHanded: false, reach: false, thrown: false, ammunition: false },
    description: "A blade wreathed in fire.",
    entity: { id: "ent-1", name: "Flametongue", visibility: "REVEALED" },
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("CampaignItemCard (#380)", () => {
  it("renders the full card: rarity, attunement, damage, and description", () => {
    render(<CampaignItemCard item={item()} isOwner={false} />);
    expect(screen.getByText("rare")).toBeInTheDocument();
    expect(screen.getByText("Requires attunement")).toBeInTheDocument();
    expect(screen.getByText(/1d8 slashing/)).toBeInTheDocument();
    expect(screen.getByText("A blade wreathed in fire.")).toBeInTheDocument();
  });

  it("shows dmNotes to the owner", () => {
    render(<CampaignItemCard item={item()} isOwner />);
    expect(screen.getByText("Crypt reward.")).toBeInTheDocument();
  });

  it("never shows dmNotes to a non-owner (even if present in props)", () => {
    render(<CampaignItemCard item={item()} isOwner={false} />);
    expect(screen.queryByText("Crypt reward.")).not.toBeInTheDocument();
    expect(screen.queryByText(/DM notes/)).not.toBeInTheDocument();
  });

  it("shows holders once the item is awarded (#381)", () => {
    render(
      <CampaignItemCard
        item={item({ holders: [{ characterId: "c1", characterName: "Bruenor", quantity: 2 }] })}
        isOwner={false}
      />,
    );
    expect(screen.getByText("Held by")).toBeInTheDocument();
    expect(screen.getByText("Bruenor ×2")).toBeInTheDocument();
  });

  it("renders armor detail for an armor item", () => {
    render(
      <CampaignItemCard
        item={item({
          category: "armor",
          weapon: undefined,
          armor: { armorCategory: "heavy", baseArmorClass: 20, dexModifierApplies: false, stealthDisadvantage: true },
        })}
        isOwner={false}
      />,
    );
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("Disadvantage")).toBeInTheDocument();
  });
});
