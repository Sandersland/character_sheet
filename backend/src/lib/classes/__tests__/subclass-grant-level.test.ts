// 2024 rules: every class chooses its subclass at level 3 (#1128). Guards both
// the grant gate (no subclass feature/pool derives below 3) and the cross-source
// invariant that the class-definition grantLevel matches the seed subclassLevel.
import { describe, it, expect } from "vitest";

import { barbarian } from "@/lib/classes/barbarian.js";
import { bard } from "@/lib/classes/bard.js";
import { deriveResources } from "@/lib/classes/class-features.js";
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
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { CLASSES } from "../../../../prisma/seed/catalog-data.js";

const ABILITIES = { strength: 10, dexterity: 10, constitution: 12, intelligence: 14, wisdom: 16, charisma: 16 };

function subclassFeatures(className: string, subclass: string, level: number) {
  const info = deriveResources(className, subclass, level, ABILITIES, proficiencyBonusForLevel(level));
  return (info?.features ?? []).filter((f) => f.source === "subclass");
}

// One representative subclass per class whose subclass grant moved to 3.
const MOVED: Array<[string, string]> = [
  ["cleric", "life domain"],
  ["sorcerer", "draconic bloodline"],
  ["warlock", "the archfey"],
  ["wizard", "school of evocation"],
  ["druid", "circle of the moon"],
];

describe("subclass grant level is 3 for all classes (#1128)", () => {
  it.each(MOVED)("%s / %s contributes no subclass features at level 2", (className, subclass) => {
    expect(subclassFeatures(className, subclass, 2)).toEqual([]);
  });

  it.each(MOVED)("%s / %s contributes subclass features at level 3", (className, subclass) => {
    expect(subclassFeatures(className, subclass, 3).length).toBeGreaterThan(0);
  });

  it("Archfey's feyPresence pool is absent at level 2 and present at level 3", () => {
    const at = (level: number) =>
      deriveResources("warlock", "the archfey", level, ABILITIES, proficiencyBonusForLevel(level))
        ?.resources.some((r) => r.key === "feyPresence") ?? false;
    expect(at(2)).toBe(false);
    expect(at(3)).toBe(true);
  });
});

// Cross-source: the rule lives in one place per class. The class-definition
// grantLevel (drives feature/pool derivation) must equal the seed subclassLevel
// (drives the level-up choice step) — otherwise a class offers the pick at one
// level but grants features at another.
const CLASS_DEFS: Record<string, ClassDefinition> = {
  Barbarian: barbarian,
  Bard: bard,
  Cleric: cleric,
  Druid: druid,
  Fighter: fighter,
  Monk: monk,
  Paladin: paladin,
  Ranger: ranger,
  Rogue: rogue,
  Sorcerer: sorcerer,
  Warlock: warlock,
  Wizard: wizard,
};

describe("grantLevel matches seed subclassLevel (#1128)", () => {
  for (const seedClass of CLASSES) {
    const def = CLASS_DEFS[seedClass.name];
    for (const [key, sub] of Object.entries(def?.subclasses ?? {})) {
      it(`${seedClass.name} / ${key} grantLevel === subclassLevel (${seedClass.subclassLevel})`, () => {
        expect(sub.grantLevel ?? 3).toBe(seedClass.subclassLevel);
      });
    }
  }
});
