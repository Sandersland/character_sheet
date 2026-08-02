// #1225 commit 2 of 3: Cleric's real SRD 5.2 (2024) content. Every assertion
// below is pinned against an actual SRD 5.2 VALUE (a spell name, a damage
// die, a saving throw ability, a level) transcribed from the official SRD 5.2
// CC-BY PDF (base class + Life Domain, pp. 36-40) or mirror-sourced from two
// independent, non-scraper PHB'24 secondary sources (Trickery Domain — see
// cleric-features.ts's own header for the citations) — never against
// "differs from the 2014 row", which a garbage 2024 paraphrase would also
// satisfy. Mirrors warlock-2024-srd.test.ts's row()/hasRow() shape (same
// file, same CLERIC_FEATURES export).
import { describe, expect, it } from "vitest";

import { CLERIC_FEATURES } from "../cleric-features.js";

type Edition = "EDITION_2014" | "EDITION_2024";

function rowsNamed(subclassSlug: string | null, name: string) {
  return CLERIC_FEATURES.filter((r) => r.subclassSlug === subclassSlug && r.name === name);
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
const LIFE = "cleric-life-domain";
const TRICKERY = "cleric-trickery-domain";

describe("Domain Spells (#1225): no EDITION_2024 row survives for either domain — the strongest single stale-copy detector", () => {
  it.each([LIFE, TRICKERY])("%s has no EDITION_2024 Domain Spells row", (subclassSlug) => {
    expect(hasRow(subclassSlug, "Domain Spells", "EDITION_2024")).toBe(false);
  });
});

describe("Destroy Undead / Divine Intervention Improvement (#1225): no EDITION_2024 row — each replaced by a differently-named successor", () => {
  it("Destroy Undead has no EDITION_2024 row", () => {
    expect(hasRow(BASE, "Destroy Undead", "EDITION_2024")).toBe(false);
  });
  it("Divine Intervention Improvement has no EDITION_2024 row", () => {
    expect(hasRow(BASE, "Divine Intervention Improvement", "EDITION_2024")).toBe(false);
  });
});

describe("Life Domain Spells (#1225): the real SRD 5.2 table, transcribed from p.40", () => {
  it("contains Aid/Bless/Cure Wounds/Lesser Restoration and Greater Restoration, never the 2014 list's Spiritual Weapon/Guardian of Faith/Raise Dead", () => {
    const r = row(LIFE, "Life Domain Spells", "EDITION_2024");
    expect(r.level).toBe(3);
    expect(r.description).toContain("Aid, Bless, Cure Wounds, Lesser Restoration");
    expect(r.description).toContain("Greater Restoration");
    expect(r.description).not.toContain("Spiritual Weapon");
    expect(r.description).not.toContain("Guardian of Faith");
    expect(r.description).not.toContain("Raise Dead");
  });
});

describe("Trickery Domain Spells (#1225, mirror-sourced): not the 2014 list", () => {
  it("contains Invisibility and Hypnotic Pattern, never the 2014 list's Mirror Image/Blink/Polymorph", () => {
    const r = row(TRICKERY, "Trickery Domain Spells", "EDITION_2024");
    expect(r.level).toBe(3);
    expect(r.description).toContain("Invisibility");
    expect(r.description).toContain("Hypnotic Pattern");
    expect(r.description).not.toContain("Mirror Image");
    expect(r.description).not.toContain("Blink");
    expect(r.description).not.toContain("Polymorph");
  });
});

describe("Channel Divinity: Turn Undead (#1225): SRD 5.2 targeting + early-end clause", () => {
  it("2024 contains Frightened, Incapacitated, and 'of your choice'; never the 2014 'can see or hear you' gate", () => {
    const r = row(BASE, "Channel Divinity: Turn Undead", "EDITION_2024");
    expect(r.description).toContain("Frightened");
    expect(r.description).toContain("Incapacitated");
    expect(r.description).toContain("of your choice");
    expect(r.description).not.toContain("can see or hear you");
  });

  it("2014 keeps the 'can see or hear you' gate", () => {
    expect(row(BASE, "Channel Divinity: Turn Undead", "EDITION_2014").description).toContain("can see or hear you");
  });
});

describe("Sear Undead (#1225): the real SRD 5.2 rename, L5, doesn't end the turn effect", () => {
  it("is at level 5 and contains the load-bearing 'doesn't end the turn effect' clause", () => {
    const r = row(BASE, "Sear Undead", "EDITION_2024");
    expect(r.level).toBe(5);
    expect(r.description).toContain("doesn't end the turn effect");
  });
});

describe("Channel Divinity: Divine Spark (#1225): NEW in 2024", () => {
  it("contains 1d8, a Constitution saving throw, and scales to 4d8", () => {
    const r = row(BASE, "Channel Divinity: Divine Spark", "EDITION_2024");
    expect(r.description).toContain("1d8");
    expect(r.description).toContain("Constitution saving throw");
    expect(r.description).toContain("4d8");
  });
});

describe("Divine Intervention (#1225): guaranteed, no-Reaction spell, Material components only", () => {
  it("2024 contains 'doesn't require a Reaction' and 'Material components', never the 2014 percentile roll", () => {
    const r = row(BASE, "Divine Intervention", "EDITION_2024");
    expect(r.description).toContain("doesn't require a Reaction");
    expect(r.description).toContain("Material components");
    expect(r.description).not.toContain("percentile");
  });
});

describe("Greater Divine Intervention (#1225): the real SRD 5.2 rename", () => {
  it("contains Wish and 2d4 Long Rests", () => {
    const r = row(BASE, "Greater Divine Intervention", "EDITION_2024");
    expect(r.description).toContain("Wish");
    expect(r.description).toContain("2d4 Long Rests");
  });
});

describe("Life Domain fork levels (#1225): subclass features shift to L3", () => {
  it("Channel Divinity: Preserve Life is L3 and mentions Bloodied", () => {
    const r = row(LIFE, "Channel Divinity: Preserve Life", "EDITION_2024");
    expect(r.level).toBe(3);
    expect(r.description).toContain("Bloodied");
  });

  it("Disciple of Life is L3 under 2024 while the 2014 row stays L1", () => {
    expect(row(LIFE, "Disciple of Life", "EDITION_2024").level).toBe(3);
    expect(row(LIFE, "Disciple of Life", "EDITION_2014").level).toBe(1);
  });
});

describe("Trickery Domain fork levels + mechanics (#1225, mirror-sourced)", () => {
  it("Channel Divinity: Invoke Duplicity is L3, mentions Bonus Action, and explicitly drops Concentration", () => {
    const r = row(TRICKERY, "Channel Divinity: Invoke Duplicity", "EDITION_2024");
    expect(r.level).toBe(3);
    expect(r.description).toContain("Bonus Action");
    expect(r.description).toContain("no Concentration required");
  });

  it("Improved Duplicity is Shared Distraction + Healing Illusion, never the 2014 row's four duplicates", () => {
    const r = row(TRICKERY, "Improved Duplicity", "EDITION_2024");
    expect(r.description).toContain("Shared Distraction");
    expect(r.description).toContain("Healing Illusion");
    expect(r.description).not.toContain("four duplicates");
  });
});

describe("Every EDITION_2024 subclass row's level is >= 3 (#1225: Cleric Subclass now grants at L3)", () => {
  it("Life Domain and Trickery Domain", () => {
    const subclassRows2024 = CLERIC_FEATURES.filter((r) => r.subclassSlug !== null && r.edition === "EDITION_2024");
    expect(subclassRows2024.length).toBeGreaterThan(0);
    for (const r of subclassRows2024) {
      expect(r.level, `${r.subclassSlug}/${r.name}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("structural: the @@unique([classId, subclassId, name, edition]) constraint expressed as a unit test", () => {
  it("no two rows share (subclassSlug, name, edition)", () => {
    const keys = CLERIC_FEATURES.map((r) => `${r.subclassSlug ?? "null"}::${r.name}::${r.edition}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
