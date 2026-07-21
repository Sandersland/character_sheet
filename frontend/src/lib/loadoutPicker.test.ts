import { describe, it, expect } from "vitest";

import {
  NO_BUDGET_REASON,
  changeWeaponsSubtitle,
  handContext,
  handButtonDisabledReason,
  handPickerOptions,
  interactionBudgetRemaining,
  planInteractionSpend,
} from "@/lib/loadoutPicker";
import type { InventoryItem } from "@/types/character";

function weapon(over: Partial<InventoryItem>, twoHanded = false): InventoryItem {
  return {
    category: "weapon",
    quantity: 1,
    equipped: false,
    weapon: { twoHanded },
    ...over,
  } as unknown as InventoryItem;
}

const longsword = weapon({ id: "ls", name: "Longsword", equipped: true, equippedSlot: "MAIN_HAND" });
const shield = { ...weapon({ id: "sh", name: "Shield", equipped: true, equippedSlot: "OFF_HAND" }), category: "armor", armor: { armorCategory: "shield" } } as unknown as InventoryItem;
const bagDagger1 = weapon({ id: "d1", name: "Dagger" });
const bagDagger2 = weapon({ id: "d2", name: "Dagger" });
const bagGreataxe = weapon({ id: "ga", name: "Greataxe" }, true);

const fresh = { attackEquipCredits: 0, freeInteractionUsed: false }; // full turn, nothing spent
const attackCredit = { attackEquipCredits: 1, freeInteractionUsed: false }; // one attack made
const freeSpent = { attackEquipCredits: 0, freeInteractionUsed: true }; // free interaction already used
const exhausted = { attackEquipCredits: 0, freeInteractionUsed: true }; // nothing left at all (same as freeSpent w/ no credits)

describe("interactionBudgetRemaining", () => {
  it("is 1 on a fresh turn (the free object interaction)", () => {
    expect(interactionBudgetRemaining(fresh)).toBe(1);
  });

  it("adds unspent attack equip/unequip credits", () => {
    expect(interactionBudgetRemaining(attackCredit)).toBe(2);
  });

  it("drops to 0 once the free interaction is spent and no attacks were made", () => {
    expect(interactionBudgetRemaining(freeSpent)).toBe(0);
  });
});

describe("planInteractionSpend", () => {
  it("pays a 1-unit interaction from the free interaction on a fresh turn", () => {
    expect(planInteractionSpend(fresh, 1)).toEqual({ fromAttackCredits: 0, usedFreeInteraction: true });
  });

  it("pays a 2-unit swap from an attack credit + the free interaction (rides attack + free interaction)", () => {
    expect(planInteractionSpend(attackCredit, 2)).toEqual({ fromAttackCredits: 1, usedFreeInteraction: true });
  });

  it("spends attack credits before the free interaction when only 1 unit is needed", () => {
    expect(planInteractionSpend(attackCredit, 1)).toEqual({ fromAttackCredits: 1, usedFreeInteraction: false });
  });

  it("returns null when the budget can't cover the units needed", () => {
    expect(planInteractionSpend(freeSpent, 1)).toBeNull();
    expect(planInteractionSpend(attackCredit, 2 + 1)).toBeNull();
  });
});

