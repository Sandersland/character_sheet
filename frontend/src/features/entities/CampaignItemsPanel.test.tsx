import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CampaignItemsPanel from "@/features/entities/CampaignItemsPanel";
import type { CampaignItem } from "@/types/character";

let mockEntities: { id: string; name: string; visibility: string }[] = [];
vi.mock("@/hooks/useCampaignEntities", () => ({
  useCampaignEntities: () => ({ entities: mockEntities }),
  primeCampaignEntities: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  fetchCampaignItems: vi.fn(),
  fetchItems: vi.fn(() => Promise.resolve([])),
  awardCampaignItem: vi.fn(),
  revokeCampaignItem: vi.fn(),
  createCampaignItem: vi.fn(),
  updateCampaignItem: vi.fn(),
  deleteCampaignItem: vi.fn(),
  updateEntity: vi.fn(),
}));

import {
  awardCampaignItem,
  createCampaignItem,
  fetchCampaignItems,
  revokeCampaignItem,
  updateCampaignItem,
} from "@/api/client";
import { primeCampaignEntities } from "@/hooks/useCampaignEntities";

const baseItem: CampaignItem = {
  id: "item-1",
  campaignId: "camp-1",
  name: "Flametongue",
  category: "weapon",
  requiresAttunement: false,
  isUnique: false,
  holders: [],
  entity: { id: "ent-1", name: "Flametongue", visibility: "HIDDEN" },
  createdAt: "2026-07-05T00:00:00.000Z",
  updatedAt: "2026-07-05T00:00:00.000Z",
};

const characters = [{ id: "c1", name: "Bruenor", ownerId: "u1" }];

function renderPanel() {
  return render(
    <MemoryRouter>
      <CampaignItemsPanel campaignId="camp-1" characters={characters} />
    </MemoryRouter>,
  );
}

describe("CampaignItemsPanel award/revoke (#381)", () => {
  beforeEach(() => {
    vi.mocked(fetchCampaignItems).mockResolvedValue([baseItem]);
  });

  it("awards to a chosen character and shows the returned holder", async () => {
    vi.mocked(awardCampaignItem).mockResolvedValue({
      holders: [{ characterId: "c1", characterName: "Bruenor", quantity: 1 }],
    });
    renderPanel();
    await screen.findByText("Flametongue");

    await userEvent.selectOptions(screen.getByLabelText("Award to"), "c1");
    await userEvent.click(screen.getByRole("button", { name: "Award" }));

    await waitFor(() =>
      expect(awardCampaignItem).toHaveBeenCalledWith("camp-1", "item-1", { characterId: "c1" }),
    );
    const heldBy = await screen.findByText(/Held by/);
    expect(heldBy).toHaveTextContent("Bruenor");
  });

  it("revokes a held item back to no holders", async () => {
    vi.mocked(fetchCampaignItems).mockResolvedValue([
      { ...baseItem, holders: [{ characterId: "c1", characterName: "Bruenor", quantity: 1 }] },
    ]);
    vi.mocked(revokeCampaignItem).mockResolvedValue({ holders: [] });
    renderPanel();
    await screen.findByText(/Held by/);

    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() =>
      expect(revokeCampaignItem).toHaveBeenCalledWith("camp-1", "item-1", { characterId: "c1" }),
    );
    await waitFor(() => expect(screen.queryByText(/Held by/)).not.toBeInTheDocument());
  });

  it("hides the award control for a held unique item", async () => {
    vi.mocked(fetchCampaignItems).mockResolvedValue([
      { ...baseItem, isUnique: true, holders: [{ characterId: "c1", characterName: "Bruenor", quantity: 1 }] },
    ]);
    renderPanel();
    await screen.findByText(/Held by/);
    expect(screen.queryByLabelText("Award to")).not.toBeInTheDocument();
  });
});

