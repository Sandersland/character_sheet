// Structural invariants on the per-domain seed modules. NO database — pure
// data checks that guard the bugs a data-move refactor can silently introduce:
// a duplicate business key (upsert-by-name would collapse two rows into one), a
// GrantedAbility name colliding across the four sources (they share one unique
// name column), or a dangling reference (a subclass on a class that doesn't
// exist, a pack listing an item the catalog lacks). Mirrors the fail-fast guard
// in seed.ts main().
import { describe, it, expect } from "vitest";

import { barbarian } from "@/lib/classes/barbarian.js";
import { bard } from "@/lib/classes/bard.js";
import { cleric } from "@/lib/classes/cleric.js";
import { druid } from "@/lib/classes/druid.js";
import { fighter } from "@/lib/classes/fighter.js";
import { monk } from "@/lib/classes/monk.js";
import { paladin } from "@/lib/classes/paladin.js";
import { ranger } from "@/lib/classes/ranger.js";
import { rogue } from "@/lib/classes/rogue.js";
import { sorcerer } from "@/lib/classes/sorcerer.js";
import type { ClassDefinition } from "@/lib/classes/types.js";
import { warlock } from "@/lib/classes/warlock.js";
import { wizard } from "@/lib/classes/wizard.js";

import { CLASSES, ITEMS } from "../catalog-data.js";
import { ACTIONS } from "../actions.js";
import { SUBCLASSES } from "../subclasses.js";
import { MANEUVERS } from "../maneuvers.js";
import { SHADOW_ARTS } from "../shadow-arts.js";
import { CHANNEL_DIVINITIES } from "../channel-divinity.js";
import { FEATS } from "../feats.js";
import { SPELLS, SPELL_RENAMES, type CatalogSpell } from "../spells.js";
import { PACKS } from "../packs.js";
import { SUBCLASS_GRANTED_SPELLS } from "../subclass-granted-spells.js";
import { FEAT_IMPROVEMENT_TARGETS } from "@/lib/srd/feats.js";
import { cantripsKnownAtLevel, preparedSpellCountAt } from "@/lib/srd/srd.js";

// The values that repeat when a list has a duplicate on `key`.
const duplicates = <T>(values: T[]): T[] =>
  [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];

describe("per-domain business-key uniqueness", () => {
  it("ACTIONS have unique keys", () => {
    expect(duplicates(ACTIONS.map((a) => a.key))).toEqual([]);
  });

  it("SUBCLASSES have unique (className, name) pairs", () => {
    expect(duplicates(SUBCLASSES.map((s) => `${s.className}::${s.name}`))).toEqual([]);
  });

  it("MANEUVERS have unique names", () => {
    expect(duplicates(MANEUVERS.map((m) => m.name))).toEqual([]);
  });

  it("SHADOW_ARTS have unique names", () => {
    expect(duplicates(SHADOW_ARTS.map((s) => s.name))).toEqual([]);
  });

  it("CHANNEL_DIVINITIES have unique names", () => {
    expect(duplicates(CHANNEL_DIVINITIES.map((c) => c.name))).toEqual([]);
  });

  it("FEATS have unique names", () => {
    expect(duplicates(FEATS.map((f) => f.name))).toEqual([]);
  });

  it("SPELLS have unique names", () => {
    expect(duplicates(SPELLS.map((s) => s.name))).toEqual([]);
  });

  it("PACKS have unique names, and each pack's contents have unique item names", () => {
    expect(duplicates(PACKS.map((p) => p.name))).toEqual([]);
    for (const pack of PACKS) {
      expect(
        duplicates(pack.contents.map((c) => c.itemName)),
        `pack "${pack.name}" lists a duplicate item`,
      ).toEqual([]);
    }
  });
});

