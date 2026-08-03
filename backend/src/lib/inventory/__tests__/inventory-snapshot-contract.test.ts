/**
 * The frozen/mutable line is the invariant the whole snapshot design rests on
 * (#1647, epic #1644): definition data goes in the JSON blob, runtime state
 * stays in columns. A schema that merely ACCEPTS the right shape is not enough
 * — zod v4 strips unknown keys by default, so a non-strict schema would take a
 * blob carrying `used` and silently discard it, surfacing as data loss in
 * #1648's dual-write. The reject cases are the real contract.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ACTIVATED_DURATIONS,
  ACTIVATION_TYPES,
  inventorySnapshotSchema,
  ITEM_RARITY_KEYS,
  ITEM_RESOURCE_KINDS,
  ITEM_RESOURCE_PERIODS,
  snapshotCapabilitySchema,
} from "@character-sheet/contracts";
import { ITEM_RARITIES } from "@/lib/srd/item-rarity.js";
import type { ActivatedDurationKind, ActivationType, ItemResourceKind, ItemResourcePeriod } from "@character-sheet/shared-types";

const PASSIVE = { key: "cap-1", kind: "passiveBonus", target: "ac", op: "add", value: 1 };

describe("snapshotCapabilitySchema (#1647)", () => {
  it.each([
    ["passiveBonus", PASSIVE],
    ["charges", { key: "c", kind: "charges", maxCharges: 20, rechargeTrigger: "dawn", rechargeDice: { count: 2, faces: 8 } }],
    [
      "castSpell",
      {
        key: "c",
        kind: "castSpell",
        spellId: "s1",
        spellName: "Fireball",
        spellLevel: 3,
        castLevel: 5,
        resource: "charges",
        uses: 1,
        concentration: false,
        dcMode: "fixed",
        dcValue: 17,
        attackMode: "wielder",
        chargeCost: 5,
      },
    ],
    ["grant", { key: "c", kind: "grant", grantType: "resistance", grantValueKind: "damageType", grantValue: "fire", cantBeSurprised: false }],
    [
      "activatedEffect",
      {
        key: "c",
        kind: "activatedEffect",
        activation: "action",
        target: "ac",
        op: "add",
        value: 2,
        duration: "untilRest",
        resourceKind: "charges",
        resourceCharges: 1,
        chargeCost: 1,
      },
    ],
  ])("accepts a well-formed %s capability", (_kind, blob) => {
    const result = snapshotCapabilitySchema.safeParse(blob);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  // The payoff of the union over a flat column mirror: this is unrepresentable
  // rather than merely wrong. readCapability tolerates it as OpaqueCapability.
  it("rejects a charges entry with no maxCharges", () => {
    expect(snapshotCapabilitySchema.safeParse({ key: "c", kind: "charges", rechargeTrigger: "dawn" }).success).toBe(false);
  });

  it("rejects the mutable `used` counter", () => {
    expect(snapshotCapabilitySchema.safeParse({ ...PASSIVE, used: 3 }).success).toBe(false);
  });

  it("rejects an entry with no key", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure-drop is the idiomatic way to build a blob missing one property
    const { key: _dropped, ...keyless } = PASSIVE;
    expect(snapshotCapabilitySchema.safeParse(keyless).success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(snapshotCapabilitySchema.safeParse({ key: "c", kind: "teleport" }).success).toBe(false);
  });
});

// A fully-populated blob: every optional branch present at once, so a field
// accidentally required-by-omission shows up here rather than in #1648.
const FULL = {
  version: 1,
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
  weapon: {
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
  armor: null,
  consumable: null,
  capabilities: [PASSIVE],
};

describe("inventorySnapshotSchema — frozen definition data only (#1647)", () => {
  it("accepts a fully-populated blob", () => {
    const result = inventorySnapshotSchema.safeParse(FULL);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("accepts a minimal gear blob", () => {
    expect(inventorySnapshotSchema.safeParse({ version: 1, name: "Torch", category: "gear", capabilities: [] }).success).toBe(true);
  });

  // The invariant. Each of these is a COLUMN; a blob carrying one means a
  // writer confused frozen definition with runtime state.
  it.each(["quantity", "equippedSlot", "attuned", "notes", "position", "activatedUsesSpent"])(
    "rejects the mutable field %s",
    (field) => {
      expect(inventorySnapshotSchema.safeParse({ ...FULL, [field]: 1 }).success).toBe(false);
    },
  );

  it("rejects usesRemaining nested in the consumable branch", () => {
    const blob = {
      version: 1,
      name: "Potion of Healing",
      category: "consumable",
      consumable: { effectDiceCount: 2, effectDiceFaces: 4, effectDescription: "Heals", maxUses: 3, usesRemaining: 1 },
      capabilities: [],
    };
    expect(inventorySnapshotSchema.safeParse(blob).success).toBe(false);
  });

  it("rejects a missing version", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure-drop is the idiomatic way to build a blob missing one property
    const { version: _dropped, ...withoutVersion } = FULL;
    expect(inventorySnapshotSchema.safeParse(withoutVersion).success).toBe(false);
  });

  it("rejects an unknown version", () => {
    expect(inventorySnapshotSchema.safeParse({ ...FULL, version: 2 }).success).toBe(false);
  });

  it("rejects an unknown category", () => {
    expect(inventorySnapshotSchema.safeParse({ ...FULL, category: "relic" }).success).toBe(false);
  });

  // A duplicate key would make an InventoryCapabilityUse row ambiguous about
  // which capability it counts (#1648).
  it("rejects duplicate capability keys", () => {
    expect(inventorySnapshotSchema.safeParse({ ...FULL, capabilities: [PASSIVE, { ...PASSIVE, value: 2 }] }).success).toBe(false);
  });
});

describe("the tuples #1647 moved stay in step with their unions", () => {
  it("latches each new tuple", () => {
    expectTypeOf<(typeof ACTIVATION_TYPES)[number]>().toEqualTypeOf<ActivationType>();
    expectTypeOf<(typeof ACTIVATED_DURATIONS)[number]>().toEqualTypeOf<ActivatedDurationKind>();
    expectTypeOf<(typeof ITEM_RESOURCE_KINDS)[number]>().toEqualTypeOf<ItemResourceKind>();
    expectTypeOf<(typeof ITEM_RESOURCE_PERIODS)[number]>().toEqualTypeOf<ItemResourcePeriod>();
  });

  // ITEM_RARITIES is a rules table, not a union — latch against its keys.
  it("ITEM_RARITY_KEYS covers exactly the rarity tiers the rules table defines", () => {
    expect([...ITEM_RARITY_KEYS].sort()).toEqual(ITEM_RARITIES.map((r) => r.key).sort());
  });
});
