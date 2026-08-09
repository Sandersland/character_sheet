import { describe, expect, it } from "vitest";

import { deriveDeflectSpec } from "@/lib/srd/deflect.js";

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