// SRD 5.2.1 pp. 87-88 + PHB'24 feat categories (#1129).
describe("FEATS — PHB'24 category invariants", () => {
  it("every feat carries a category", () => {
    const missing = FEATS.filter((f) => !f.category).map((f) => f.name);
    expect(missing, "feats without a category").toEqual([]);
  });

  it("General feats have levelPrerequisite 4, a nonempty abilityOptions, and abilityIncrease 1", () => {
    for (const f of FEATS.filter((f) => f.category === "general")) {
      expect(f.levelPrerequisite, `${f.name} levelPrerequisite`).toBe(4);
      expect((f.abilityOptions ?? []).length, `${f.name} abilityOptions`).toBeGreaterThan(0);
      expect(f.abilityIncrease, `${f.name} abilityIncrease`).toBe(1);
    }
  });

  it("Epic Boon feats have levelPrerequisite 19 and abilityIncrease 1", () => {
    for (const f of FEATS.filter((f) => f.category === "epic_boon")) {
      expect(f.levelPrerequisite, `${f.name} levelPrerequisite`).toBe(19);
      expect(f.abilityIncrease, `${f.name} abilityIncrease`).toBe(1);
    }
  });

  it("Origin feats carry no levelPrerequisite", () => {
    const withLevel = FEATS.filter((f) => f.category === "origin" && f.levelPrerequisite != null).map((f) => f.name);
    expect(withLevel, "origin feats with a levelPrerequisite").toEqual([]);
  });

  it("Fighting Style feats name their Fighting Style prerequisite", () => {
    for (const f of FEATS.filter((f) => f.category === "fighting_style")) {
      expect(f.prerequisite ?? "", `${f.name} prerequisite`).toContain("Fighting Style");
    }
  });

  // #1137: the mechanical Fighting Style feats carry the same derived effects the
  // former scalar styles applied — Archery +2 ranged attack, Defense +1 AC while
  // armored, Two-Weapon Fighting the off-hand ability-mod marker. Great Weapon
  // Fighting stays descriptive (its reroll is not automated).
  it("Fighting Style feats carry their derived improvements", () => {
    const byName = new Map(FEATS.map((f) => [f.name, f]));
    expect(byName.get("Archery")?.improvements).toEqual([{ target: "rangedAttackRoll", amount: 2 }]);
    expect(byName.get("Defense")?.improvements).toEqual([{ target: "armorClassWhileArmored", amount: 1 }]);
    expect(byName.get("Two-Weapon Fighting")?.improvements).toEqual([
      { target: "offhandAbilityDamage", amount: 1 },
    ]);
    expect(byName.get("Great Weapon Fighting")?.improvements ?? []).toEqual([]);
  });

  it("only Magic Initiate and Skilled are repeatable", () => {
    const repeatable = FEATS.filter((f) => f.repeatable).map((f) => f.name).sort();
    expect(repeatable).toEqual(["Magic Initiate", "Skilled"]);
  });

  it("every improvement target is a known FEAT_IMPROVEMENT_TARGET", () => {
    const allowed = new Set<string>(FEAT_IMPROVEMENT_TARGETS);
    const unknown = FEATS.flatMap((f) => (f.improvements ?? []).map((i) => i.target)).filter((t) => !allowed.has(t));
    expect([...new Set(unknown)], "unknown improvement targets").toEqual([]);
  });

  it("seeds the 16 SRD 5.2.1 feats (17 minus Ability Score Improvement)", () => {
    const names = new Set(FEATS.map((f) => f.name));
    const srd = [
      "Alert", "Magic Initiate", "Savage Attacker", "Skilled", "Grappler",
      "Archery", "Defense", "Great Weapon Fighting", "Two-Weapon Fighting",
      "Boon of Combat Prowess", "Boon of Dimensional Travel", "Boon of Fate",
      "Boon of Irresistible Offense", "Boon of Spell Recall", "Boon of the Night Spirit",
      "Boon of Truesight",
    ];
    const missing = srd.filter((n) => !names.has(n));
    expect(missing, "missing SRD 5.2.1 feats").toEqual([]);
  });
});

// #1131: the creation spell picker needs real choice — strictly MORE spells on a
// class's list than it takes at level 1, so a fresh caster is never forced.
describe("SPELLS — creation picker coverage (#1131)", () => {
  const onList = (cls: string, level: number) =>
    SPELLS.filter((s) => s.level === level && s.classes.includes(cls)).length;

  it("every cantrip-casting class has more cantrips than it knows at level 1", () => {
    for (const cls of ["bard", "cleric", "druid", "sorcerer", "wizard", "warlock"]) {
      expect(onList(cls, 0), `${cls} cantrips`).toBeGreaterThan(cantripsKnownAtLevel(cls, 1));
    }
  });

  it("every level-1 caster has more first-level spells than it prepares at level 1", () => {
    for (const cls of ["bard", "cleric", "druid", "sorcerer", "wizard", "warlock", "paladin", "ranger"]) {
      expect(onList(cls, 1), `${cls} L1 spells`).toBeGreaterThan(preparedSpellCountAt(cls, 1) ?? 0);
    }
  });
});