describe("CampaignItemsPanel edit (#505)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntities = [{ id: "ent-1", name: "Flametongue", visibility: "HIDDEN" }];
    vi.mocked(fetchCampaignItems).mockResolvedValue([
      { ...baseItem, description: "A burning blade", weapon: { damageDiceCount: 2, damageDiceFaces: 6, damageModifier: 0, damageType: "fire", finesse: false, light: false, heavy: false, twoHanded: false, reach: false, thrown: false, ammunition: false } },
    ]);
  });

  it("opens the shared form pre-filled and saves via updateCampaignItem", async () => {
    vi.mocked(updateCampaignItem).mockResolvedValue({
      ...baseItem,
      name: "Flametongue +2",
      description: "A burning blade",
      entity: { id: "ent-1", name: "Flametongue +2", visibility: "HIDDEN" },
      holders: [],
    });
    renderPanel();
    await screen.findByText("Flametongue");

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    const nameInput = screen.getByLabelText("Name *") as HTMLInputElement;
    expect(nameInput.value).toBe("Flametongue");
    expect((screen.getByLabelText("Damage type") as HTMLInputElement).value).toBe("fire");
    // Edit mode drops the clone-from-catalog control.
    expect(screen.queryByLabelText("Clone from catalog (optional)")).not.toBeInTheDocument();

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Flametongue +2");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(updateCampaignItem).toHaveBeenCalledWith(
        "camp-1",
        "item-1",
        expect.objectContaining({ name: "Flametongue +2" }),
      ),
    );
    // List reflects the rename; the fronting entity is renamed in the shared cache.
    await screen.findByText("Flametongue +2");
    await waitFor(() =>
      expect(primeCampaignEntities).toHaveBeenCalledWith("camp-1", [
        { id: "ent-1", name: "Flametongue +2", visibility: "HIDDEN" },
      ]),
    );
    // Form closes after a successful save.
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("keeps existing holders after an edit whose response omits them", async () => {
    vi.mocked(fetchCampaignItems).mockResolvedValue([
      { ...baseItem, holders: [{ characterId: "c1", characterName: "Bruenor", quantity: 1 }] },
    ]);
    vi.mocked(updateCampaignItem).mockResolvedValue({
      ...baseItem,
      name: "Flametongue +2",
      entity: { id: "ent-1", name: "Flametongue +2", visibility: "HIDDEN" },
      holders: [],
    });
    renderPanel();
    await screen.findByText(/Held by/);

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByText("Flametongue +2");
    expect(screen.getByText(/Held by/)).toHaveTextContent("Bruenor");
  });

  it("cancels an edit without calling updateCampaignItem", async () => {
    renderPanel();
    await screen.findByText("Flametongue");

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(updateCampaignItem).not.toHaveBeenCalled();
  });
});

