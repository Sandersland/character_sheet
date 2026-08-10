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

  // Null-FK guard: `class` is null (classId SetNull / free-text class). The
  // gate must fall back to sorcerer.ts's grantLevel 1 (PHB'14 p.99), not
  // subclassGateLevel's generic `?? 3` — which would wrongly zero the bonus
  // for a 2014 L1/L2 Draconic sorcerer.
  it("2014 L1 with a null class FK still gets +1 (grantLevel fallback, not the generic gate 3)", () => {
    expect(draconicResilienceMaxHpTerm([entry({ level: 1, class: null })], 1, "EDITION_2014")).toBe(1);
    expect(draconicResilienceMaxHpTerm([entry({ level: 2, class: null })], 2, "EDITION_2014")).toBe(2);
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
