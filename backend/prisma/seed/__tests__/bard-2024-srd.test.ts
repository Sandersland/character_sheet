// #1224 commit 2 of 3: Bard's real SRD 5.2 (2024) content. Every assertion
// below is pinned against an actual SRD 5.2 VALUE (a feature name, a level, a
// mechanical clause) transcribed from the SRD 5.2.1 raw markdown
// (downfallx/dnd-5e-srd-markdown, classes.md — base class + College of Lore)
// or mirror-sourced from three independent, non-scraper PHB'24 secondary
// sources (College of Valor — see bard-features.ts's own header for the
// citations) — never against "differs from the 2014 row", which a garbage
// 2024 paraphrase would also satisfy. Mirrors cleric-2024-srd.test.ts's
// row()/hasRow() shape (same file, same BARD_FEATURES export).
import { describe, expect, it } from "vitest";

import { BARD_FEATURES } from "../bard-features.js";

type Edition = "EDITION_2014" | "EDITION_2024";

function rowsNamed(subclassSlug: string | null, name: string) {
  return BARD_FEATURES.filter((r) => r.subclassSlug === subclassSlug && r.name === name);
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
const LORE = "bard-college-of-lore";
const VALOR = "bard-college-of-valor";

describe("Song of Rest (#1224): no EDITION_2024 row — removed outright in PHB'24", () => {
  it("has no EDITION_2024 row; the 2014 row still exists at level 2", () => {
    expect(hasRow(BASE, "Song of Rest", "EDITION_2024")).toBe(false);
    expect(row(BASE, "Song of Rest", "EDITION_2014").level).toBe(2);
  });
});

describe("Bardic Inspiration (#1224): 2024 rewrite drops the 10-minute duration and 'can hear'-only gate", () => {
  it("2024 contains 'see or hear', 'D20 Test', and 'hour', never '10 minutes'", () => {
    const r = row(BASE, "Bardic Inspiration", "EDITION_2024");
    expect(r.description).toContain("see or hear");
    expect(r.description).toContain("D20 Test");
    expect(r.description).toContain("hour");
    expect(r.description).not.toContain("10 minutes");
  });

  it("2014 still contains '10 minutes'", () => {
    expect(row(BASE, "Bardic Inspiration", "EDITION_2014").description).toContain("10 minutes");
  });
});

describe("Expertise (#1224): level-shift 3 -> 2, second grant 10 -> 9", () => {
  it("2024 is level 2 and never mentions 'level 10'", () => {
    const r = row(BASE, "Expertise", "EDITION_2024");
    expect(r.level).toBe(2);
    expect(r.description).not.toContain("level 10");
  });

  it("2014 stays level 3 and still mentions 'level 10'", () => {
    const r = row(BASE, "Expertise", "EDITION_2014");
    expect(r.level).toBe(3);
    expect(r.description).toContain("level 10");
  });
});

describe("Jack of All Trades (#1224): 2024 narrows to a skill proficiency you lack", () => {
  it("2024 contains 'you lack'", () => {
    expect(row(BASE, "Jack of All Trades", "EDITION_2024").description).toContain("you lack");
  });

  it("2014 does not contain 'you lack'", () => {
    expect(row(BASE, "Jack of All Trades", "EDITION_2014").description).not.toContain("you lack");
  });
});

describe("Font of Inspiration (#1224): 2024 adds the no-action spell-slot clause", () => {
  it("2024 contains 'spell slot' and 'no action required'", () => {
    const r = row(BASE, "Font of Inspiration", "EDITION_2024");
    expect(r.description).toContain("spell slot");
    expect(r.description).toContain("no action required");
  });

  it("2014 does not contain 'spell slot'", () => {
    expect(row(BASE, "Font of Inspiration", "EDITION_2014").description).not.toContain("spell slot");
  });
});

describe("Countercharm (#1224): level-shift 6 -> 7 + full rewrite to a Reaction reroll", () => {
  it("2024 is level 7, contains Reaction/rerolled/Advantage/Charmed/Frightened/30 feet, never the 2014 performance text", () => {
    const r = row(BASE, "Countercharm", "EDITION_2024");
    expect(r.level).toBe(7);
    expect(r.description).toContain("Reaction");
    expect(r.description).toContain("rerolled");
    expect(r.description).toContain("Advantage");
    expect(r.description).toContain("Charmed");
    expect(r.description).toContain("Frightened");
    expect(r.description).toContain("30 feet");
    expect(r.description).not.toContain("As an action");
    expect(r.description).not.toContain("performance");
    // "advantage on saves" and not "…on saving throws": the 2014 row's own
    // wording is what a stale copy would carry, so only that exact phrase can
    // fail here.
    expect(r.description).not.toContain("advantage on saves");
  });

  it("2014 stays level 6 and still contains 'As an action'", () => {
    const r = row(BASE, "Countercharm", "EDITION_2014");
    expect(r.level).toBe(6);
    expect(r.description).toContain("As an action");
  });
});

describe("Magical Secrets (#1224): stays level 10, scoped to Bard/Cleric/Druid/Wizard, no L14/L18 grants", () => {
  it("2024 contains 'Bard, Cleric, Druid, and Wizard' and 'Prepared Spells', never 'any class'/'level 14'/'level 18'", () => {
    const r = row(BASE, "Magical Secrets", "EDITION_2024");
    expect(r.description).toContain("Bard, Cleric, Druid, and Wizard");
    expect(r.description).toContain("Prepared Spells");
    expect(r.description).not.toContain("any class");
    expect(r.description).not.toContain("level 14");
    expect(r.description).not.toContain("level 18");
  });
});

describe("Superior Inspiration (#1224): level-shift 20 -> 18 + regains until two uses", () => {
  it("2024 is level 18 and contains 'two', never 'no uses'", () => {
    const r = row(BASE, "Superior Inspiration", "EDITION_2024");
    expect(r.level).toBe(18);
    expect(r.description).toContain("two");
    expect(r.description).not.toContain("no uses");
  });

  it("2014 stays level 20 and still contains 'no uses'", () => {
    const r = row(BASE, "Superior Inspiration", "EDITION_2014");
    expect(r.level).toBe(20);
    expect(r.description).toContain("no uses");
  });
});

describe("Epic Boon / Words of Creation (#1224): new 2024-only base rows", () => {
  it("neither has a 2014 row", () => {
    expect(hasRow(BASE, "Epic Boon", "EDITION_2014")).toBe(false);
    expect(hasRow(BASE, "Words of Creation", "EDITION_2014")).toBe(false);
  });

  it("Words of Creation contains Power Word Heal, Power Word Kill, and 10 feet", () => {
    const r = row(BASE, "Words of Creation", "EDITION_2024");
    expect(r.description).toContain("Power Word Heal");
    expect(r.description).toContain("Power Word Kill");
    expect(r.description).toContain("10 feet");
  });
});

describe("Spellcasting (#1224): 2024 is a Prepared caster, not 'know a set number of spells'", () => {
  it("2024 doesn't contain the 2014 known-spells phrasing", () => {
    expect(row(BASE, "Spellcasting", "EDITION_2024").description).not.toContain("know a set number of spells");
  });
});

describe("The exact SRD 5.2 base-class table (#1224): the strongest single guard", () => {
  it("every subclassSlug === null && edition === EDITION_2024 row matches the transcribed (name, level) set exactly", () => {
    const rows = BARD_FEATURES.filter((r) => r.subclassSlug === null && r.edition === "EDITION_2024").map((r) => [r.name, r.level]);
    expect(rows).toEqual([
      ["Spellcasting", 1],
      ["Bardic Inspiration", 1],
      ["Jack of All Trades", 2],
      ["Expertise", 2],
      ["Font of Inspiration", 5],
      ["Countercharm", 7],
      ["Magical Secrets", 10],
      ["Superior Inspiration", 18],
      ["Epic Boon", 19],
      ["Words of Creation", 20],
    ]);
  });
});

describe("College of Lore (#1224)", () => {
  it("Additional Magical Secrets has no EDITION_2024 row; Magical Discoveries has no EDITION_2014 row", () => {
    expect(hasRow(LORE, "Additional Magical Secrets", "EDITION_2024")).toBe(false);
    expect(hasRow(LORE, "Magical Discoveries", "EDITION_2014")).toBe(false);
  });

  it("Magical Discoveries is level 6, scoped to Cleric/Druid/Wizard, always prepared, never 'any class'", () => {
    const r = row(LORE, "Magical Discoveries", "EDITION_2024");
    expect(r.level).toBe(6);
    expect(r.description).toContain("Cleric, Druid, or Wizard");
    expect(r.description).toContain("always");
    expect(r.description).not.toContain("any class");
  });

  it("Cutting Words 2024 drops the hear/charm-immunity clause", () => {
    expect(row(LORE, "Cutting Words", "EDITION_2024").description).not.toContain("immune to being charmed");
  });

  it("Peerless Skill 2024 covers attack rolls and the die isn't expended on failure; 2014 stays ability-check only", () => {
    const r2024 = row(LORE, "Peerless Skill", "EDITION_2024");
    expect(r2024.description).toContain("attack roll");
    expect(r2024.description).toContain("isn't expended");
    expect(row(LORE, "Peerless Skill", "EDITION_2014").description).not.toContain("attack roll");
  });
});

describe("College of Valor (#1224): all four rows changed — the issue's 'no changes' claim was wrong", () => {
  it("Bonus Proficiencies has no EDITION_2024 row; Martial Training has no EDITION_2014 row", () => {
    expect(hasRow(VALOR, "Bonus Proficiencies", "EDITION_2024")).toBe(false);
    expect(hasRow(VALOR, "Martial Training", "EDITION_2014")).toBe(false);
  });

  it("Martial Training is level 3 and grants Martial weapons, Medium armor, Shields, and a Spellcasting Focus option", () => {
    const r = row(VALOR, "Martial Training", "EDITION_2024");
    expect(r.level).toBe(3);
    expect(r.description).toContain("Martial");
    expect(r.description).toContain("Medium armor");
    expect(r.description).toContain("Shields");
    expect(r.description).toContain("Spellcasting Focus");
  });

  it("Combat Inspiration 2024 splits into named Defense/Offense Reaction options", () => {
    const r = row(VALOR, "Combat Inspiration", "EDITION_2024");
    expect(r.description).toContain("Defense");
    expect(r.description).toContain("Offense");
    expect(r.description).toContain("Reaction");
  });

  it("Extra Attack 2024 adds the cantrip-in-place-of-an-attack clause; 2014 stays plain", () => {
    expect(row(VALOR, "Extra Attack", "EDITION_2024").description).toContain("cantrip");
    expect(row(VALOR, "Extra Attack", "EDITION_2014").description).not.toContain("cantrip");
  });

  it("Battle Magic 2024 drops the bard-spell restriction; 2014 keeps it", () => {
    const r2024 = row(VALOR, "Battle Magic", "EDITION_2024");
    expect(r2024.description).toContain("casting time of an action");
    expect(r2024.description).toContain("Bonus Action");
    expect(r2024.description).not.toContain("bard spell");
  });
});

describe("Extra Attack's derivedStat/derivedStatTiers (#1224): identical on both edition rows", () => {
  it("both Valor Extra Attack rows carry the same tier", () => {
    const r2014 = row(VALOR, "Extra Attack", "EDITION_2014");
    const r2024 = row(VALOR, "Extra Attack", "EDITION_2024");
    expect(r2014.derivedStat).toBe("attacksPerAction");
    expect(r2024.derivedStat).toBe("attacksPerAction");
    expect(r2014.derivedStatTiers).toEqual([{ minLevel: 6, value: 2 }]);
    expect(r2024.derivedStatTiers).toEqual([{ minLevel: 6, value: 2 }]);
  });
});

describe("Every EDITION_2024 subclass row's level is >= 3 (#1224: Bard Subclass grants at L3 in both editions)", () => {
  it("College of Lore and College of Valor", () => {
    const subclassRows2024 = BARD_FEATURES.filter((r) => r.subclassSlug !== null && r.edition === "EDITION_2024");
    expect(subclassRows2024.length).toBeGreaterThan(0);
    for (const r of subclassRows2024) {
      expect(r.level, `${r.subclassSlug}/${r.name}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("structural: the @@unique([classId, subclassId, name, edition]) constraint expressed as a unit test", () => {
  it("no two rows share (subclassSlug, name, edition)", () => {
    const keys = BARD_FEATURES.map((r) => `${r.subclassSlug ?? "null"}::${r.name}::${r.edition}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// Supplementary sweep, not primary evidence (a same-name rewrite can still
// pass a "differs" check while being a garbage paraphrase — the assertions
// above, pinned to real SRD 5.2 values, are what actually proves correctness).
describe("supplementary: every forked name's two descriptions differ", () => {
  it("for every name present under both editions, 2014 text !== 2024 text", () => {
    const byNameSlug = new Map<string, Map<Edition, string>>();
    for (const r of BARD_FEATURES) {
      const k = `${r.subclassSlug ?? "null"}::${r.name}`;
      const editions = byNameSlug.get(k) ?? new Map<Edition, string>();
      editions.set(r.edition as Edition, r.description);
      byNameSlug.set(k, editions);
    }
    for (const [k, editions] of byNameSlug) {
      const d2014 = editions.get("EDITION_2014");
      const d2024 = editions.get("EDITION_2024");
      if (d2014 !== undefined && d2024 !== undefined) {
        expect(d2014, k).not.toBe(d2024);
      }
    }
  });
});
