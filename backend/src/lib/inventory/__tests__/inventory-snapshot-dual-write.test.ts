// buildInventorySnapshot (#1648, epic #1644) — the one construction function
// every creation path calls. Assembled first against a hand-built row so the
// mapping is verified in isolation before Tasks 4/5 wire it into the real
// creation/mutation call sites (this file grows a describe block per task).
import { describe, expect, it } from "vitest";

import { inventorySnapshotSchema } from "@character-sheet/contracts";
import { buildInventorySnapshot, type SnapshotSourceRow } from "../inventory-snapshot-build.js";

const ROW_WITH_EVERYTHING: SnapshotSourceRow = {
  name: "Flame Tongue",
  category: "weapon",
  weight: 3,
  cost: { cp: 0, sp: 0, gp: 5000, pp: 0 },
  description: "A blade that ignites on command.",
  slot: "MAIN_HAND",
  rarity: "RARE",
  requiresAttunement: true,
  attunementPrereqKind: "class",
  attunementPrereqValue: "Fighter",
  weaponDetail: {
    damageDiceCount: 2,
    damageDiceFaces: 6,
    damageModifier: 0,
    damageType: "slashing",
    versatileDiceCount: null,
    versatileDiceFaces: null,
    finesse: false,
    light: false,
    heavy: false,
    twoHanded: false,
    reach: false,
    thrown: false,
    ammunition: false,
    rangeNormal: null,
    rangeLong: null,
    weaponClass: "martial",
    weaponRange: "melee",
  },
  armorDetail: {
    armorCategory: "shield",
    baseArmorClass: 2,
    dexModifierApplies: false,
    dexModifierMax: null,
    stealthDisadvantage: false,
    strengthRequirement: null,
  },
  consumableDetail: {
    effectDiceCount: 2,
    effectDiceFaces: 4,
    effectModifier: 0,
    effectDescription: "Heals",
    maxUses: 3,
    usesRemaining: 3,
  },
  capabilities: [
    {
      id: "cap-1",
      kind: "passiveBonus",
      target: "ac",
      op: "add",
      value: 1,
      targetKey: null,
      condition: null,
      description: null,
      valueDiceCount: null,
      valueDiceFaces: null,
      valueDamageType: null,
    },
    {
      id: "cap-2",
      kind: "grant",
      grantType: "resistance",
      grantValueKind: "damageType",
      grantValue: "fire",
      cantBeSurprised: false,
      description: null,
    },
  ],
};

const ROW_WITH_NAMELESS_CAST_SPELL: SnapshotSourceRow = {
  ...ROW_WITH_EVERYTHING,
  capabilities: [
    {
      id: "cap-3",
      kind: "castSpell",
      spellId: "spell-1",
      spellName: null,
      spellLevel: 3,
      castLevel: 3,
      castResource: "perDayDawn",
      castUses: 1,
      castConcentration: false,
      dcMode: "fixed",
      dcValue: 15,
      attackMode: "fixed",
      attackValue: null,
      chargeCost: null,
      description: null,
    },
  ],
};

describe("buildInventorySnapshot (#1648)", () => {
  it("builds a snapshot that parses, from a fully-populated row", () => {
    const snap = buildInventorySnapshot(ROW_WITH_EVERYTHING);
    const result = inventorySnapshotSchema.safeParse(snap);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("omits every mutable field", () => {
    const snap = buildInventorySnapshot(ROW_WITH_EVERYTHING) as unknown as Record<string, unknown>;
    for (const k of ["quantity", "equippedSlot", "attuned", "notes", "position", "activatedUsesSpent", "usesRemaining"]) {
      expect(snap).not.toHaveProperty(k);
    }
    expect(snap.consumable).not.toHaveProperty("usesRemaining");
    for (const cap of snap.capabilities as Record<string, unknown>[]) {
      expect(cap).not.toHaveProperty("used");
    }
  });

  // readCastSpellRow defaults a null spellName to "", which the schema rejects
  // (min(1)). Zero rows hit this today — there are no castSpell rows at all —
  // but the builder must not be the thing that discovers it.
  it("throws rather than emitting an unparseable castSpell entry", () => {
    expect(() => buildInventorySnapshot(ROW_WITH_NAMELESS_CAST_SPELL)).toThrow(/spellName/);
  });

  it("keys each capability by its row id", () => {
    const snap = buildInventorySnapshot(ROW_WITH_EVERYTHING);
    expect(snap.capabilities.map((c) => c.key)).toEqual(ROW_WITH_EVERYTHING.capabilities.map((c) => c.id));
  });
});
