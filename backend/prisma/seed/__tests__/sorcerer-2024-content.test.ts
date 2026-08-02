// #1232 commit 2 of 3: Sorcerer's real SRD 5.2 / PHB'24 (2024) content. Every
// assertion below is pinned against an actual 2024 VALUE (a spell name, a
// damage number, a level, an SP cost) — never against "differs from the 2014
// row", which a garbage 2024 paraphrase would also satisfy. Mirrors
// warlock-2024-srd.test.ts's row()/hasRow() shape (same file,
// SORCERER_FEATURES export).
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { loadDbFeatureRows } from "@/lib/classes/__tests__/db-feature-rows.fixture.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { SORCERER_FEATURES } from "../sorcerer-features.js";

type Edition = "EDITION_2014" | "EDITION_2024";

function rowsNamed(subclassSlug: string | null, name: string) {
  return SORCERER_FEATURES.filter((r) => r.subclassSlug === subclassSlug && r.name === name);
}

/** Exactly one row for (subclassSlug, name, edition), or the test fails with a precise locator. */
function row(subclassSlug: string | null, name: string, edition: Edition) {
  const found = rowsNamed(subclassSlug, name).filter((r) => r.edition === edition);
  expect(found, `${subclassSlug ?? "(base)"}/${name}/${edition}`).toHaveLength(1);
  return found[0];
}

function hasRow(subclassSlug: string | null, name: string, edition: Edition): boolean {
  return rowsNamed(subclassSlug, name).some((r) => r.edition === edition);
}

const BASE = null;
const DRACONIC = "sorcerer-draconic-bloodline";
const WILD = "sorcerer-wild-magic";

describe("Sorcerous Origin -> Sorcerer Subclass (#1232): the 2024 rename, not a same-named fork", () => {
  it("Sorcerous Origin has no EDITION_2024 row; Sorcerer Subclass is level 3", () => {
    expect(hasRow(BASE, "Sorcerous Origin", "EDITION_2024")).toBe(false);
    expect(row(BASE, "Sorcerer Subclass", "EDITION_2024").level).toBe(3);
  });

  it("the EDITION_2014 Sorcerous Origin row survives at level 1", () => {
    expect(row(BASE, "Sorcerous Origin", "EDITION_2014").level).toBe(1);
  });
});

describe("Metamagic (#1232): level-shifts 3 -> 2, and the corrected 10-option list", () => {
  it("2024 is level 2 and names Seeking/Transmuted plus the level-10/level-17 milestones", () => {
    const r2024 = row(BASE, "Metamagic", "EDITION_2024");
    expect(r2024.level).toBe(2);
    expect(r2024.description).toContain("Seeking");
    expect(r2024.description).toContain("Transmuted");
    expect(r2024.description).toContain("level 10");
    expect(r2024.description).toContain("level 17");
  });

  it("2014 stays at level 3", () => {
    expect(row(BASE, "Metamagic", "EDITION_2014").level).toBe(3);
  });
});

describe("Sorcerous Restoration (#1232): level-shifts 20 -> 5, flat 4 SP becomes half-level", () => {
  it("2024 is level 5 and mentions half your Sorcerer level", () => {
    const r2024 = row(BASE, "Sorcerous Restoration", "EDITION_2024");
    expect(r2024.level).toBe(5);
    expect(r2024.description).toContain("half your Sorcerer level");
  });

  it("2014 stays level 20 and keeps the flat 4-Sorcery-Point regain", () => {
    const r2014 = row(BASE, "Sorcerous Restoration", "EDITION_2014");
    expect(r2014.level).toBe(20);
    expect(r2014.description).toContain("4 expended Sorcery Points");
  });
});

