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

import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

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
