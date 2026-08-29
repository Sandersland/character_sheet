import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { loadDbFeatureRows } from "@/lib/classes/__tests__/db-feature-rows.fixture.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { RANGER_FEATURES } from "../ranger-features.js";

type Edition = "EDITION_2014" | "EDITION_2024";

function rowsNamed(subclassSlug: string | null, name: string) {
  return RANGER_FEATURES.filter((r) => r.subclassSlug === subclassSlug && r.name === name);
}

function row(subclassSlug: string | null, name: string, edition: Edition) {
  const found = rowsNamed(subclassSlug, name).filter((r) => r.edition === edition);
  expect(found, `${subclassSlug ?? "(base)"}/${name}/${edition}`).toHaveLength(1);
  return found[0];
}

function hasRow(subclassSlug: string | null, name: string, edition: Edition): boolean {
  return rowsNamed(subclassSlug, name).some((r) => r.edition === edition);
}

const BASE = null;
const HUNTER = "ranger-hunter";
const BEAST_MASTER = "ranger-beast-master";

describe("Removed-in-2024 base features (#1230): the strongest single stale-copy detector", () => {
  it.each(["Natural Explorer", "Primeval Awareness", "Land's Stride", "Hide in Plain Sight", "Vanish"])(
    "%s has no EDITION_2024 row",
    (name) => {
      expect(hasRow(BASE, name, "EDITION_2024")).toBe(false);
      expect(hasRow(BASE, name, "EDITION_2014")).toBe(true);
    },
  );
});

describe("Spellcasting (#1230 C2): level-shifts 2 -> 1, contradicting the issue's own 'unchanged' claim", () => {
  it("2024 is level 1; 2014 stays level 2", () => {
    expect(row(BASE, "Spellcasting", "EDITION_2024").level).toBe(1);
    expect(row(BASE, "Spellcasting", "EDITION_2014").level).toBe(2);
  });
});

describe("Favored Enemy (#1230): a full rewrite around Hunter's Mark, not a terrain-lore benefit", () => {
  it("2024 mentions Hunter's Mark and the free-cast progression; 2014 does not", () => {
    const r2024 = row(BASE, "Favored Enemy", "EDITION_2024");
    expect(r2024.description).toContain("Hunter's Mark");
    expect(r2024.description).toContain("2 at level 1");
    expect(r2024.description).toContain("6 at level");
    expect(row(BASE, "Favored Enemy", "EDITION_2014").description).not.toContain("Hunter's Mark");
  });
});

describe("Weapon Mastery (#1230 C3): NEW in 2024, exactly two weapons, no scaling", () => {
  it("does not contain a Barbarian-style scaling clause", () => {
    const r2024 = row(BASE, "Weapon Mastery", "EDITION_2024");
    expect(r2024.description).toContain("two kinds of weapons");
    expect(r2024.description).not.toContain("3 at level 4");
    expect(r2024.description).not.toContain("4 at level 10");
    expect(hasRow(BASE, "Weapon Mastery", "EDITION_2014")).toBe(false);
  });
});

describe("Feral Senses (#1230): a full rewrite to flat Blindsight", () => {
  it("2024 grants Blindsight; 2014 does not mention it", () => {
    expect(row(BASE, "Feral Senses", "EDITION_2024").description).toContain("Blindsight");
    expect(row(BASE, "Feral Senses", "EDITION_2014").description).not.toContain("Blindsight");
  });
});

describe("Foe Slayer (#1230): Hunter's Mark die upgrade, not a Wisdom-modifier bonus", () => {
  it("2024 contains d10; 2014 contains the Wisdom modifier language", () => {
    expect(row(BASE, "Foe Slayer", "EDITION_2024").description).toContain("d10");
    expect(row(BASE, "Foe Slayer", "EDITION_2014").description).toContain("Wisdom modifier");
  });
});

describe("Hunter (#1230): narrows to two options per tier, drops Giant Killer/Steel Will/Multiattack", () => {
  it("2024 Hunter's Prey doesn't mention Giant Killer", () => {
    expect(row(HUNTER, "Hunter's Prey", "EDITION_2024").description).not.toContain("Giant Killer");
  });

  it("2024 Defensive Tactics doesn't mention Steel Will", () => {
    expect(row(HUNTER, "Defensive Tactics", "EDITION_2024").description).not.toContain("Steel Will");
  });

  it("Multiattack has no EDITION_2024 row — Superior Hunter's Prey fills its L11 slot instead", () => {
    expect(hasRow(HUNTER, "Multiattack", "EDITION_2024")).toBe(false);
    expect(hasRow(HUNTER, "Multiattack", "EDITION_2014")).toBe(true);
    expect(row(HUNTER, "Superior Hunter's Prey", "EDITION_2024").level).toBe(11);
  });

  it("Superior Hunter's Defense (#1230 C5): a single fixed Reaction, not the 2014 three-option Evasion choice", () => {
    const r2024 = row(HUNTER, "Superior Hunter's Defense", "EDITION_2024");
    expect(r2024.description).toContain("Reaction");
    expect(r2024.description).not.toContain("Evasion");
  });

  it("Hunter's Lore is NEW in 2024, no 2014 counterpart", () => {
    expect(hasRow(HUNTER, "Hunter's Lore", "EDITION_2014")).toBe(false);
    expect(row(HUNTER, "Hunter's Lore", "EDITION_2024").level).toBe(3);
  });
});