describe("CampaignItemsPanel field parity (#527/#542)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntities = [];
    vi.mocked(fetchCampaignItems).mockResolvedValue([]);
  });

  it("sends the full weapon field set on create", async () => {
    vi.mocked(createCampaignItem).mockResolvedValue({ ...baseItem, id: "new-1", name: "Spear" });
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "New item" }));

    await userEvent.type(screen.getByLabelText("Name *"), "Spear");
    await userEvent.clear(screen.getByLabelText("Damage modifier"));
    await userEvent.type(screen.getByLabelText("Damage modifier"), "1");
    await userEvent.click(screen.getByRole("radio", { name: "Martial" }));
    await userEvent.click(screen.getByRole("radio", { name: "Melee" }));
    // Versatile die is revealed only after toggling versatile on (defaults 1d10).
    await userEvent.click(screen.getByRole("button", { name: "versatile" }));
    await userEvent.clear(screen.getByLabelText("Versatile damage dice faces"));
    await userEvent.type(screen.getByLabelText("Versatile damage dice faces"), "8");
    // Range is revealed only after thrown (or ranged) is set.
    await userEvent.click(screen.getByRole("button", { name: "thrown" }));
    await userEvent.click(screen.getByRole("button", { name: "reach" }));
    await userEvent.type(screen.getByLabelText("Range (normal)"), "20");
    await userEvent.type(screen.getByLabelText("Range (long)"), "60");

    await userEvent.click(screen.getByRole("button", { name: "Create item" }));

    await waitFor(() =>
      expect(createCampaignItem).toHaveBeenCalledWith(
        "camp-1",
        expect.objectContaining({
          weapon: expect.objectContaining({
            damageModifier: 1,
            versatileDiceCount: 1,
            versatileDiceFaces: 8,
            rangeNormal: 20,
            rangeLong: 60,
            weaponClass: "martial",
            weaponRange: "melee",
            thrown: true,
            reach: true,
            finesse: false,
          }),
        }),
      ),
    );
  });

  it("drops the versatile die when versatile is toggled off", async () => {
    vi.mocked(createCampaignItem).mockResolvedValue({ ...baseItem, id: "new-1b", name: "Club" });
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "New item" }));

    await userEvent.type(screen.getByLabelText("Name *"), "Club");
    await userEvent.click(screen.getByRole("button", { name: "versatile" }));
    expect(screen.getByLabelText("Versatile damage dice faces")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "versatile" }));
    expect(screen.queryByLabelText("Versatile damage dice faces")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Create item" }));

    await waitFor(() => expect(createCampaignItem).toHaveBeenCalled());
    const sent = vi.mocked(createCampaignItem).mock.calls[0][1];
    expect(sent.weapon?.versatileDiceCount).toBeUndefined();
    expect(sent.weapon?.versatileDiceFaces).toBeUndefined();
  });

  it("sends the full armor field set on create", async () => {
    vi.mocked(createCampaignItem).mockResolvedValue({ ...baseItem, id: "new-2", name: "Half Plate", category: "armor" });
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "New item" }));

    await userEvent.type(screen.getByLabelText("Name *"), "Half Plate");
    await userEvent.click(screen.getByRole("radio", { name: "Armor" }));
    await userEvent.type(screen.getByLabelText("Base AC"), "15");
    await userEvent.type(screen.getByLabelText("Max Dex bonus"), "2");
    await userEvent.type(screen.getByLabelText("Strength requirement"), "13");
    await userEvent.click(screen.getByRole("button", { name: "Dex applies" }));

    await userEvent.click(screen.getByRole("button", { name: "Create item" }));

    await waitFor(() =>
      expect(createCampaignItem).toHaveBeenCalledWith(
        "camp-1",
        expect.objectContaining({
          armor: expect.objectContaining({
            baseArmorClass: 15,
            dexModifierMax: 2,
            strengthRequirement: 13,
            dexModifierApplies: false,
          }),
        }),
      ),
    );
  });

  it("sends the full currency cost via the coin-breakdown disclosure", async () => {
    vi.mocked(createCampaignItem).mockResolvedValue({ ...baseItem, id: "new-3", name: "Trinket" });
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "New item" }));

    await userEvent.type(screen.getByLabelText("Name *"), "Trinket");
    await userEvent.click(screen.getByRole("button", { name: "Coin breakdown" }));
    await userEvent.type(screen.getByLabelText("Value (cp)"), "5");
    await userEvent.type(screen.getByLabelText("Value (sp)"), "3");
    await userEvent.type(screen.getByLabelText("Value (gp)"), "2");
    await userEvent.type(screen.getByLabelText("Value (pp)"), "1");

    await userEvent.click(screen.getByRole("button", { name: "Create item" }));

    await waitFor(() =>
      expect(createCampaignItem).toHaveBeenCalledWith(
        "camp-1",
        expect.objectContaining({ cost: { cp: 5, sp: 3, gp: 2, pp: 1 } }),
      ),
    );
  });

  it("persists the single Value field into one denomination", async () => {
    vi.mocked(createCampaignItem).mockResolvedValue({ ...baseItem, id: "new-3b", name: "Gem" });
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "New item" }));

    await userEvent.type(screen.getByLabelText("Name *"), "Gem");
    await userEvent.type(screen.getByLabelText("Value"), "200");

    await userEvent.click(screen.getByRole("button", { name: "Create item" }));

    await waitFor(() =>
      expect(createCampaignItem).toHaveBeenCalledWith(
        "camp-1",
        expect.objectContaining({ cost: { cp: 0, sp: 0, gp: 200, pp: 0 } }),
      ),
    );
  });

  it("omits cost entirely when no currency field is filled", async () => {
    vi.mocked(createCampaignItem).mockResolvedValue({ ...baseItem, id: "new-4", name: "Free" });
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "New item" }));

    await userEvent.type(screen.getByLabelText("Name *"), "Free");
    await userEvent.click(screen.getByRole("button", { name: "Create item" }));

    await waitFor(() => expect(createCampaignItem).toHaveBeenCalled());
    const sent = vi.mocked(createCampaignItem).mock.calls[0][1];
    expect(sent.cost).toBeUndefined();
  });

  it("pre-fills the weapon fields when editing an existing item", async () => {
    vi.mocked(fetchCampaignItems).mockResolvedValue([
      {
        ...baseItem,
        weapon: {
          damageDiceCount: 1,
          damageDiceFaces: 6,
          damageModifier: 2,
          damageType: "piercing",
          versatileDiceCount: 1,
          versatileDiceFaces: 8,
          finesse: true,
          light: false,
          heavy: false,
          twoHanded: false,
          reach: false,
          thrown: true,
          ammunition: false,
          rangeNormal: 20,
          rangeLong: 60,
          weaponClass: "martial",
          weaponRange: "melee",
        },
      },
    ]);
    renderPanel();
    await screen.findByText("Flametongue");
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect((screen.getByLabelText("Damage modifier") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("Versatile damage dice faces") as HTMLInputElement).value).toBe("8");
    expect((screen.getByLabelText("Range (normal)") as HTMLInputElement).value).toBe("20");
    expect(screen.getByRole("radio", { name: "Martial" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "finesse" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "thrown" })).toHaveAttribute("aria-pressed", "true");
  });

  it("pre-fills the armor fields when editing an existing item", async () => {
    vi.mocked(fetchCampaignItems).mockResolvedValue([
      {
        ...baseItem,
        name: "Half Plate",
        category: "armor",
        armor: {
          armorCategory: "medium",
          baseArmorClass: 15,
          dexModifierApplies: false,
          dexModifierMax: 2,
          stealthDisadvantage: true,
          strengthRequirement: 13,
        },
      },
    ]);
    renderPanel();
    await screen.findByText("Half Plate");
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect((screen.getByLabelText("Max Dex bonus") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("Strength requirement") as HTMLInputElement).value).toBe("13");
    expect(screen.getByRole("button", { name: "Dex applies" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("CampaignItemsPanel progressive disclosure (#542)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntities = [];
    vi.mocked(fetchCampaignItems).mockResolvedValue([]);
  });

  it("hides versatile die and range on a default melee weapon, then reveals them", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "New item" }));

    expect(screen.queryByLabelText("Versatile damage dice faces")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Range (normal)")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "versatile" }));
    expect(screen.getByLabelText("Versatile damage dice faces")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "thrown" }));
    expect(screen.getByLabelText("Range (normal)")).toBeInTheDocument();
  });
});

