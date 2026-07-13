import { describe, it, expect } from "vitest";

import {
  NO_ACTION_REASON,
  handContext,
  handButtonDisabledReason,
  handPickerOptions,
  hasLoadoutOptions,
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

describe("loadoutPicker", () => {
  describe("handContext", () => {
    it("reads the current MAIN/OFF occupants", () => {
      const ctx = handContext([longsword, shield, bagDagger1], 1);
      expect(ctx.mainOcc?.id).toBe("ls");
      expect(ctx.offOcc?.id).toBe("sh");
      expect(ctx.actionsRemaining).toBe(1);
    });

    it("leaves occupants undefined when hands are empty", () => {
      const ctx = handContext([bagDagger1], 1);
      expect(ctx.mainOcc).toBeUndefined();
      expect(ctx.offOcc).toBeUndefined();
    });
  });

  describe("handPickerOptions", () => {
    it("dedupes candidates by name with a ×N count", () => {
      const ctx = handContext([longsword, bagDagger1, bagDagger2], 1);
      const opts = handPickerOptions([longsword, bagDagger1, bagDagger2], "MAIN_HAND", ctx);
      const dagger = opts.find((o) => o.label === "Dagger");
      expect(dagger).toBeDefined();
      expect(dagger?.count).toBe(2);
      // The representative item is a concrete bag dagger.
      expect(dagger?.item?.id).toMatch(/^d[12]$/);
    });

    it("marks a swap into an occupied hand as action-costed", () => {
      const ctx = handContext([longsword, bagDagger1], 1);
      const [dagger] = handPickerOptions([longsword, bagDagger1], "MAIN_HAND", ctx);
      expect(dagger.costsAction).toBe(true);
      expect(dagger.disabledReason).toBeNull(); // 1 action → affordable
    });

    it("marks a draw into an empty hand as free (no action)", () => {
      const ctx = handContext([bagDagger1], 1);
      const [dagger] = handPickerOptions([bagDagger1], "MAIN_HAND", ctx);
      expect(dagger.costsAction).toBe(false);
      expect(dagger.disabledReason).toBeNull();
    });

    it("disables an action-costed option at 0 actions with the reason text", () => {
      const ctx = handContext([longsword, bagDagger1], 0);
      const [dagger] = handPickerOptions([longsword, bagDagger1], "MAIN_HAND", ctx);
      expect(dagger.costsAction).toBe(true);
      expect(dagger.disabledReason).toBe(NO_ACTION_REASON);
    });

    it("treats a two-handed draw into a free hand as action-costed when the OTHER hand is occupied", () => {
      // Main empty, off holds a shield, 0 actions: the greataxe must stow the off-hand.
      const ctx = handContext([shield, bagGreataxe], 0);
      const [greataxe] = handPickerOptions([shield, bagGreataxe], "MAIN_HAND", ctx);
      expect(greataxe.costsAction).toBe(true);
      expect(greataxe.disabledReason).toBe(NO_ACTION_REASON);
    });

    it("keeps a one-handed draw into that same free hand free (only the 2h option is gated)", () => {
      const ctx = handContext([shield, bagDagger1, bagGreataxe], 0);
      const opts = handPickerOptions([shield, bagDagger1, bagGreataxe], "MAIN_HAND", ctx);
      expect(opts.find((o) => o.label === "Dagger")?.disabledReason).toBeNull();
      expect(opts.find((o) => o.label === "Greataxe")?.disabledReason).toBe(NO_ACTION_REASON);
    });

    it("appends a free Stow option only for an occupied hand", () => {
      const occ = handContext([longsword, bagDagger1], 1);
      const withStow = handPickerOptions([longsword, bagDagger1], "MAIN_HAND", occ);
      const stow = withStow.find((o) => o.item === null);
      expect(stow).toBeDefined();
      expect(stow?.costsAction).toBe(false);
      expect(stow?.disabledReason).toBeNull();

      const empty = handContext([bagDagger1], 1);
      const noStow = handPickerOptions([bagDagger1], "MAIN_HAND", empty);
      expect(noStow.some((o) => o.item === null)).toBe(false);
    });
  });

  describe("handButtonDisabledReason", () => {
    it("disables an occupied hand at 0 actions", () => {
      const ctx = handContext([longsword], 0);
      expect(handButtonDisabledReason("MAIN_HAND", ctx)).toBe(NO_ACTION_REASON);
    });

    it("leaves an occupied hand enabled with an action to spend", () => {
      const ctx = handContext([longsword], 1);
      expect(handButtonDisabledReason("MAIN_HAND", ctx)).toBeNull();
    });

    it("leaves a free hand enabled even at 0 actions", () => {
      const ctx = handContext([longsword], 0);
      expect(handButtonDisabledReason("OFF_HAND", ctx)).toBeNull();
    });
  });

  describe("hasLoadoutOptions", () => {
    const potion = {
      id: "po",
      name: "Potion of Healing",
      category: "consumable",
      quantity: 1,
      equipped: false,
    } as unknown as InventoryItem;

    it("is false with empty hands and nothing hand-equippable in the bag", () => {
      expect(hasLoadoutOptions([])).toBe(false);
      expect(hasLoadoutOptions([potion])).toBe(false);
    });

    it("is true when a hand is occupied (a free Stow is on offer)", () => {
      expect(hasLoadoutOptions([longsword])).toBe(true);
      expect(hasLoadoutOptions([shield])).toBe(true);
    });

    it("is true when the bag holds a hand-equippable candidate", () => {
      expect(hasLoadoutOptions([bagDagger1])).toBe(true);
    });
  });
});