// SRD 5.2 spell resweep (#1132): shape invariants the value-by-value catalog
// edits must never break. The class list is the authority — a spell offering
// itself outside its SRD list is the leak bug the resweep fixes.
describe("SPELLS — structured-field invariants (#1132)", () => {
  const CLASS_NAMES = new Set([
    "barbarian", "bard", "cleric", "druid", "fighter", "monk",
    "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard",
  ]);

  it("every spell's classes[] is non-empty and lowercase ⊆ the 12 classes", () => {
    const bad = SPELLS.filter(
      (s) => s.classes.length === 0 || s.classes.some((c) => c !== c.toLowerCase() || !CLASS_NAMES.has(c)),
    ).map((s) => s.name);
    expect(bad, "spells with an empty or unknown class list").toEqual([]);
  });

  it("cantripScaling only on cantrips (level 0)", () => {
    const bad = SPELLS.filter((s) => s.cantripScaling && s.level !== 0).map((s) => s.name);
    expect(bad, "leveled spell flagged cantripScaling").toEqual([]);
  });

  it("saveEffect implies a save-based attack", () => {
    const bad = SPELLS.filter((s) => s.saveEffect && s.attackType !== "save").map((s) => s.name);
    expect(bad, "saveEffect without attackType 'save'").toEqual([]);
  });

  it("buff fields appear iff effectKind is 'buff'", () => {
    const bad = SPELLS.filter((s) => {
      const hasBuffFields = s.buffTarget != null || s.buffModifier != null;
      return hasBuffFields !== (s.effectKind === "buff");
    }).map((s) => s.name);
    expect(bad, "buff fields not matching effectKind 'buff'").toEqual([]);
  });

  it("upcastDicePerLevel only on leveled spells (level ≥ 1)", () => {
    const bad = SPELLS.filter((s) => s.upcastDicePerLevel != null && s.level < 1).map((s) => s.name);
    expect(bad, "cantrip with upcastDicePerLevel").toEqual([]);
  });

  it("every SUBCLASS_GRANTED_SPELLS.spellName exists in SPELLS", () => {
    const names = new Set(SPELLS.map((s) => s.name));
    const dangling = SUBCLASS_GRANTED_SPELLS.filter((g) => !names.has(g.spellName)).map((g) => g.spellName);
    expect([...new Set(dangling)], "granted spell not in the catalog").toEqual([]);
  });

  it("SPELL_RENAMES: no source name still in SPELLS, every target name in SPELLS", () => {
    const names = new Set(SPELLS.map((s) => s.name));
    const strandedSources = SPELL_RENAMES.filter((r) => names.has(r.from)).map((r) => r.from);
    const missingTargets = SPELL_RENAMES.filter((r) => !names.has(r.to)).map((r) => r.to);
    expect(strandedSources, "rename source still present in SPELLS").toEqual([]);
    expect(missingTargets, "rename target missing from SPELLS").toEqual([]);
  });
});

// SRD 5.2 value spot-checks (#1132) — the load-bearing deltas per level band.
// Not exhaustive: guards the mechanics that changed and the class-list leak fix.
// `get` throws (definite CatalogSpell, no optional chains → low complexity);
// `has` covers the removed/renamed presence checks.
const get = (name: string): CatalogSpell => {
  const s = SPELLS.find((sp) => sp.name === name);
  if (!s) throw new Error(`SPELLS has no "${name}"`);
  return s;
};
const has = (name: string): boolean => SPELLS.some((s) => s.name === name);

describe("SRD 5.2 catalog values — CHUNK 1 cantrips + L1 (#1132)", () => {
  it("removes Toll the Dead (no 2024 version) and renames Tasha's Hideous Laughter", () => {
    expect(has("Toll the Dead")).toBe(false);
    expect(has("Tasha's Hideous Laughter")).toBe(false);
    expect(has("Hideous Laughter")).toBe(true);
    expect(SPELL_RENAMES).toContainEqual({ from: "Tasha's Hideous Laughter", to: "Hideous Laughter" });
  });

  it("applies cantrip deltas (dice, class lists, components, duration)", () => {
    expect(get("Vicious Mockery").effectDiceFaces).toBe(6);
    expect(get("Mage Hand").classes).toContain("warlock");
    expect(get("Prestidigitation").classes).toContain("warlock");
    expect(get("Prestidigitation").duration).toBe("1 hour");
    expect(get("Minor Illusion").components?.verbal).toBe(false);
  });

  it("upgrades the healing spells to 2dX abjuration", () => {
    const cure = get("Cure Wounds");
    expect([cure.effectDiceCount, cure.upcastDicePerLevel, cure.school]).toEqual([2, 2, "abjuration"]);
    expect(cure.classes).toEqual(expect.arrayContaining(["paladin", "ranger"]));
    const hw = get("Healing Word");
    expect([hw.effectDiceCount, hw.upcastDicePerLevel, hw.school]).toEqual([2, 2, "abjuration"]);
  });

  it("fixes the L1 class lists (leak fix + additions/removals)", () => {
    expect(get("Thunderwave").classes).not.toContain("cleric");
    expect(get("Detect Magic").classes.length).toBe(8);
    expect(get("Bane").classes).toContain("warlock");
    expect(get("Command").classes).toContain("bard");
    expect(get("Command").duration).toBe("Instantaneous");
    expect(get("Dissonant Whispers").classes).toEqual(["bard"]); // GOO leak fix
    expect(get("Protection from Evil and Good").classes).toContain("druid");
    expect(get("Sanctuary").classes).toEqual(["cleric"]);
  });

  it("redesigns Sleep and re-types Hunter's Mark damage", () => {
    const sleep = get("Sleep");
    expect(sleep.concentration).toBe(true);
    expect(sleep.range).toBe("60 ft");
    expect(sleep.effectDiceCount).toBeUndefined(); // 5d8 HP pool dropped
    expect(sleep.description).toContain("Incapacitated");
    expect(get("Hunter's Mark").description).toContain("Force");
  });
});

