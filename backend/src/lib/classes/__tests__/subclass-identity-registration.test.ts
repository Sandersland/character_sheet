import { describe, expect, it } from "vitest";

import type { RulesEdition } from "@character-sheet/shared-types";

import { deriveResources } from "@/lib/classes/class-features.js";
import { druid } from "@/lib/classes/druid.js";
import { monk } from "@/lib/classes/monk.js";
import { paladin } from "@/lib/classes/paladin.js";
import { ranger } from "@/lib/classes/ranger.js";
import { SUBCLASS_IDENTITY } from "@/lib/classes/subclass-slug.js";
import type { ClassDefinition } from "@/lib/classes/types.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { CLASS_SUBCLASSES } from "./class-subclasses.fixture.js";

const ABILITIES = { strength: 10, dexterity: 10, constitution: 12, intelligence: 14, wisdom: 16, charisma: 16 };

// level: 1 clears every gate this file tests against.
const FAKE_SUBCLASS_ROWS = (["EDITION_2014", "EDITION_2024"] as const).map((edition) => ({
  name: "Fake Subclass Feature",
  level: 1,
  description: "stand-in row, not real subclass content",
  edition,
  resourceKey: "fakeSubclassPool",
  resourceLabel: "Fake Pool",
  resourceRecharge: "longRest",
  resourceTotals: [{ minLevel: 1, total: 2 }],
}));

describe("#1546 Part A — SUBCLASSES resolves from SUBCLASS_IDENTITY when a class has no TS SubclassDefinition", () => {
  it("champion resolves its seeded rows (pools AND features) with no lib/classes/fighter.ts to register it", () => {
    const featureRows = { classRows: [], subclassRows: FAKE_SUBCLASS_ROWS };
    const info = deriveResources(
      "fighter",
      "champion",
      3,
      ABILITIES,
      proficiencyBonusForLevel(3),
      featureRows,
      "EDITION_2024",
    );
    expect(info).not.toBeNull();
    expect(info?.features.map((f) => f.name)).toEqual(["Fake Subclass Feature"]);
    expect(info?.resources.map((r) => r.key)).toEqual(["fakeSubclassPool"]);
  });

  it("battle master resolves its rows too — not just the no-resourceFn Champion case", () => {
    const featureRows = { classRows: [], subclassRows: FAKE_SUBCLASS_ROWS };
    const info = deriveResources(
      "fighter",
      "battle master",
      3,
      ABILITIES,
      proficiencyBonusForLevel(3),
      featureRows,
      "EDITION_2014",
    );
    expect(info).not.toBeNull();
    expect(info?.resources.map((r) => r.key)).toEqual(["fakeSubclassPool"]);
  });

  it("the identity-only entry still gates at level 3 in BOTH editions (undefined grantLevel -> subclassGateLevel's fallback)", () => {
    const featureRows = { classRows: [], subclassRows: FAKE_SUBCLASS_ROWS };
    const infoAt = (level: number, edition: RulesEdition) =>
      deriveResources("fighter", "champion", level, ABILITIES, proficiencyBonusForLevel(level), featureRows, edition);

    expect(infoAt(2, "EDITION_2024")).toBeNull();
    expect(infoAt(3, "EDITION_2024")).not.toBeNull();
    expect(infoAt(2, "EDITION_2014")).toBeNull();
    expect(infoAt(3, "EDITION_2014")).not.toBeNull();
  });

  it("an unknown subclass name absent from SUBCLASS_IDENTITY too still resolves to nothing (the guard isn't disabled)", () => {
    const info = deriveResources("fighter", "not-a-real-subclass", 5, ABILITIES, proficiencyBonusForLevel(5), { classRows: [], subclassRows: [] }, "EDITION_2024");
    expect(info).toBeNull();
  });
});

const MODULE_LESS_SUBCLASSES: Array<[className: string, subclass: string, gate: number]> = [
  ["cleric", "life domain", 1], // PHB'14 p.57
  ["warlock", "the fiend", 1], // PHB'14 p.105
  ["wizard", "school of evocation", 2], // PHB'14 p.114
];

