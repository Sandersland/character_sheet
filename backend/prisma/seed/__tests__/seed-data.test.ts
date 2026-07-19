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
import { DISCIPLINES } from "../disciplines.js";
import { SHADOW_ARTS } from "../shadow-arts.js";
import { CHANNEL_DIVINITIES } from "../channel-divinity.js";
import { FEATS } from "../feats.js";
import { SPELLS } from "../spells.js";
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

  it("DISCIPLINES have unique names", () => {
    expect(duplicates(DISCIPLINES.map((d) => d.name))).toEqual([]);
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

describe("global GrantedAbility name-uniqueness", () => {
  // All four sources upsert into GrantedAbility, whose `name` is globally
  // unique — a cross-source collision would make one row silently overwrite
  // another. This is the same invariant the seed.ts guard throws on.
  it("no name collides across maneuvers/disciplines/shadow-arts/channel-divinity", () => {
    const names = [
      ...MANEUVERS.map((m) => m.name),
      ...DISCIPLINES.map((d) => d.name),
      ...SHADOW_ARTS.map((s) => s.name),
      ...CHANNEL_DIVINITIES.map((c) => c.name),
    ];
    expect(
      duplicates(names),
      "GrantedAbility name collision across the four seed sources",
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