describe("CampaignItemsPanel rarity (#497/#542)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntities = [];
    vi.mocked(fetchCampaignItems).mockResolvedValue([{ ...baseItem, rarity: "VERY_RARE" }]);
  });

  it("renders the rarity badge via a human label, never the raw enum key", async () => {
    renderPanel();
    await screen.findByText("Flametongue");
    expect(screen.getByText("Very Rare")).toBeInTheDocument();
    expect(screen.queryByText("VERY_RARE")).not.toBeInTheDocument();
  });

  it("offers rarity as a dropdown with a mundane option and shows the value hint", async () => {
    renderPanel();
    await screen.findByText("Flametongue");
    await userEvent.click(screen.getByRole("button", { name: "New item" }));

    const rarity = screen.getByLabelText("Rarity") as HTMLSelectElement;
    expect(rarity.tagName).toBe("SELECT");
    // Mundane empty option + the six tiers.
    expect(rarity.querySelectorAll("option")).toHaveLength(7);
    expect(screen.queryByText("Standard value: 4,000 gp")).not.toBeInTheDocument();

    await userEvent.selectOptions(rarity, "RARE");
    expect(screen.getByText("Standard value: 4,000 gp")).toBeInTheDocument();
  });

  it("hides attunement/unique and the value hint when rarity is Mundane", async () => {
    renderPanel();
    await screen.findByText("Flametongue");
    await userEvent.click(screen.getByRole("button", { name: "New item" }));

    await userEvent.selectOptions(screen.getByLabelText("Rarity"), "RARE");
    expect(screen.getByRole("button", { name: "Requires attunement" })).toBeInTheDocument();
    expect(screen.getByText("Standard value: 4,000 gp")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Rarity"), "");
    expect(screen.queryByRole("button", { name: "Requires attunement" })).not.toBeInTheDocument();
    expect(screen.queryByText("Standard value: 4,000 gp")).not.toBeInTheDocument();
  });

  it("halves the value hint for a consumable and sends the enum on create", async () => {
    vi.mocked(createCampaignItem).mockResolvedValue({ ...baseItem, id: "new-1", name: "Potion" });
    renderPanel();
    await screen.findByText("Flametongue");
    await userEvent.click(screen.getByRole("button", { name: "New item" }));

    await userEvent.click(screen.getByRole("radio", { name: "Consumables" }));
    await userEvent.selectOptions(screen.getByLabelText("Rarity"), "RARE");
    expect(screen.getByText("Standard value: 2,000 gp")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Name *"), "Potion");
    await userEvent.click(screen.getByRole("button", { name: "Create item" }));

    await waitFor(() =>
      expect(createCampaignItem).toHaveBeenCalledWith(
        "camp-1",
        expect.objectContaining({ rarity: "RARE" }),
      ),
    );
  });
});
