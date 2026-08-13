import { describe, expect, it } from "vitest";

import { deriveDeflectSpec, deflectEnergyAugmentor, DEFLECT_ENERGY_LEVEL } from "@/lib/srd/deflect.js";
import type { AugmentorContext } from "@/lib/classes/announce-augmentors.js";
import type { AvailableAction } from "@/lib/classes/actions.js";

// Assertions moved here from the retired frontend deflectAttacks.test.ts
// (deflectAttacksReductionRoll / deflectAttacksRedirectRoll /
// deflectMissilesThrowRoll) once the roll math moved server-side (#1435).
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
    // Monk L5, SRD 5.2 Martial Arts die = d8.
    expect(deriveDeflectSpec(5, 3, "EDITION_2024").redirect).toEqual({ count: 2, faces: 8, modifier: 3 });
    // Monk L11 → d10.
    expect(deriveDeflectSpec(11, 3, "EDITION_2024").redirect).toEqual({ count: 2, faces: 10, modifier: 3 });
  });

  it("SRD 5.1: 1d6 + Dex modifier (the caught-missile throw-back, an attack roll)", () => {
    expect(deriveDeflectSpec(5, 3, "EDITION_2014").redirect).toEqual({ count: 1, faces: 6, modifier: 3 });
    // Die size does not scale — the throw-back is always 1d6 in SRD 5.1.
    expect(deriveDeflectSpec(17, 3, "EDITION_2014").redirect).toEqual({ count: 1, faces: 6, modifier: 3 });
  });
});

const DEFLECT_ATTACKS: AvailableAction = { key: "deflectAttacks", name: "Deflect Attacks", cost: "reaction", enabled: true };

// #1912: Deflect Energy (Monk L13, SRD 5.2 / PHB'24 p.89) widens Deflect
// Attacks' damage-type clause — the SOLE source of `damageTypeClause` (the
// row itself sets none), so this fires from L3 (the row's own grant level),
// not just from L13 on.
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