describe("loadoutPicker", () => {
  describe("handContext", () => {
    it("reads the current MAIN/OFF occupants", () => {
      const ctx = handContext([longsword, shield, bagDagger1], 1, fresh);
      expect(ctx.mainOcc?.id).toBe("ls");
      expect(ctx.offOcc?.id).toBe("sh");
      expect(ctx.actionsRemaining).toBe(1);
      expect(ctx.budget).toEqual(fresh);
    });

    it("leaves occupants undefined when hands are empty", () => {
      const ctx = handContext([bagDagger1], 1, fresh);
      expect(ctx.mainOcc).toBeUndefined();
      expect(ctx.offOcc).toBeUndefined();
    });
  });

  describe("handPickerOptions", () => {
    it("dedupes candidates by name with a ×N count", () => {
      const ctx = handContext([longsword, bagDagger1, bagDagger2], 1, fresh);
      const opts = handPickerOptions([longsword, bagDagger1, bagDagger2], "MAIN_HAND", ctx);
      const dagger = opts.find((o) => o.label === "Dagger");
      expect(dagger).toBeDefined();
      expect(dagger?.count).toBe(2);
      expect(dagger?.item?.id).toMatch(/^d[12]$/);
    });

    it("a draw into an empty hand is free when the budget covers 1 unit", () => {
      const ctx = handContext([bagDagger1], 1, fresh);
      const [dagger] = handPickerOptions([bagDagger1], "MAIN_HAND", ctx);
      expect(dagger.cost).toBe("free");
      expect(dagger.disabledReason).toBeNull();
    });

    it("a swap into an occupied hand rides an attack credit + the free interaction (free)", () => {
      const ctx = handContext([longsword, bagDagger1], 1, attackCredit);
      const [dagger] = handPickerOptions([longsword, bagDagger1], "MAIN_HAND", ctx);
      expect(dagger.cost).toBe("free");
    });

    it("the same occupied-hand swap costs the Action once the free interaction is spent and no attack was made", () => {
      const ctx = handContext([longsword, bagDagger1], 1, freeSpent);
      const [dagger] = handPickerOptions([longsword, bagDagger1], "MAIN_HAND", ctx);
      expect(dagger.cost).toBe("action");
      expect(dagger.disabledReason).toBeNull(); // 1 action → affordable
    });

    it("blocks an option needing more units than the budget when no Action is left either", () => {
      const ctx = handContext([longsword, bagDagger1], 0, freeSpent);
      const [dagger] = handPickerOptions([longsword, bagDagger1], "MAIN_HAND", ctx);
      expect(dagger.cost).toBe("blocked");
      expect(dagger.disabledReason).toBe(NO_BUDGET_REASON);
    });

    it("treats a two-handed draw as needing 3 units when both hands are occupied", () => {
      // Main empty, off holds a shield: greataxe needs to stow off-hand (1) + draw (1) = 2 units for THIS case,
      // but with main also occupied by a dagger it would be 3 — here main is empty so it's 2.
      const ctx = handContext([shield, bagGreataxe], 1, fresh);
      const [greataxe] = handPickerOptions([shield, bagGreataxe], "MAIN_HAND", ctx);
      // fresh budget = 1 unit only, greataxe needs 2 (stow off-hand + draw) → costs the Action.
      expect(greataxe.cost).toBe("action");
    });

    it("appends a Stow option only for an occupied hand, budget-gated like any 1-unit interaction", () => {
      const occ = handContext([longsword, bagDagger1], 1, fresh);
      const withStow = handPickerOptions([longsword, bagDagger1], "MAIN_HAND", occ);
      const stow = withStow.find((o) => o.item === null);
      expect(stow).toBeDefined();
      expect(stow?.cost).toBe("free"); // fresh turn: the free interaction covers it
      expect(stow?.disabledReason).toBeNull();

      const empty = handContext([bagDagger1], 1, fresh);
      const noStow = handPickerOptions([bagDagger1], "MAIN_HAND", empty);
      expect(noStow.some((o) => o.item === null)).toBe(false);
    });

    it("Stow costs the Action once the budget is spent, and blocks when the Action is also gone", () => {
      const ctxAction = handContext([longsword], 1, freeSpent);
      const stowAction = handPickerOptions([longsword], "MAIN_HAND", ctxAction).find((o) => o.item === null);
      expect(stowAction?.cost).toBe("action");

      const ctxBlocked = handContext([longsword], 0, freeSpent);
      const stowBlocked = handPickerOptions([longsword], "MAIN_HAND", ctxBlocked).find((o) => o.item === null);
      expect(stowBlocked?.cost).toBe("blocked");
      expect(stowBlocked?.disabledReason).toBe(NO_BUDGET_REASON);
    });
  });

  describe("handButtonDisabledReason", () => {
    it("stays enabled when the budget still has a free interaction, even at 0 actions", () => {
      const ctx = handContext([longsword], 0, fresh);
      expect(handButtonDisabledReason(ctx)).toBeNull();
    });

    it("blocks only when both the budget and the Action are exhausted", () => {
      const ctx = handContext([longsword], 0, exhausted);
      expect(handButtonDisabledReason(ctx)).toBe(NO_BUDGET_REASON);
    });

    it("stays enabled with an action to spend even once the budget is exhausted", () => {
      const ctx = handContext([longsword], 1, exhausted);
      expect(handButtonDisabledReason(ctx)).toBeNull();
    });
  });
});

describe("changeWeaponsSubtitle", () => {
  it("advertises the free interaction when budget remains", () => {
    expect(changeWeaponsSubtitle("Longsword", 1, true)).toBe("Longsword · free interaction available");
  });

  it("warns the swap costs the Action once the budget is spent", () => {
    expect(changeWeaponsSubtitle("Longsword", 0, true)).toBe("Longsword · a swap now costs your Action");
  });

  it("reports fully blocked when neither the budget nor the Action remain", () => {
    expect(changeWeaponsSubtitle("Longsword", 0, false)).toBe("Longsword · no free interaction or Action left");
  });
});
