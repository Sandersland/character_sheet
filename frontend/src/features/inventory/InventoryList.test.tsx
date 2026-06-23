import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import InventoryList from "@/features/inventory/InventoryList";
import type { Character, InventoryItem } from "@/types/character";

// InventoryList calls fetchItems() on mount to load the catalog; stub the
// client so the component renders without a real network request.
vi.mock("@/api/client", () => ({
  fetchItems: vi.fn().mockResolvedValue([]),
  applyInventoryTransactions: vi.fn(),
  updateCharacter: vi.fn(),
}));

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "item-1",
    name: "Plate Armor",
    category: "armor",
    quantity: 1,
    weight: 65,
    equipped: false,
    ...overrides,
  };
}

// Minimal Character stub — InventoryList reads id, inventory, currency, and
// abilityScores.strength (for carrying capacity).
function makeCharacter(strength: number, inventory: InventoryItem[]): Character {
  return {
    id: "char-1",
    inventory,
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
    abilityScores: { strength } as Character["abilityScores"],
  } as unknown as Character;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InventoryList carrying capacity", () => {
  it("renders carried weight against capacity (STR × 15)", () => {
    // STR 10 → capacity 150; 65 lb carried.
    render(<InventoryList character={makeCharacter(10, [makeItem()])} onUpdate={vi.fn()} />);
    expect(screen.getByText(/65\.0 \/ 150 lb/)).toBeInTheDocument();
  });

  it("recomputes capacity from the live STR score", () => {
    // STR 8 → capacity 120.
    render(<InventoryList character={makeCharacter(8, [makeItem()])} onUpdate={vi.fn()} />);
    expect(screen.getByText(/65\.0 \/ 120 lb/)).toBeInTheDocument();
  });

  it("does not flag over capacity when within the limit", () => {
    // STR 8 → capacity 120; 65 lb carried (under).
    render(<InventoryList character={makeCharacter(8, [makeItem()])} onUpdate={vi.fn()} />);
    expect(screen.queryByText(/over capacity/i)).not.toBeInTheDocument();
  });

  it("flags over capacity when carried weight exceeds the limit", () => {
    // STR 8 → capacity 120; two 65 lb items = 130 lb carried (over).
    const inventory = [makeItem(), makeItem({ id: "item-2" })];
    render(<InventoryList character={makeCharacter(8, inventory)} onUpdate={vi.fn()} />);
    expect(screen.getByText(/130\.0 \/ 120 lb/)).toBeInTheDocument();
    expect(screen.getByText(/over capacity/i)).toBeInTheDocument();
  });
});
