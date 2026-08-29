import { describe, expect, it } from "vitest";

import { deriveDeflectSpec, deflectEnergyAugmentor, DEFLECT_ENERGY_LEVEL } from "@/lib/srd/deflect.js";
import type { AugmentorContext } from "@/lib/classes/announce-augmentors.js";
import type { AvailableAction } from "@/lib/classes/actions.js";

describe("deriveDeflectSpec — reduction (edition-invariant: 1d10 + Dex + monk level)", () => {
  it("is 1d10 + 8 for a level-5 monk with Dex +3", () => {
    expect(deriveDeflectSpec(5, 3, "EDITION_2024").reduction).toEqual({ count: 1, faces: 10, modifier: 8 });
    expect(deriveDeflectSpec(5, 3, "EDITION_2014").reduction).toEqual({ count: 1, faces: 10, modifier: 8 });
  });

  it("scales the flat modifier with monk level — 1d10 + 16 at level 13", () => {
    expect(deriveDeflectSpec(13, 3, "EDITION_2024").reduction).toEqual({ count: 1, faces: 10, modifier: 16 });
  });
});

describe("deriveDeflectSpec — redirect (edition-forked)", () => {
  it("SRD 5.2: two Martial Arts die rolls + Dex modifier (a Dexterity save)", () => {
    expect(deriveDeflectSpec(5, 3, "EDITION_2024").redirect).toEqual({ count: 2, faces: 8, modifier: 3 });
    expect(deriveDeflectSpec(11, 3, "EDITION_2024").redirect).toEqual({ count: 2, faces: 10, modifier: 3 });
  });

  it("SRD 5.1: 1d6 + Dex modifier (the caught-missile throw-back, an attack roll)", () => {
    expect(deriveDeflectSpec(5, 3, "EDITION_2014").redirect).toEqual({ count: 1, faces: 6, modifier: 3 });
    // SRD 5.1: die size does not scale, always 1d6.
    expect(deriveDeflectSpec(17, 3, "EDITION_2014").redirect).toEqual({ count: 1, faces: 6, modifier: 3 });
  });
});

const DEFLECT_ATTACKS: AvailableAction = { key: "deflectAttacks", name: "Deflect Attacks", cost: "reaction", enabled: true };

// SRD 5.2 / PHB'24 p.89: damageTypeClause fires from level 3, not just 13+.
describe("deflectEnergyAugmentor", () => {
  it("targets only deflectAttacks (SRD 5.1's Deflect Missiles carries no such clause)", () => {
    expect(deflectEnergyAugmentor.targetKeys).toEqual(["deflectAttacks"]);
  });

  it("appliesTo is true for any 2024 monk, regardless of level (gates on edition alone)", () => {
    const ctx: AugmentorContext = { slug: undefined, entryLevel: 3, edition: "EDITION_2024" };
    expect(deflectEnergyAugmentor.appliesTo(ctx)).toBe(true);
    expect(deflectEnergyAugmentor.appliesTo({ ...ctx, entryLevel: 1 })).toBe(true);
  });

  it("appliesTo is false in 2014 (Deflect Missiles never widens)", () => {
    const ctx: AugmentorContext = { slug: undefined, entryLevel: DEFLECT_ENERGY_LEVEL, edition: "EDITION_2014" };
    expect(deflectEnergyAugmentor.appliesTo(ctx)).toBe(false);
  });

  it("augment resolves the B/P/S clause below L13", () => {
    const ctx: AugmentorContext = { slug: undefined, entryLevel: DEFLECT_ENERGY_LEVEL - 1, edition: "EDITION_2024" };
    expect(deflectEnergyAugmentor.augment(DEFLECT_ATTACKS, ctx)).toEqual({
      damageTypeClause: "bludgeoning, piercing, or slashing damage",
    });
  });

  it("augment widens to 'any damage type' at L13+", () => {
    const ctx: AugmentorContext = { slug: undefined, entryLevel: DEFLECT_ENERGY_LEVEL, edition: "EDITION_2024" };
    expect(deflectEnergyAugmentor.augment(DEFLECT_ATTACKS, ctx)).toEqual({ damageTypeClause: "any damage type" });
  });
});