describe("Beast Master (#1230 owner decision 1): Ranger's Companion renames to Primal Companion, mirror-sourced", () => {
  it("Ranger's Companion has no EDITION_2024 row — it's a rename, not an edit in place", () => {
    expect(hasRow(BEAST_MASTER, "Ranger's Companion", "EDITION_2024")).toBe(false);
    expect(hasRow(BEAST_MASTER, "Ranger's Companion", "EDITION_2014")).toBe(true);
  });

  it("Primal Companion is NEW in 2024 at level 3, cites the three beast names and the revival mechanic, without transcribing stat blocks", () => {
    const r2024 = row(BEAST_MASTER, "Primal Companion", "EDITION_2024");
    expect(r2024.level).toBe(3);
    expect(r2024.description).toContain("Beast of the Land");
    expect(r2024.description).toContain("Beast of the Sea");
    expect(r2024.description).toContain("Beast of the Sky");
    expect(r2024.description).toContain("Magic action");
    expect(r2024.description).toContain("1 minute");
  });

  it("Exceptional Training (2024) commands Help, never the garbled 'Hide' outlier", () => {
    const r2024 = row(BEAST_MASTER, "Exceptional Training", "EDITION_2024");
    expect(r2024.description).toContain("Help");
    expect(r2024.description).not.toContain("Hide");
  });

  it("every Beast Master EDITION_2024 row exists (4 rows: Primal Companion, Exceptional Training, Bestial Fury, Share Spells)", () => {
    const rows2024 = RANGER_FEATURES.filter((r) => r.subclassSlug === BEAST_MASTER && r.edition === "EDITION_2024");
    expect(rows2024.map((r) => r.name).sort()).toEqual(
      ["Bestial Fury", "Exceptional Training", "Primal Companion", "Share Spells"].sort(),
    );
  });
});

describe("structural: the @@unique([classId, subclassId, name, edition]) constraint expressed as a unit test", () => {
  it("no two rows share (subclassSlug, name, edition)", () => {
    const keys = RANGER_FEATURES.map((r) => `${r.subclassSlug ?? "null"}::${r.name}::${r.edition}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("row counts (#1230): 19 EDITION_2014 (unchanged, pinned) vs 24 EDITION_2024", () => {
  it("EDITION_2014 stays 19; EDITION_2024 is 24 (15 base incl. shared Extra Attack + 5 Hunter + 4 Beast Master)", () => {
    expect(RANGER_FEATURES.filter((r) => r.edition === "EDITION_2014")).toHaveLength(19);
    expect(RANGER_FEATURES.filter((r) => r.edition === "EDITION_2024")).toHaveLength(24);
  });
});

const ABILITY_SCORES = {
  strength: 10,
  dexterity: 14,
  constitution: 12,
  intelligence: 8,
  wisdom: 16,
  charisma: 10,
};

describe("integration (#1230): a level-20 Hunter Ranger's derived features differ by edition exactly where authored", () => {
  it("2024 has Deft Explorer/Roving/Tireless/Nature's Veil/Hunter's Lore/Superior Hunter's Prey and NOT Natural Explorer/Primeval Awareness/Vanish/Giant-Killer-bearing Hunter's Prey/Multiattack; 2014 is the reverse", async () => {
    const featureRows = await loadDbFeatureRows("ranger", "hunter");
    const profBonus = proficiencyBonusForLevel(20);

    const info2014 = deriveResources("ranger", "hunter", 20, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    const info2024 = deriveResources("ranger", "hunter", 20, ABILITY_SCORES, profBonus, featureRows, "EDITION_2024");

    const names2014 = new Set((info2014?.features ?? []).map((f) => f.name));
    const names2024 = new Set((info2024?.features ?? []).map((f) => f.name));

    expect(names2014.has("Natural Explorer")).toBe(true);
    expect(names2014.has("Primeval Awareness")).toBe(true);
    expect(names2014.has("Vanish")).toBe(true);
    expect(names2014.has("Multiattack")).toBe(true);
    expect(names2014.has("Deft Explorer")).toBe(false);
    expect(names2014.has("Roving")).toBe(false);
    expect(names2014.has("Tireless")).toBe(false);
    expect(names2014.has("Nature's Veil")).toBe(false);
    expect(names2014.has("Hunter's Lore")).toBe(false);
    expect(names2014.has("Superior Hunter's Prey")).toBe(false);

    expect(names2024.has("Deft Explorer")).toBe(true);
    expect(names2024.has("Roving")).toBe(true);
    expect(names2024.has("Tireless")).toBe(true);
    expect(names2024.has("Nature's Veil")).toBe(true);
    expect(names2024.has("Hunter's Lore")).toBe(true);
    expect(names2024.has("Superior Hunter's Prey")).toBe(true);
    expect(names2024.has("Natural Explorer")).toBe(false);
    expect(names2024.has("Primeval Awareness")).toBe(false);
    expect(names2024.has("Vanish")).toBe(false);
    expect(names2024.has("Multiattack")).toBe(false);
  });
});
