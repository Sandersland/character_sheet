// Structural invariants on the per-domain seed modules. NO database — pure
// data checks that guard the bugs a data-move refactor can silently introduce:
// a duplicate business key (upsert-by-name would collapse two rows into one), a
// GrantedAbility name colliding across the four sources (they share one unique
// name column), or a dangling reference (a subclass on a class that doesn't
// exist, a pack listing an item the catalog lacks). Mirrors the fail-fast guard
// in seed.ts main().
import { describe, it, expect } from "vitest";

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
