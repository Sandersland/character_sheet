/**
 * The frozen/mutable line is the invariant the whole snapshot design rests on
 * (#1647, epic #1644): definition data goes in the JSON blob, runtime state
 * stays in columns. A schema that merely ACCEPTS the right shape is not enough
 * — zod v4 strips unknown keys by default, so a non-strict schema would take a
 * blob carrying `used` and silently discard it, surfacing as data loss in
 * #1648's dual-write. The reject cases are the real contract.
 */
import { describe, expect, it } from "vitest";

import { snapshotCapabilitySchema } from "@character-sheet/contracts";

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