describe("Innate Sorcery / Sorcery Incarnate / Epic Boon / Arcane Apotheosis (#1232): NEW in 2024, no 2014 twin", () => {
  it("Innate Sorcery is at level 1", () => {
    expect(row(BASE, "Innate Sorcery", "EDITION_2024").level).toBe(1);
    expect(hasRow(BASE, "Innate Sorcery", "EDITION_2014")).toBe(false);
  });

  it("Sorcery Incarnate is at level 7", () => {
    expect(row(BASE, "Sorcery Incarnate", "EDITION_2024").level).toBe(7);
    expect(hasRow(BASE, "Sorcery Incarnate", "EDITION_2014")).toBe(false);
  });

  it("Epic Boon is at level 19", () => {
    expect(row(BASE, "Epic Boon", "EDITION_2024").level).toBe(19);
    expect(hasRow(BASE, "Epic Boon", "EDITION_2014")).toBe(false);
  });

  it("Arcane Apotheosis is at level 20", () => {
    expect(row(BASE, "Arcane Apotheosis", "EDITION_2024").level).toBe(20);
    expect(hasRow(BASE, "Arcane Apotheosis", "EDITION_2014")).toBe(false);
  });
});

describe("Draconic Resilience (#1232): unarmored AC changes from 13+Dex to 10+Dex+Cha", () => {
  it("2024 contains the new AC formula and never the old one, level 3", () => {
    const r2024 = row(DRACONIC, "Draconic Resilience", "EDITION_2024");
    expect(r2024.level).toBe(3);
    expect(r2024.description).toContain("10 plus your Dexterity and Charisma modifiers");
    expect(r2024.description).not.toContain("13 +");
  });

  it("2014 stays level 1 with the old formula", () => {
    const r2014 = row(DRACONIC, "Draconic Resilience", "EDITION_2014");
    expect(r2014.level).toBe(1);
    expect(r2014.description).toContain("13 + your Dexterity modifier");
  });
});

describe("Draconic Spells (#1232): NEW in 2024, a FIXED table with no dragon type", () => {
  it("is at level 3 and names all four tiers' spells", () => {
    const r = row(DRACONIC, "Draconic Spells", "EDITION_2024");
    expect(r.level).toBe(3);
    for (const spell of ["Alter Self", "Chromatic Orb", "Command", "Dragon's Breath", "Fear", "Fly", "Arcane Eye", "Charm Monster", "Legend Lore", "Summon Dragon"]) {
      expect(r.description, spell).toContain(spell);
    }
  });

  // The row first shipped saying the spells were "keyed to the dragon type you
  // choose", which is invented — SRD 5.2 grants the same ten spells to every
  // Draconic Sorcerer. It read plausibly because it is how 2014's Dragon
  // Ancestor framed things, which is exactly the "2014 text with a coat of
  // paint" failure this retab exists to prevent, so pin the absence.
  it("names no dragon type — 2024 dropped Dragon Ancestor, so nothing keys off one", () => {
    const r = row(DRACONIC, "Draconic Spells", "EDITION_2024");
    expect(r.description).not.toMatch(/dragon type/i);
    expect(r.description).not.toMatch(/dragon ancestor/i);
  });

  it("Dragon Ancestor has no EDITION_2024 row and no 2024 successor", () => {
    expect(hasRow(DRACONIC, "Dragon Ancestor", "EDITION_2024")).toBe(false);
    expect(row(DRACONIC, "Dragon Ancestor", "EDITION_2014").level).toBe(1);
  });
});

describe("Elemental Affinity (#1232): 2024 makes the damage type an explicit choice, not an inherited one", () => {
  // Same fabrication as Draconic Spells above, and the more consequential of
  // the two: the 2024 row shipped saying "the damage type associated with your
  // dragon ancestor", but 2024 deleted Dragon Ancestor, so SRD 5.2 has the
  // player choose from a closed list instead. A player reading the old text had
  // no way to know which type they had.
  it("2024 names the closed list and no ancestor", () => {
    const r = row(DRACONIC, "Elemental Affinity", "EDITION_2024");
    for (const type of ["Acid", "Cold", "Fire", "Lightning", "Poison"]) {
      expect(r.description, type).toContain(type);
    }
    expect(r.description).not.toMatch(/dragon ancestor/i);
  });

  it("2024 resistance is permanent — no Sorcery Point cost, no duration; 2014 keeps both", () => {
    const r2024 = row(DRACONIC, "Elemental Affinity", "EDITION_2024");
    expect(r2024.description).not.toMatch(/Sorcery Point/i);
    expect(r2024.description).not.toMatch(/1 hour/i);

    const r2014 = row(DRACONIC, "Elemental Affinity", "EDITION_2014");
    expect(r2014.description).toContain("1 Sorcery Point");
    expect(r2014.description).toContain("dragon ancestor");
  });
});

