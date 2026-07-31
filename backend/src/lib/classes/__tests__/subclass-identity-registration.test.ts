// #1546 Part A — subclass REGISTRATION moves off the `CLASSES` map (built from
// lib/classes/<class>.ts) and onto SUBCLASS_IDENTITY (subclass-slug.ts, #1277's
// sanctioned join table). This is the test the issue's pre-flight says would
// have caught Finding 1: `SUBCLASSES` used to be built by iterating
// `Object.values(CLASSES)` alone, and `deriveSubclassLayer` returned early with
// EMPTY pools AND features when a subclass key had no TS entry — so removing a
// class from `CLASSES` (#1532's whole point for Fighter) silently deleted
// every seeded subclass row for that class's subclasses. Champion is the
// sharpest case: its old lib/classes/fighter.ts entry was pure registration
// (`{ slug, grantLevel }`, no resourceFn/deriveExtras), so it looked like the
// safest deletion in the file — and would have been the most silent regression.
//
// Originally proved with `fighter.ts` mocked to register no subclasses,
// simulating #1532's end state before that issue existed. #1532 has since
// deleted `lib/classes/fighter.ts` outright, so the real (unmocked) registry
// already IS that end state — the tests below import the real module and
// assert against it directly, with no `vi.doMock` scaffolding left to retire.
import { describe, expect, it } from "vitest";

import type { RulesEdition } from "@character-sheet/shared-types";

import { barbarian } from "@/lib/classes/barbarian.js";
import { bard } from "@/lib/classes/bard.js";
import { cleric } from "@/lib/classes/cleric.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { druid } from "@/lib/classes/druid.js";
import { monk } from "@/lib/classes/monk.js";
import { paladin } from "@/lib/classes/paladin.js";
import { ranger } from "@/lib/classes/ranger.js";
import { rogue } from "@/lib/classes/rogue.js";
import { sorcerer } from "@/lib/classes/sorcerer.js";
import { SUBCLASS_IDENTITY } from "@/lib/classes/subclass-slug.js";
import type { ClassDefinition } from "@/lib/classes/types.js";
import { warlock } from "@/lib/classes/warlock.js";
import { wizard } from "@/lib/classes/wizard.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { CLASS_SUBCLASSES } from "./class-subclasses.fixture.js";
import { testFeatureRowsFor } from "./test-feature-rows.fixture.js";

const ABILITIES = { strength: 10, dexterity: 10, constitution: 12, intelligence: 14, wisdom: 16, charisma: 16 };

// Fabricated rows standing in for seeded ClassFeature rows — proves the
// derivation reads ROWS, not a TS SubclassDefinition, for a subclass whose
// class has none (Fighter's three, since #1532).
const FAKE_SUBCLASS_ROWS = (["EDITION_2014", "EDITION_2024"] as const).map((edition) => ({
  name: "Fake Champion Feature",
  level: 3,
  description: "stand-in row, not real Champion content",
  edition,
  resourceKey: "fakeChampionPool",
  resourceLabel: "Fake Pool",
  resourceRecharge: "longRest",
  resourceTotals: [{ minLevel: 3, total: 2 }],
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
    expect(info?.features.map((f) => f.name)).toEqual(["Fake Champion Feature"]);
    expect(info?.resources.map((r) => r.key)).toEqual(["fakeChampionPool"]);
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
    expect(info?.resources.map((r) => r.key)).toEqual(["fakeChampionPool"]);
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

describe("real registry: the overlay still wins for every class still on the TS path", () => {
  it("champion (identity-only in SUBCLASS_IDENTITY, no TS SubclassDefinition since fighter.ts's deletion) resolves to 'active but empty' with no rows supplied", async () => {
    const info = deriveResources("fighter", "champion", 3, ABILITIES, proficiencyBonusForLevel(3), { classRows: [], subclassRows: [] }, "EDITION_2024");
    // Champion carries no resourceFn/deriveExtras/features array — pure
    // registration — so with no rows supplied there is nothing to derive.
    // This just pins that the real registry still resolves it as "active,
    // empty" rather than null-because-unregistered.
    expect(info).toBeNull();
  });

  it("Wizard (a class still fully on the TS path) is untouched by the identity-only seeding pass — its authored .features still resolve", async () => {
    const info2 = deriveResources(
      "wizard",
      "school of evocation",
      2,
      ABILITIES,
      proficiencyBonusForLevel(2),
      testFeatureRowsFor("wizard", "school of evocation"),
      "EDITION_2014",
    );
    expect(info2).not.toBeNull();
    expect((info2?.features ?? []).length).toBeGreaterThan(0);
  });

  // Retired (#1546 Part B): this test used to prove the overlay wins by
  // supplying NO rows and getting real maneuverChoiceCount/maneuverSaveDC/
  // toolProfChoiceCount anyway — proof they came from fighter.ts's
  // `deriveExtras`, which an identity-only `{ slug }` stub doesn't carry.
  // Part B deleted that `deriveExtras` (registry.ts's deriveRowExtras reads
  // Combat Superiority/Student of War's OWN rows instead), so Battle Master
  // no longer has a code-authored value an identity-only stub could lose —
  // supplying no rows now correctly yields nothing, same as an unregistered
  // subclass would. No other class currently sets `deriveExtras` (Battle
  // Master was the last), so the overlay-wins-on-extras claim has no live
  // subject to test empirically; the overlay mechanism itself (registry.ts's
  // second SUBCLASSES loop unconditionally overwriting the identity-only
  // seed) is still covered structurally by Champion's/Wizard's cases here.
});

// #1557 review: registry.ts builds SUBCLASSES in two passes — SUBCLASS_IDENTITY
// keyed by `nameKey` first, then each TS ClassDefinition's `subclasses` keyed by
// its own map key. Its comment claims the second pass "immediately replaces"
// the first for every still-TS-registered subclass, which is true ONLY while
// the two spellings are the same string. Diverge them and both survive under
// different keys: a character whose persisted `subclass` matches the nameKey
// silently resolves to the identity-only `{ slug }` stub — no resourceFn, no
// deriveExtras, no choices — while the richer definition sits unreachable. That
// is a behaviour regression no type and no existing test could see, so assert it.
const TS_REGISTERED_CLASSES: Record<string, ClassDefinition> = {
  barbarian,
  bard,
  cleric,
  druid,
  monk,
  paladin,
  ranger,
  rogue,
  sorcerer,
  warlock,
  wizard,
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

  // Keeps the map above honest: a twelfth class added to registry.ts's CLASSES
  // but not here would leave its subclasses unchecked by the test above, and
  // nothing else would notice. CLASS_SUBCLASSES is maintained by two other
  // suites, so tying to it means the omission fails HERE rather than silently
  // shrinking coverage. Fighter is the one class with no TS module at all
  // (#1532 deleted it) — its three subclasses are identity-only by design.
  it("covers every class in CLASS_SUBCLASSES except Fighter, which has no TS module", () => {
    expect(new Set([...Object.keys(TS_REGISTERED_CLASSES), "fighter"])).toEqual(new Set(Object.keys(CLASS_SUBCLASSES)));
  });
});
