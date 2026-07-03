import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InventoryList from "@/features/inventory/InventoryList";
import { applyInventoryTransactions, updateCharacter } from "@/api/client";
import type { Character, Currency, InventoryItem } from "@/types/character";

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
function makeCharacter(
  strength: number,
  inventory: InventoryItem[],
  currency: Currency = { cp: 0, sp: 0, gp: 0, pp: 0 }
): Character {
  return {
    id: "char-1",
    inventory,
    currency,
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

  it("does not flag when carried weight exactly equals capacity", () => {
    // STR 8 → capacity 120; a single 120 lb item = exactly at the limit.
    // 5e lets you carry UP TO STR × 15, so the boundary must use `>`, not `>=`.
    render(
      <InventoryList
        character={makeCharacter(8, [makeItem({ weight: 120 })])}
        onUpdate={vi.fn()}
      />
    );
    expect(screen.getByText(/120\.0 \/ 120 lb/)).toBeInTheDocument();
    expect(screen.queryByText(/over capacity/i)).not.toBeInTheDocument();
  });

  it("renders an encumbrance meter alongside the numeric text", () => {
    render(<InventoryList character={makeCharacter(10, [makeItem()])} onUpdate={vi.fn()} />);
    expect(screen.getByRole("meter")).toBeInTheDocument();
  });
});

describe("InventoryList sectioning", () => {
  it("groups items under category headers with count and weight", () => {
    const inventory = [
      makeItem({ id: "w1", name: "Longsword", category: "weapon", weight: 3 }),
      makeItem({ id: "g1", name: "Torch", category: "gear", weight: 1, quantity: 2 }),
    ];
    render(<InventoryList character={makeCharacter(15, inventory)} onUpdate={vi.fn()} />);
    expect(screen.getByText(/Weapons · 1 · 3 lb/)).toBeInTheDocument();
    expect(screen.getByText(/Gear · 1 · 2 lb/)).toBeInTheDocument();
  });

  it("orders sections Weapons → Armor → Gear → Consumables", () => {
    const inventory = [
      makeItem({ id: "c1", name: "Potion", category: "consumable", weight: 0.5 }),
      makeItem({ id: "g1", name: "Rope", category: "gear", weight: 5 }),
      makeItem({ id: "w1", name: "Axe", category: "weapon", weight: 4 }),
      makeItem({ id: "a1", name: "Shield", category: "armor", weight: 6 }),
    ];
    render(<InventoryList character={makeCharacter(15, inventory)} onUpdate={vi.fn()} />);
    const labels = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(labels[0]).toMatch(/^Weapons/);
    expect(labels[1]).toMatch(/^Armor/);
    expect(labels[2]).toMatch(/^Gear/);
    expect(labels[3]).toMatch(/^Consumables/);
  });

  it("orders equipped items first within a section, then alphabetical", () => {
    const inventory = [
      makeItem({ id: "w1", name: "Club", category: "weapon", equipped: false }),
      makeItem({ id: "w2", name: "Longsword", category: "weapon", equipped: true }),
    ];
    render(<InventoryList character={makeCharacter(15, inventory)} onUpdate={vi.fn()} />);
    const names = screen.getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);
    expect(names).toEqual(["Longsword", "Club"]);
  });

  it("renders a decorative icon inside each category header", () => {
    const inventory = [makeItem({ id: "w1", name: "Axe", category: "weapon", weight: 4 })];
    render(<InventoryList character={makeCharacter(15, inventory)} onUpdate={vi.fn()} />);
    const header = screen.getByRole("heading", { level: 4 });
    expect(header.querySelector("svg")).toBeInTheDocument();
  });

  it("hides categories with no items", () => {
    render(
      <InventoryList
        character={makeCharacter(15, [makeItem({ category: "weapon", name: "Axe" })])}
        onUpdate={vi.fn()}
      />
    );
    const labels = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatch(/^Weapons/);
  });
});

describe("InventoryList empty state", () => {
  it("shows an empty-pack message + add CTA and no sections or meter", () => {
    render(<InventoryList character={makeCharacter(10, [])} onUpdate={vi.fn()} />);
    expect(screen.getByText(/your pack is empty/i)).toBeInTheDocument();
    // Two "+ Add item" affordances when empty: the header button + the empty-state CTA.
    expect(screen.getAllByRole("button", { name: "+ Add item" })).toHaveLength(2);
    expect(screen.queryByRole("meter")).toBeNull();
    expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
  });
});