describe("Dragon Wings (#1232): reworked — 1 hour, flat 60-foot Fly Speed, once/Long Rest or 3 Sorcery Points", () => {
  it("2024 contains 60 feet and 3 Sorcery Points", () => {
    const r2024 = row(DRACONIC, "Dragon Wings", "EDITION_2024");
    expect(r2024.description).toContain("60 feet");
    expect(r2024.description).toContain("3 Sorcery Points");
  });

  it("2014 contains neither", () => {
    const r2014 = row(DRACONIC, "Dragon Wings", "EDITION_2014");
    expect(r2014.description).not.toContain("60 feet");
    expect(r2014.description).not.toContain("3 Sorcery Points");
  });
});

describe("Draconic Presence -> Dragon Companion (#1232): the L18 rename, not a same-named fork", () => {
  it("Draconic Presence has no EDITION_2024 row; Dragon Companion is level 18 and mentions Summon Dragon", () => {
    expect(hasRow(DRACONIC, "Draconic Presence", "EDITION_2024")).toBe(false);
    const r2024 = row(DRACONIC, "Dragon Companion", "EDITION_2024");
    expect(r2024.level).toBe(18);
    expect(r2024.description).toContain("Summon Dragon");
  });

  it("the EDITION_2014 Draconic Presence row survives at level 18", () => {
    expect(row(DRACONIC, "Draconic Presence", "EDITION_2014").level).toBe(18);
  });
});

describe("Elemental Affinity (#1232): 2024 drops the SP cost, becomes a permanent resistance", () => {
  it("2024 has no Sorcery Point spend for the resistance", () => {
    const r2024 = row(DRACONIC, "Elemental Affinity", "EDITION_2024");
    expect(r2024.description).not.toContain("spend 1 Sorcery Point");
    expect(r2024.description).toContain("Resistance");
  });

  it("2014 still spends 1 Sorcery Point for a 1-hour resistance", () => {
    expect(row(DRACONIC, "Elemental Affinity", "EDITION_2014").description).toContain("spend 1 Sorcery Point");
  });
});

describe("Wild Magic Surge (#1232): level-shifts 1 -> 3; the issue's own bullet is wrong on three counts", () => {
  it("2024 never mentions Innate Sorcery as a surge trigger (the issue's own bullet invented this)", () => {
    const r2024 = row(WILD, "Wild Magic Surge", "EDITION_2024");
    expect(r2024.level).toBe(3);
    expect(r2024.description).not.toContain("Innate Sorcery");
  });

  it("2024 states the once-per-turn limit and the with-a-spell-slot qualifier", () => {
    const r2024 = row(WILD, "Wild Magic Surge", "EDITION_2024");
    expect(r2024.description).toContain("Once per turn");
    expect(r2024.description).toContain("with a spell slot");
  });
});

describe("Tides of Chaos (#1232): the recharge causes the surge roll, not the other way around", () => {
  it("2024 states casting with a slot automatically triggers the surge roll", () => {
    const r2024 = row(WILD, "Tides of Chaos", "EDITION_2024");
    expect(r2024.level).toBe(3);
    expect(r2024.description).toContain("automatically triggers a roll on the Wild Magic Surge table");
  });
});

describe("Bend Luck (#1232): Sorcery Point cost drops from 2 to 1", () => {
  it("2024 contains 1 Sorcery Point and never 2 Sorcery Points", () => {
    const r2024 = row(WILD, "Bend Luck", "EDITION_2024");
    expect(r2024.description).toContain("1 Sorcery Point");
    expect(r2024.description).not.toContain("2 Sorcery Points");
  });

  it("2014 still spends 2 Sorcery Points", () => {
    expect(row(WILD, "Bend Luck", "EDITION_2014").description).toContain("2 Sorcery Points");
  });
});