describe.each(MODULE_LESS_SUBCLASSES)("%s / %s resolves identity-only, same shape as Fighter/Champion (#1576)", (className, subclass, gate) => {
  it("resolves its seeded rows (pools AND features) with no lib/classes/<class>.ts to register it", () => {
    const featureRows = { classRows: [], subclassRows: FAKE_SUBCLASS_ROWS, subclassLevel: gate };
    const info = deriveResources(className, subclass, gate, ABILITIES, proficiencyBonusForLevel(gate), featureRows, "EDITION_2014");
    expect(info).not.toBeNull();
    expect(info?.features.map((f) => f.name)).toEqual(["Fake Subclass Feature"]);
    expect(info?.resources.map((r) => r.key)).toEqual(["fakeSubclassPool"]);
  });

  it("gates at its PHB'14 level under 2014 via the carrier's subclassLevel (no module grantLevel left to fall back to), and at 3 under 2024 regardless", () => {
    const featureRows = { classRows: [], subclassRows: FAKE_SUBCLASS_ROWS, subclassLevel: gate };
    const infoAt = (level: number, edition: RulesEdition) =>
      deriveResources(className, subclass, level, ABILITIES, proficiencyBonusForLevel(level), featureRows, edition);

    if (gate > 1) expect(infoAt(gate - 1, "EDITION_2014")).toBeNull();
    expect(infoAt(gate, "EDITION_2014")).not.toBeNull();
    expect(infoAt(2, "EDITION_2024")).toBeNull();
    expect(infoAt(3, "EDITION_2024")).not.toBeNull();
  });
});

describe("real registry: the overlay still wins for every class still on the TS path", () => {
  it("champion (identity-only in SUBCLASS_IDENTITY, no TS SubclassDefinition since fighter.ts's deletion) resolves to 'active but empty' with no rows supplied", async () => {
    const info = deriveResources("fighter", "champion", 3, ABILITIES, proficiencyBonusForLevel(3), { classRows: [], subclassRows: [] }, "EDITION_2024");
    expect(info).toBeNull();
  });

  it("Ranger (a class still fully on the TS path) is untouched by the identity-only seeding pass — Hunter's own choices catalog still resolves", async () => {
    const info2 = deriveResources(
      "ranger",
      "hunter",
      3,
      ABILITIES,
      proficiencyBonusForLevel(3),
      { classRows: [], subclassRows: [] },
      "EDITION_2024",
    );
    expect(info2).not.toBeNull();
    expect(info2?.subclassChoices).toBeDefined();
  });
});

// SUBCLASS_IDENTITY seeds SUBCLASSES by nameKey; each TS ClassDefinition's
// map then overlays it only while the two spellings agree. Diverge them and
// both survive under different keys, so a persisted subclass silently
// resolves to the poorer identity-only stub.
const TS_REGISTERED_CLASSES: Record<string, ClassDefinition> = {
  druid,
  monk,
  paladin,
  ranger,
};

describe("#1557 review — the SUBCLASSES overlay's key-equality invariant", () => {
  it("every TS subclass map key is exactly the nameKey its own declared slug resolves to", () => {
    const mismatches: string[] = [];
    for (const [classKey, def] of Object.entries(TS_REGISTERED_CLASSES)) {
      for (const [mapKey, subclassDef] of Object.entries(def.subclasses ?? {})) {
        const identity = SUBCLASS_IDENTITY[subclassDef.slug];
        if (identity.nameKey !== mapKey || identity.classKey !== classKey) {
          mismatches.push(
            `${classKey}.subclasses["${mapKey}"] declares slug "${subclassDef.slug}", whose identity is ${identity.classKey}/"${identity.nameKey}"`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  // Ties to CLASS_SUBCLASSES so a class added to CLASSES but omitted here
  // fails visibly instead of silently losing coverage.
  it("covers every class in CLASS_SUBCLASSES except Fighter, Barbarian, Rogue, Cleric, Warlock, Wizard, Sorcerer and Bard, which have no TS module", () => {
    expect(new Set([...Object.keys(TS_REGISTERED_CLASSES), "fighter", "barbarian", "rogue", "cleric", "warlock", "wizard", "sorcerer", "bard"])).toEqual(
      new Set(Object.keys(CLASS_SUBCLASSES)),
    );
  });
});