describe("SRD 5.2 catalog values — CHUNK 2 L2 + L3 (#1132)", () => {
  it("Barkskin becomes a non-concentration bonus-action floor-17 buff", () => {
    const bark = get("Barkskin");
    expect(bark.castingTime).toBe("1 bonus action");
    expect(bark.concentration).toBeFalsy();
    expect(bark.duration).toBe("1 hour");
    expect(bark.buffModifier).toBe(17);
  });

  it("makes Spiritual Weapon concentration with upcast scaling", () => {
    const sw = get("Spiritual Weapon");
    expect(sw.concentration).toBe(true);
    expect(sw.duration).toBe("Concentration, up to 1 minute");
    expect(sw.upcastDicePerLevel).toBe(1);
  });

  it("applies L2 class-list + field deltas", () => {
    expect(get("Misty Step").classes).toEqual(expect.arrayContaining(["warlock"]));
    expect(get("Misty Step").classes).not.toContain("bard");
    expect(get("Shatter").classes).not.toContain("cleric");
    expect(get("Hold Person").classes).toEqual(expect.arrayContaining(["sorcerer", "warlock"]));
    expect(get("Mirror Image").classes).toContain("bard");
    const bd = get("Blindness/Deafness");
    expect(bd.school).toBe("transmutation");
    expect(bd.range).toBe("120 ft");
    expect(get("Lesser Restoration").castingTime).toBe("1 bonus action");
    expect(get("Phantasmal Force").description).toContain("2d8");
  });

  it("applies L3 class-list + field deltas", () => {
    expect(get("Counterspell").classes).toEqual(["sorcerer", "warlock", "wizard"]);
    const mhw = get("Mass Healing Word");
    expect([mhw.effectDiceCount, mhw.school]).toEqual([2, "abjuration"]);
    expect(get("Gaseous Form").classes).toContain("warlock");
    expect(get("Dispel Magic").classes.length).toBe(8);
    expect(get("Blink").description).toContain("d6");
    const sending = get("Sending");
    expect(sending.school).toBe("divination");
    expect(sending.duration).toBe("Instantaneous");
  });
});

describe("SRD 5.2 catalog values — CHUNK 3 L4 + L5 (#1132)", () => {
  it("renames Evard's Black Tentacles → Black Tentacles in place", () => {
    expect(has("Evard's Black Tentacles")).toBe(false);
    expect(has("Black Tentacles")).toBe(true);
    expect(SPELL_RENAMES).toContainEqual({ from: "Evard's Black Tentacles", to: "Black Tentacles" });
  });

  it("applies L4 deltas", () => {
    expect(get("Stoneskin").school).toBe("transmutation");
    expect(get("Stoneskin").description).not.toContain("nonmagical");
    expect(get("Banishment").range).toBe("30 ft");
    expect(get("Banishment").description).toContain("Incapacitated");
    expect(get("Fire Shield").classes).toEqual(expect.arrayContaining(["druid", "sorcerer"]));
    expect(get("Dominate Beast").classes).toContain("ranger");
    expect(get("Ice Storm").description).toContain("2d10");
  });

  it("applies L5 deltas", () => {
    expect(get("Cone of Cold").classes).toContain("druid");
    expect(get("Flame Strike").classes).toEqual(["cleric"]);
    expect(get("Hallow").school).toBe("abjuration");
    expect(get("Hold Monster").description).not.toContain("not undead");
    const mcw = get("Mass Cure Wounds");
    expect([mcw.effectDiceCount, mcw.school]).toEqual([5, "abjuration"]);
  });
});