describe("Spell Bombardment -> Tamed Surge (#1232): the L18 rename, not a same-named fork", () => {
  it("Spell Bombardment has no EDITION_2024 row; Tamed Surge is level 18", () => {
    expect(hasRow(WILD, "Spell Bombardment", "EDITION_2024")).toBe(false);
    expect(row(WILD, "Tamed Surge", "EDITION_2024").level).toBe(18);
  });

  it("the EDITION_2014 Spell Bombardment row survives at level 18", () => {
    expect(row(WILD, "Spell Bombardment", "EDITION_2014").level).toBe(18);
  });
});

describe("every 2024 subclass row's level is in {3,6,14,18}; every 2014 subclass row's level is in {1,6,14,18}", () => {
  it("Draconic Bloodline / Wild Magic", () => {
    for (const slug of [DRACONIC, WILD]) {
      for (const r of SORCERER_FEATURES.filter((f) => f.subclassSlug === slug && f.edition === "EDITION_2024")) {
        expect([3, 6, 14, 18], `${r.name} (2024)`).toContain(r.level);
      }
      for (const r of SORCERER_FEATURES.filter((f) => f.subclassSlug === slug && f.edition === "EDITION_2014")) {
        expect([1, 6, 14, 18], `${r.name} (2014)`).toContain(r.level);
      }
    }
  });
});

describe("structural: the @@unique([classId, subclassId, name, edition]) constraint expressed as a unit test", () => {
  it("no two rows share (subclassSlug, name, edition)", () => {
    const keys = SORCERER_FEATURES.map((r) => `${r.subclassSlug ?? "null"}::${r.name}::${r.edition}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("row counts (#1232): 2014 stays 15, 2024 is 19 (base 9 + Draconic 5 + Wild Magic 5)", () => {
  it("EDITION_2014 has exactly 15 rows", () => {
    expect(SORCERER_FEATURES.filter((r) => r.edition === "EDITION_2014")).toHaveLength(15);
  });

  it("EDITION_2024 has exactly 19 rows", () => {
    expect(SORCERER_FEATURES.filter((r) => r.edition === "EDITION_2024")).toHaveLength(19);
  });
});

const ABILITY_SCORES = {
  strength: 10,
  dexterity: 14,
  constitution: 12,
  intelligence: 8,
  wisdom: 13,
  charisma: 18,
};

// Integration-level proof (mirrors warlock-2024-srd.test.ts's
// loadDbFeatureRows pattern): the REAL seeded rows, read through the REAL
// derivation path, actually reach a serialized character's derived features —
// not just SORCERER_FEATURES' in-memory shape.
describe("integration (#1232): a level-20 Draconic Bloodline sorcerer's derived features differ by edition exactly where authored", () => {
  it("2024 has Sorcerer Subclass/Innate Sorcery/Dragon Companion and NOT Sorcerous Origin/Dragon Ancestor/Draconic Presence; 2014 is the reverse", async () => {
    const featureRows = await loadDbFeatureRows("sorcerer", "draconic bloodline");
    const profBonus = proficiencyBonusForLevel(20);

    const info2014 = deriveResources("sorcerer", "draconic bloodline", 20, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    const info2024 = deriveResources("sorcerer", "draconic bloodline", 20, ABILITY_SCORES, profBonus, featureRows, "EDITION_2024");

    const names2014 = new Set((info2014?.features ?? []).map((f) => f.name));
    const names2024 = new Set((info2024?.features ?? []).map((f) => f.name));

    expect(names2014.has("Sorcerous Origin")).toBe(true);
    expect(names2014.has("Dragon Ancestor")).toBe(true);
    expect(names2014.has("Draconic Presence")).toBe(true);
    expect(names2014.has("Sorcerer Subclass")).toBe(false);
    expect(names2014.has("Innate Sorcery")).toBe(false);
    expect(names2014.has("Dragon Companion")).toBe(false);

    expect(names2024.has("Sorcerer Subclass")).toBe(true);
    expect(names2024.has("Innate Sorcery")).toBe(true);
    expect(names2024.has("Dragon Companion")).toBe(true);
    expect(names2024.has("Sorcerous Origin")).toBe(false);
    expect(names2024.has("Dragon Ancestor")).toBe(false);
    expect(names2024.has("Draconic Presence")).toBe(false);
  });
});
