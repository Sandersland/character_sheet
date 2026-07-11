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
    rarity: "RARE",
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
    expect(screen.getByText("Rare")).toBeInTheDocument();
    expect(screen.queryByText("RARE")).not.toBeInTheDocument();
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

  // #687 gap pins — the branches the detail-row extraction most endangers.
  it("renders a consumable's dice + description joined with an em dash", () => {
    render(
      <CampaignItemCard
        item={item({
          category: "consumable",
          weapon: undefined,
          consumable: { effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 2, effectDescription: "Regain HP" },
        })}
        isOwner={false}
      />,
    );
    expect(screen.getByText("Effect")).toBeInTheDocument();
    expect(screen.getByText("2d4 + 2 — Regain HP")).toBeInTheDocument();
  });

  it("renders a description-only consumable effect (no dice)", () => {
    render(
      <CampaignItemCard
        item={item({
          category: "consumable",
          weapon: undefined,
          consumable: { effectDescription: "Cures poison" },
        })}
        isOwner={false}
      />,
    );
    expect(screen.getByText("Cures poison")).toBeInTheDocument();
  });

  it("omits the Effect row for a consumable with neither dice nor description", () => {
    render(
      <CampaignItemCard
        item={item({ category: "consumable", weapon: undefined, consumable: {} })}
        isOwner={false}
      />,
    );
    expect(screen.queryByText("Effect")).not.toBeInTheDocument();
  });

  it("renders weapon property rows: finesse, versatile, and a negative damage modifier", () => {
    render(
      <CampaignItemCard
        item={item({
          weapon: {
            damageDiceCount: 1,
            damageDiceFaces: 8,
            damageModifier: -1,
            damageType: "slashing",
            finesse: true,
            light: false,
            heavy: false,
            twoHanded: false,
            reach: false,
            thrown: false,
            ammunition: false,
            versatileDiceCount: 1,
            versatileDiceFaces: 10,
          },
        })}
        isOwner={false}
      />,
    );
    expect(screen.getByText("1d8 - 1 slashing")).toBeInTheDocument();
    expect(screen.getByText("Finesse")).toBeInTheDocument();
    expect(screen.getByText("1d10")).toBeInTheDocument();
  });

  it("renders weight and value rows, and the Unique badge", () => {
    render(<CampaignItemCard item={item({ isUnique: true })} isOwner={false} />);
    expect(screen.getByText("Weight")).toBeInTheDocument();
    expect(screen.getByText("3 lb")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText("5000 gp")).toBeInTheDocument();
    expect(screen.getByText("Unique")).toBeInTheDocument();
  });

  it("renders a minimal item: category badge only, no detail rows, no optional sections", () => {
    render(
      <CampaignItemCard
        item={item({
          rarity: undefined,
          requiresAttunement: false,
          weight: undefined,
          cost: undefined,
          weapon: undefined,
          description: undefined,
          dmNotes: undefined,
        })}
        isOwner
      />,
    );
    expect(screen.getByText("Weapons")).toBeInTheDocument(); // itemCategoryLabel is plural
    expect(screen.queryByText("Weight")).not.toBeInTheDocument();
    expect(screen.queryByText("Value")).not.toBeInTheDocument();
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
    expect(screen.queryByText(/DM notes/)).not.toBeInTheDocument();
    expect(screen.queryByText("Held by")).not.toBeInTheDocument();
  });
});