describe("SRD 5.2 catalog values — CHUNK 4 additions (#1132)", () => {
  const ADDED = [
    "Aid", "Suggestion", "Invisibility", "Hypnotic Pattern", "Nondetection",
    "Aura of Life", "Confusion", "Geas", "Insect Plague", "Greater Restoration",
  ];

  it("seeds all 10 new spells", () => {
    expect(ADDED.filter((n) => !has(n))).toEqual([]);
  });

  it("gives each new spell a legal level and class list", () => {
    for (const name of ADDED) {
      const s = get(name);
      expect(s.level, `${name} level`).toBeGreaterThanOrEqual(2);
      expect(s.classes.length, `${name} classes`).toBeGreaterThan(0);
    }
  });

  it("captures the load-bearing structured fields", () => {
    expect(get("Hypnotic Pattern").components?.verbal).toBe(false); // S, M only
    const ip = get("Insect Plague");
    expect([ip.effectDiceCount, ip.effectDiceFaces, ip.damageType]).toEqual([4, 10, "piercing"]);
    expect([ip.saveAbility, ip.saveEffect, ip.upcastDicePerLevel]).toEqual(["constitution", "half", 1]);
    expect(get("Aura of Life").classes).toEqual(["paladin"]);
    expect(get("Aid").effectKind).toBeUndefined(); // flat +5 HP is inexpressible
  });
});

describe("global GrantedAbility name-uniqueness", () => {
  // All these sources upsert into GrantedAbility, whose `name` is globally
  // unique — a cross-source collision would make one row silently overwrite
  // another. This is the same invariant the seed.ts guard throws on.
  it("no name collides across maneuvers/shadow-arts/channel-divinity", () => {
    const names = [
      ...MANEUVERS.map((m) => m.name),
      ...SHADOW_ARTS.map((s) => s.name),
      ...CHANNEL_DIVINITIES.map((c) => c.name),
    ];
    expect(
      duplicates(names),
      "GrantedAbility name collision across the seed sources",
    ).toEqual([]);
  });
});

describe("referential integrity", () => {
  it("every SUBCLASSES.className names a class in CLASSES", () => {
    const classNames = new Set(CLASSES.map((c) => c.name));
    const dangling = SUBCLASSES.filter((s) => !classNames.has(s.className)).map((s) => s.className);
    expect([...new Set(dangling)], "subclass on unknown class").toEqual([]);
  });

  it("every PACKS content itemName exists in the ITEMS catalog", () => {
    const itemNames = new Set(ITEMS.map((i) => i.name));
    const dangling = PACKS.flatMap((p) => p.contents)
      .map((c) => c.itemName)
      .filter((name) => !itemNames.has(name));
    expect([...new Set(dangling)], "pack references an item missing from ITEMS").toEqual([]);
  });

  // Cross-source (#1128): the seed subclassLevel (drives the level-up choice
  // step) must equal the class-definition grantLevel (drives feature/pool
  // derivation) — the single rule split across two files must not drift.
  it("every seed subclassLevel matches its class-definition grantLevel", () => {
    const defByName: Record<string, ClassDefinition> = {
      Barbarian: barbarian, Bard: bard, Cleric: cleric, Druid: druid, Fighter: fighter,
      Monk: monk, Paladin: paladin, Ranger: ranger, Rogue: rogue, Sorcerer: sorcerer,
      Warlock: warlock, Wizard: wizard,
    };
    const drift = CLASSES.flatMap((seedClass) =>
      Object.entries(defByName[seedClass.name]?.subclasses ?? {})
        .filter(([, sub]) => (sub.grantLevel ?? 3) !== seedClass.subclassLevel)
        .map(([key]) => `${seedClass.name}/${key}`),
    );
    expect(drift, "subclass grantLevel differs from seed subclassLevel").toEqual([]);
  });

  // 2024 rules: a subclass grants nothing before its choice level (#1128), so no
  // granted-spell row may fire below the class's subclassLevel.
  it("every SUBCLASS_GRANTED_SPELLS gateLevel is at least its class's subclassLevel", () => {
    const subclassLevelByClass = new Map(CLASSES.map((c) => [c.name, c.subclassLevel]));
    const early = SUBCLASS_GRANTED_SPELLS.filter(
      (row) => row.gateLevel < (subclassLevelByClass.get(row.className) ?? 0),
    ).map((row) => `${row.className}/${row.subclassName}/${row.spellName}@${row.gateLevel}`);
    expect(early, "granted spell gated below its subclass grant level").toEqual([]);
  });
});
