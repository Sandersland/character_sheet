import { describe, it, expect } from "vitest";

import { draconicResilienceMaxHpTerm, type DraconicSorcererEntry } from "@/lib/classes/draconic-bloodline.js";

const entry = (over: Partial<DraconicSorcererEntry> = {}): DraconicSorcererEntry => ({
  name: "Sorcerer",
  level: 5,
  subclass: "Draconic Bloodline",
  subclassRef: null,
  class: { subclassLevel: 1 },
  ...over,
});

describe("draconicResilienceMaxHpTerm (#1123)", () => {
  it("resolves the term for a Draconic sorcerer (2014 L5 → +5)", () => {
    expect(draconicResilienceMaxHpTerm([entry()], 5, "EDITION_2014")).toBe(5);
  });

  it("returns 0 for a non-Draconic subclass", () => {
    expect(draconicResilienceMaxHpTerm([entry({ subclass: "Wild Magic" })], 5, "EDITION_2014")).toBe(0);
  });

  it("returns 0 for a character with no sorcerer entry", () => {
    expect(draconicResilienceMaxHpTerm([entry({ name: "Fighter", subclass: "Champion" })], 5, "EDITION_2014")).toBe(0);
  });

  it("resolves via the subclassRef FK slug when the name has drifted", () => {
    expect(
      draconicResilienceMaxHpTerm(
        [entry({ subclass: "My Homebrew Rename", subclassRef: { slug: "sorcerer-draconic-bloodline" } })],
        5,
        "EDITION_2014",
      ),
    ).toBe(5);
  });

  // A null class FK (classId SetNull / free-text class) loses the seeded
  // subclassLevel — the sole PHB'14 p.99 gate-1 source — so the character
  // gates at subclassGateLevel's plain 3, the same answer isSubclassActive
  // gives, keeping the HP term and the feature gate consistent.
  it("2014 with a null class FK degrades to the plain gate 3, matching the feature gate", () => {
    expect(draconicResilienceMaxHpTerm([entry({ level: 1, class: null })], 1, "EDITION_2014")).toBe(0);
    expect(draconicResilienceMaxHpTerm([entry({ level: 2, class: null })], 2, "EDITION_2014")).toBe(0);
    expect(draconicResilienceMaxHpTerm([entry({ level: 3, class: null })], 3, "EDITION_2014")).toBe(3);
  });

  it("2014 with the seeded gate carried resolves PHB'14 p.99's gate 1 (+1 per sorcerer level from L1)", () => {
    expect(draconicResilienceMaxHpTerm([entry({ level: 1 })], 1, "EDITION_2014")).toBe(1);
    expect(draconicResilienceMaxHpTerm([entry({ level: 2 })], 2, "EDITION_2014")).toBe(2);
  });

  it("2024 ignores the null class FK too — the gate is always 3", () => {
    expect(draconicResilienceMaxHpTerm([entry({ level: 2, class: null })], 2, "EDITION_2024")).toBe(0);
    expect(draconicResilienceMaxHpTerm([entry({ level: 3, class: null })], 3, "EDITION_2024")).toBe(3);
  });

  it("single-class: the XP-derived total level wins over a stale level column", () => {
    expect(draconicResilienceMaxHpTerm([entry({ level: 4 })], 5, "EDITION_2014")).toBe(5);
  });

  it("multiclass: the sorcerer entry's OWN level wins over the total level", () => {
    const fighter = entry({ name: "Fighter", subclass: null, class: null, level: 2 });
    expect(draconicResilienceMaxHpTerm([entry({ level: 3 }), fighter], 5, "EDITION_2014")).toBe(3);
  });
});
