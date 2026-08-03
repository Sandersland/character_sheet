// capabilityColumnsFromSnapshot (#1649) — the inverse of readCapability, so
// every existing capability consumer (chargePoolOf, readCapability itself,
// deriveItemGrants/deriveItemPassiveBonuses, serializeCapability) keeps
// working unchanged once InventoryItem's capabilities come from the snapshot
// rather than the InventoryCapability table. Round-tripping a snapshot
// capability through this adapter and back through readCapability must
// reproduce the same Capability the pre-#1649 flat row would have.
import { describe, expect, it } from "vitest";

import type { SnapshotCapability } from "@character-sheet/contracts";
import { capabilityColumnsFromSnapshot, chargePoolOf, readCapability } from "@/lib/inventory/capabilities.js";

describe("capabilityColumnsFromSnapshot (#1649)", () => {
  it("round-trips a passiveBonus with dice through readCapability", () => {
    const snap: SnapshotCapability = {
      key: "cap-1",
      kind: "passiveBonus",
      target: "damage",
      op: "add",
      value: 0,
      dice: { count: 1, faces: 6, damageType: "fire" },
    };
    const row = capabilityColumnsFromSnapshot(snap, 0);
    expect(row.id).toBe("cap-1");
    expect(row.used).toBe(0);
    const cap = readCapability(row);
    expect(cap).toMatchObject({ kind: "passiveBonus", target: "damage", op: "add", value: 0, dice: { count: 1, faces: 6, damageType: "fire" } });
  });

  it("round-trips a castSpell capability, carrying `used` alongside it", () => {
    const snap: SnapshotCapability = {
      key: "cap-2",
      kind: "castSpell",
      spellId: "spell-1",
      spellName: "Witch Bolt",
      spellLevel: 1,
      castLevel: 1,
      resource: "perRestShort",
      uses: 2,
      concentration: true,
      dcMode: "fixed",
      dcValue: 15,
      attackMode: "fixed",
      chargeCost: 1,
    };
    const row = capabilityColumnsFromSnapshot(snap, 1);
    expect(row.used).toBe(1);
    expect(readCapability(row)).toMatchObject({
      kind: "castSpell",
      spellId: "spell-1",
      spellName: "Witch Bolt",
      resource: "perRestShort",
      uses: 2,
      concentration: true,
      dcValue: 15,
    });
  });

  it("round-trips an activatedEffect capability", () => {
    const snap: SnapshotCapability = {
      key: "cap-3",
      kind: "activatedEffect",
      activation: "bonus",
      target: "speed",
      op: "add",
      value: 30,
      duration: "untilRest",
      resourceKind: "perRest",
      resourcePeriod: "long",
      resourceCharges: 1,
      chargeCost: 1,
    };
    const row = capabilityColumnsFromSnapshot(snap, 0);
    expect(readCapability(row)).toMatchObject({
      kind: "activatedEffect",
      activation: "bonus",
      target: "speed",
      duration: "untilRest",
      resourceKind: "perRest",
      resourcePeriod: "long",
    });
  });

  it("round-trips a grant capability", () => {
    const snap: SnapshotCapability = {
      key: "cap-4",
      kind: "grant",
      grantType: "resistance",
      grantValueKind: "damageType",
      grantValue: "fire",
      cantBeSurprised: false,
    };
    const row = capabilityColumnsFromSnapshot(snap, 0);
    expect(readCapability(row)).toEqual({
      kind: "grant",
      grantType: "resistance",
      grantOn: null,
      grantValueKind: "damageType",
      grantValue: "fire",
      cantBeSurprised: false,
      description: null,
    });
  });

  it("round-trips a charges pool and is found by chargePoolOf, keyed off `id`/`used`", () => {
    const snap: SnapshotCapability = {
      key: "cap-pool",
      kind: "charges",
      maxCharges: 7,
      rechargeTrigger: "dawn",
      rechargeDice: { count: 1, faces: 6 },
      rechargeBonus: 1,
    };
    const row = capabilityColumnsFromSnapshot(snap, 4);
    expect(readCapability(row)).toEqual({
      kind: "charges",
      maxCharges: 7,
      rechargeTrigger: "dawn",
      rechargeDice: { count: 1, faces: 6 },
      rechargeBonus: 1,
      description: null,
    });
    const pool = chargePoolOf([row]);
    expect(pool?.cap.maxCharges).toBe(7);
    expect(pool?.row.id).toBe("cap-pool");
    expect(pool?.row.used).toBe(4);
  });
});