describe("InventoryList search and filter", () => {
  const inventory = [
    makeItem({ id: "w1", name: "Longsword", category: "weapon", equipped: true }),
    makeItem({ id: "w2", name: "Dagger", category: "weapon" }),
    makeItem({ id: "a1", name: "Shield", category: "armor" }),
    makeItem({ id: "g1", name: "Torch", category: "gear" }),
  ];

  it("filters rows by a case-insensitive name substring", async () => {
    const user = userEvent.setup();
    render(<InventoryList character={makeCharacter(15, inventory)} onUpdate={vi.fn()} />);
    await user.type(screen.getByRole("searchbox", { name: /search items/i }), "SWORD");
    expect(screen.getByText("Longsword")).toBeInTheDocument();
    expect(screen.queryByText("Dagger")).toBeNull();
    expect(screen.queryByText("Shield")).toBeNull();
  });

  it("filters by a category chip", async () => {
    const user = userEvent.setup();
    render(<InventoryList character={makeCharacter(15, inventory)} onUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Armor" }));
    expect(screen.getByText("Shield")).toBeInTheDocument();
    expect(screen.queryByText("Longsword")).toBeNull();
    expect(screen.queryByText("Torch")).toBeNull();
  });

  it("filters to equipped items via the Equipped chip", async () => {
    const user = userEvent.setup();
    render(<InventoryList character={makeCharacter(15, inventory)} onUpdate={vi.fn()} />);
    // Scope to the filter group — an equipped row's toggle is also named "Equipped".
    const filters = screen.getByRole("group", { name: /filter items/i });
    await user.click(within(filters).getByRole("button", { name: "Equipped" }));
    expect(screen.getByText("Longsword")).toBeInTheDocument();
    expect(screen.queryByText("Dagger")).toBeNull();
  });

  it("composes the search within the active filter", async () => {
    const user = userEvent.setup();
    render(<InventoryList character={makeCharacter(15, inventory)} onUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Weapons" }));
    await user.type(screen.getByRole("searchbox"), "dag");
    expect(screen.getByText("Dagger")).toBeInTheDocument();
    expect(screen.queryByText("Longsword")).toBeNull();
    expect(screen.queryByText("Shield")).toBeNull();
  });

  it("shows a no-match state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<InventoryList character={makeCharacter(15, inventory)} onUpdate={vi.fn()} />);
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText(/no items match/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
  });
});

describe("InventoryList purse", () => {
  it("shows the purse display-first and reveals inputs on Edit purse", async () => {
    const user = userEvent.setup();
    const character = makeCharacter(10, [makeItem()], { cp: 8, sp: 5, gp: 12, pp: 0 });
    render(<InventoryList character={character} onUpdate={vi.fn()} />);
    expect(screen.getByText("12 gp 5 sp 8 cp")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Edit purse" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("saves the edited currency via updateCharacter", async () => {
    const user = userEvent.setup();
    const character = makeCharacter(10, [makeItem()], { cp: 0, sp: 0, gp: 5, pp: 0 });
    render(<InventoryList character={character} onUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Edit purse" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateCharacter).toHaveBeenCalledWith("char-1", {
      currency: { cp: 0, sp: 0, gp: 5, pp: 0 },
    });
  });
});

describe("InventoryList multi-select sell", () => {
  const inventory = [
    makeItem({ id: "w1", name: "Longsword", category: "weapon", cost: { cp: 0, sp: 0, gp: 10, pp: 0 } }),
    makeItem({ id: "a1", name: "Shield", category: "armor", cost: { cp: 0, sp: 0, gp: 5, pp: 0 } }),
  ];

  it("enters select mode: rows show checkboxes and per-row actions hide", async () => {
    const user = userEvent.setup();
    render(<InventoryList character={makeCharacter(15, inventory)} onUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Sell items" }));
    expect(screen.getByRole("checkbox", { name: "Select Longsword" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Equip" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  });

  it("prefills a single sale total to the summed half-catalog value (no per-denomination boxes)", async () => {
    const user = userEvent.setup();
    const stack = [
      makeItem({ id: "w1", name: "Longsword", category: "weapon", quantity: 3, cost: { cp: 0, sp: 0, gp: 10, pp: 0 } }),
    ];
    render(<InventoryList character={makeCharacter(15, stack)} onUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Sell items" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Longsword" }));
    await user.click(screen.getByRole("button", { name: "Sell" }));

    // One total box, prefilled to the full stack's half value (3 × 5 gp).
    expect(screen.getByRole("spinbutton", { name: "Total gold received" })).toHaveValue(15);
    // Quantity is still per line…
    expect(screen.getByRole("spinbutton", { name: "Quantity to sell of Longsword" })).toHaveValue(3);
    // …but the old four-denomination boxes are gone.
    expect(screen.queryByRole("spinbutton", { name: /received for Longsword/ })).toBeNull();
  });

  it("sells at the auto total, splitting a single line's whole amount", async () => {
    const user = userEvent.setup();
    const stack = [
      makeItem({ id: "w1", name: "Longsword", category: "weapon", quantity: 3, cost: { cp: 0, sp: 0, gp: 10, pp: 0 } }),
    ];
    render(<InventoryList character={makeCharacter(15, stack)} onUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Sell items" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Longsword" }));
    await user.click(screen.getByRole("button", { name: "Sell" }));
    await user.click(screen.getByRole("button", { name: "Sell" }));

    expect(applyInventoryTransactions).toHaveBeenCalledWith("char-1", [
      { type: "sell", inventoryItemId: "w1", quantity: 3, currencyDelta: { cp: 0, sp: 0, gp: 15, pp: 0 } },
    ]);
  });

  it("splits an edited total evenly across the selected lines", async () => {
    const user = userEvent.setup();
    // Longsword half = 5 gp, Shield half = 2.5 gp → auto total 7.5 gp.
    render(<InventoryList character={makeCharacter(15, inventory)} onUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Sell items" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Longsword" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Shield" }));
    await user.click(screen.getByRole("button", { name: "Sell" }));

    const total = screen.getByRole("spinbutton", { name: "Total gold received" });
    expect(total).toHaveValue(7.5);

    // Negotiate a round 10 gp for the pair → 5 gp each.
    fireEvent.change(total, { target: { value: "10" } });
    await user.click(screen.getByRole("button", { name: "Sell" }));

    expect(applyInventoryTransactions).toHaveBeenCalledWith("char-1", [
      { type: "sell", inventoryItemId: "w1", quantity: 1, currencyDelta: { cp: 0, sp: 0, gp: 5, pp: 0 } },
      { type: "sell", inventoryItemId: "a1", quantity: 1, currencyDelta: { cp: 0, sp: 0, gp: 5, pp: 0 } },
    ]);
  });

  it("pins a per-line price and splits the remaining total across the rest", async () => {
    const user = userEvent.setup();
    render(<InventoryList character={makeCharacter(15, inventory)} onUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Sell items" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Longsword" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Shield" }));
    await user.click(screen.getByRole("button", { name: "Sell" }));

    // Set a bundle total of 10 gp, then pin the Longsword at 6 gp → Shield gets the rest (4 gp).
    fireEvent.change(screen.getByRole("spinbutton", { name: "Total gold received" }), { target: { value: "10" } });
    await user.click(screen.getByRole("button", { name: "Set a custom price for Longsword" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Custom price in gold for Longsword" }), {
      target: { value: "6" },
    });
    // Resolved readout reflects the pin + the remainder: 6 gp + 4 gp = 10 gp.
    expect(screen.getByText("= 10 gp")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sell" }));
    expect(applyInventoryTransactions).toHaveBeenCalledWith("char-1", [
      { type: "sell", inventoryItemId: "w1", quantity: 1, currencyDelta: { cp: 0, sp: 0, gp: 6, pp: 0 } },
      { type: "sell", inventoryItemId: "a1", quantity: 1, currencyDelta: { cp: 0, sp: 0, gp: 4, pp: 0 } },
    ]);
  });

  it("Cancel exits select mode", async () => {
    const user = userEvent.setup();
    render(<InventoryList character={makeCharacter(15, inventory)} onUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Sell items" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Sell items" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Select Longsword" })).toBeNull();
  });
});
