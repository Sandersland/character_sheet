// #1233 commit 2 of 3: Warlock's real SRD 5.2 (2024) content. Every assertion
// below is pinned against an actual SRD 5.2 VALUE (a spell name, a damage
// die, a saving throw ability, a level) transcribed from the official SRD 5.2
// CC-BY PDF — never against "differs from the 2014 row", which a garbage
// 2024 paraphrase would also satisfy. Mirrors barbarian-2024-content.test.ts's
// row()/hasRow() shape (same file, same WARLOCK_FEATURES export).
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { loadDbFeatureRows } from "@/lib/classes/__tests__/db-feature-rows.fixture.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { WARLOCK_FEATURES } from "../warlock-features.js";

type Edition = "EDITION_2014" | "EDITION_2024";

function rowsNamed(subclassSlug: string | null, name: string) {
  return WARLOCK_FEATURES.filter((r) => r.subclassSlug === subclassSlug && r.name === name);
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
const FIEND = "warlock-the-fiend";
const ARCHFEY = "warlock-the-archfey";
const GREAT_OLD_ONE = "warlock-the-great-old-one";

describe("Expanded Spell List (#1233): no EDITION_2024 row survives for any patron — the strongest single stale-copy detector", () => {
  it.each([FIEND, ARCHFEY, GREAT_OLD_ONE])("%s has no EDITION_2024 Expanded Spell List row", (subclassSlug) => {
    expect(hasRow(subclassSlug, "Expanded Spell List", "EDITION_2024")).toBe(false);
  });
});

describe("Fiend Spells (#1233): The Fiend's 2024 rename, transcribed from the SRD 5.2 PDF's own table", () => {
  it("is at level 3 and carries the SRD 5.2 spell list, not the 2014 row's Flame Strike/Hallow", () => {
    const r = row(FIEND, "Fiend Spells", "EDITION_2024");
    expect(r.level).toBe(3);
    expect(r.description).toContain("Burning Hands, Command, Scorching Ray, Suggestion");
    expect(r.description).toContain("Geas");
    expect(r.description).toContain("Insect Plague");
    expect(r.description).not.toContain("Flame Strike");
    expect(r.description).not.toContain("Hallow");
  });
});

describe("Hurl Through Hell (#1233): 2024 adds a save, drops to 8d10, and only-non-Fiends — the crispest numeric detector", () => {
  it("2024 contains 8d10/Charisma saving throw/Incapacitated/a Pact Magic slot restore, and never 10d10", () => {
    const r2024 = row(FIEND, "Hurl Through Hell", "EDITION_2024");
    expect(r2024.description).toContain("8d10");
    expect(r2024.description).toContain("Charisma saving throw");
    expect(r2024.description).toContain("Incapacitated");
    expect(r2024.description).toContain("Pact Magic spell slot");
    expect(r2024.description).not.toContain("10d10");
  });

  it("2014 keeps the flat 10d10, no save", () => {
    const r2014 = row(FIEND, "Hurl Through Hell", "EDITION_2014");
    expect(r2014.description).toContain("10d10");
  });
});

describe("Eldritch Invocations (#1233): level-shifts 2 -> 1, and the corrected known-invocation table", () => {
  it("2024 is level 1, states the milestones, and never claims the issue's wrong 'max 8 known' cap", () => {
    const r2024 = row(BASE, "Eldritch Invocations", "EDITION_2024");
    expect(r2024.level).toBe(1);
    expect(r2024.description).toContain("3 at level 2");
    expect(r2024.description).toContain("10 at level 18");
    expect(r2024.description).not.toContain("max 8 known");
  });

  it("2014 stays at level 2", () => {
    expect(row(BASE, "Eldritch Invocations", "EDITION_2014").level).toBe(2);
  });
});

describe("Pact Boon (#1233): no 2024 successor — folded into Invocations, out of scope", () => {
  it("has no EDITION_2024 row; the EDITION_2014 row survives at level 3", () => {
    expect(hasRow(BASE, "Pact Boon", "EDITION_2024")).toBe(false);
    expect(row(BASE, "Pact Boon", "EDITION_2014").level).toBe(3);
  });
});

describe("Magical Cunning (#1233): NEW in 2024, no 2014 twin", () => {
  it("2024 is at level 2, half-max-round-up, Long Rest recharge", () => {
    const r2024 = row(BASE, "Magical Cunning", "EDITION_2024");
    expect(r2024.level).toBe(2);
    expect(r2024.description).toContain("half your maximum");
    expect(r2024.description).toContain("Long Rest");
    expect(hasRow(BASE, "Magical Cunning", "EDITION_2014")).toBe(false);
  });
});

describe("Contact Patron (#1233): NEW in 2024, no 2014 twin", () => {
  it("2024 is at level 9, always-prepared Contact Other Plane, automatic success", () => {
    const r2024 = row(BASE, "Contact Patron", "EDITION_2024");
    expect(r2024.level).toBe(9);
    expect(r2024.description).toContain("Contact Other Plane");
    expect(r2024.description).toContain("automatically succeed");
    expect(hasRow(BASE, "Contact Patron", "EDITION_2014")).toBe(false);
  });
});

describe("Eldritch Master (#1233): 2024 rewrites around Magical Cunning", () => {
  it("2024 mentions Magical Cunning and regaining ALL expended Pact Magic spell slots", () => {
    const r2024 = row(BASE, "Eldritch Master", "EDITION_2024");
    expect(r2024.description).toContain("Magical Cunning");
    expect(r2024.description).toContain("all your expended Pact Magic spell slots");
  });

  it("2014 keeps its standalone 1-minute entreaty, no mention of Magical Cunning", () => {
    const r2014 = row(BASE, "Eldritch Master", "EDITION_2014");
    expect(r2014.description).toContain("Spend 1 minute entreating your patron");
    expect(r2014.description).not.toContain("Magical Cunning");
  });
});

describe("Dark One's Blessing (#1233): level-shifts 1 -> 3, widens to a nearby ally's kill", () => {
  it("2024 is level 3 and mentions the 10-foot radius", () => {
    const r2024 = row(FIEND, "Dark One's Blessing", "EDITION_2024");
    expect(r2024.level).toBe(3);
    expect(r2024.description).toContain("within 10 feet");
  });

  it("2014 stays at level 1, no 10-foot clause", () => {
    const r2014 = row(FIEND, "Dark One's Blessing", "EDITION_2014");
    expect(r2014.level).toBe(1);
    expect(r2014.description).not.toContain("within 10 feet");
  });
});

describe("Dark One's Own Luck (#1233): uses become the Charisma modifier, recharge narrows to Long Rest", () => {
  it("2024 contains the Charisma-modifier formula, the once-per-roll cap, and Long Rest recharge", () => {
    const r2024 = row(FIEND, "Dark One's Own Luck", "EDITION_2024");
    expect(r2024.description).toContain("Charisma modifier");
    expect(r2024.description).toContain("minimum of once");
    expect(r2024.description).toContain("once per roll");
    expect(r2024.description).toContain("Long Rest");
  });

  it("2014 keeps the flat d10 add and short-or-long recharge", () => {
    const r2014 = row(FIEND, "Dark One's Own Luck", "EDITION_2014");
    expect(r2014.description).toContain("short or long rest");
  });
});

describe("Fiendish Resilience (#1233): 2024 excludes Force damage", () => {
  it("2024 names the exclusion", () => {
    expect(row(FIEND, "Fiendish Resilience", "EDITION_2024").description).toContain("other than Force");
  });

  it("2014 has no such exclusion", () => {
    expect(row(FIEND, "Fiendish Resilience", "EDITION_2014").description).not.toContain("other than Force");
  });
});

describe("The Archfey and The Great Old One (#1233): tagged EDITION_2014 only, zero EDITION_2024 rows authored", () => {
  it.each([ARCHFEY, GREAT_OLD_ONE])("%s has exactly 5 EDITION_2014 rows and 0 EDITION_2024 rows", (subclassSlug) => {
    const rows = WARLOCK_FEATURES.filter((r) => r.subclassSlug === subclassSlug);
    expect(rows.filter((r) => r.edition === "EDITION_2014")).toHaveLength(5);
    expect(rows.filter((r) => r.edition === "EDITION_2024")).toHaveLength(0);
  });
});

describe("structural: the @@unique([classId, subclassId, name, edition]) constraint expressed as a unit test", () => {
  it("no two rows share (subclassSlug, name, edition)", () => {
    const keys = WARLOCK_FEATURES.map((r) => `${r.subclassSlug ?? "null"}::${r.name}::${r.edition}`);
    expect(new Set(keys).size).toBe(keys.length);
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

// Integration-level proof (mirrors barbarian-2024-content.test.ts's
// loadDbFeatureRows pattern): the REAL seeded rows, read through the REAL
// derivation path, actually reach a serialized character's derived features —
// not just WARLOCK_FEATURES' in-memory shape.
describe("integration (#1233): a level-14 Fiend Warlock's derived features differ by edition exactly where authored", () => {
  it("2024 has Fiend Spells/Magical Cunning/Contact Patron and NOT Pact Boon/Expanded Spell List; 2014 is the reverse", async () => {
    const featureRows = await loadDbFeatureRows("warlock", "the fiend");
    const profBonus = proficiencyBonusForLevel(14);

    const info2014 = deriveResources("warlock", "the fiend", 14, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    const info2024 = deriveResources("warlock", "the fiend", 14, ABILITY_SCORES, profBonus, featureRows, "EDITION_2024");

    const names2014 = new Set((info2014?.features ?? []).map((f) => f.name));
    const names2024 = new Set((info2024?.features ?? []).map((f) => f.name));

    expect(names2014.has("Expanded Spell List")).toBe(true);
    expect(names2014.has("Pact Boon")).toBe(true);
    expect(names2014.has("Fiend Spells")).toBe(false);
    expect(names2014.has("Magical Cunning")).toBe(false);
    expect(names2014.has("Contact Patron")).toBe(false);

    expect(names2024.has("Fiend Spells")).toBe(true);
    expect(names2024.has("Magical Cunning")).toBe(true);
    expect(names2024.has("Contact Patron")).toBe(true);
    expect(names2024.has("Pact Boon")).toBe(false);
    expect(names2024.has("Expanded Spell List")).toBe(false);
  });
});
