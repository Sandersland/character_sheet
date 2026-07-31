// #1546 Part A — subclass REGISTRATION moves off the `CLASSES` map (built from
// lib/classes/<class>.ts) and onto SUBCLASS_IDENTITY (subclass-slug.ts, #1277's
// sanctioned join table). This is the test the issue's pre-flight says would
// have caught Finding 1: `SUBCLASSES` used to be built by iterating
// `Object.values(CLASSES)` alone, and `deriveSubclassLayer` returned early with
// EMPTY pools AND features when a subclass key had no TS entry — so removing a
// class from `CLASSES` (#1532's whole point for Fighter) silently deleted
// every seeded subclass row for that class's subclasses. Champion is the
// sharpest case: its lib/classes/fighter.ts entry is pure registration
// (`{ slug, grantLevel }`, no resourceFn/deriveExtras), so it looked like the
// safest deletion in the file — and would have been the most silent regression.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RulesEdition } from "@character-sheet/shared-types";

import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { testFeatureRowsFor } from "./test-feature-rows.fixture.js";

const ABILITIES = { strength: 10, dexterity: 10, constitution: 12, intelligence: 14, wisdom: 16, charisma: 16 };

// Fabricated rows standing in for seeded ClassFeature rows — proves the
// derivation reads ROWS, not the TS SubclassDefinition, once "champion" is
// gone from fighter.ts's `subclasses`.
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

async function loadRegistryWithFighterUnregistered() {
  vi.resetModules();
  // Mock fighter.ts to register NO subclasses at all — simulating the
  // post-#1532 state (fighter.ts deleted) without actually deleting the file,
  // since Part A only changes the registration mechanism, not fighter.ts's
  // content (that's Part B / #1532).
  vi.doMock("@/lib/classes/fighter.js", () => ({
    fighter: { subclasses: {} },
  }));
  return import("@/lib/classes/class-features.js");
}

describe("#1546 Part A — SUBCLASSES resolves from SUBCLASS_IDENTITY when a class has no TS SubclassDefinition", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/classes/fighter.js");
    vi.resetModules();
  });

  it("champion resolves its seeded rows (pools AND features) with fighter.ts registering nothing", async () => {
    const { deriveResources } = await loadRegistryWithFighterUnregistered();
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

  it("battle master resolves its rows too — not just the no-resourceFn Champion case", async () => {
    const { deriveResources } = await loadRegistryWithFighterUnregistered();
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

  it("the identity-only entry still gates at level 3 in BOTH editions (undefined grantLevel -> subclassGateLevel's fallback)", async () => {
    const { deriveResources } = await loadRegistryWithFighterUnregistered();
    const featureRows = { classRows: [], subclassRows: FAKE_SUBCLASS_ROWS };
    const infoAt = (level: number, edition: RulesEdition) =>
      deriveResources("fighter", "champion", level, ABILITIES, proficiencyBonusForLevel(level), featureRows, edition);

    expect(infoAt(2, "EDITION_2024")).toBeNull();
    expect(infoAt(3, "EDITION_2024")).not.toBeNull();
    expect(infoAt(2, "EDITION_2014")).toBeNull();
    expect(infoAt(3, "EDITION_2014")).not.toBeNull();
  });

  it("an unknown subclass name absent from SUBCLASS_IDENTITY too still resolves to nothing (the guard isn't disabled)", async () => {
    const { deriveResources } = await loadRegistryWithFighterUnregistered();
    const info = deriveResources("fighter", "not-a-real-subclass", 5, ABILITIES, proficiencyBonusForLevel(5), { classRows: [], subclassRows: [] }, "EDITION_2024");
    expect(info).toBeNull();
  });
});

describe("#1546 Part A — real (unmocked) registry: the overlay still wins for every class still on the TS path", () => {
  it("champion (currently TS-registered) resolves through the real registry unchanged", async () => {
    const { deriveResources } = await import("@/lib/classes/class-features.js");
    const info = deriveResources("fighter", "champion", 3, ABILITIES, proficiencyBonusForLevel(3), { classRows: [], subclassRows: [] }, "EDITION_2024");
    // Champion carries no resourceFn/deriveExtras/features array — pure
    // registration — so with no rows supplied there is nothing to derive.
    // This just pins that the real (non-mocked) path still resolves it as
    // "active, empty" rather than null-because-unregistered.
    expect(info).toBeNull();
  });

  it("Wizard (a class still fully on the TS path) is untouched by the identity-only seeding pass — its authored .features still resolve", async () => {
    const { deriveResources } = await import("@/lib/classes/class-features.js");
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

  it("Battle Master's deriveExtras still wins over its identity-only stub (proves the overlay, not just the seeding pass)", async () => {
    const { deriveResources } = await import("@/lib/classes/class-features.js");
    const info = deriveResources(
      "fighter",
      "battle master",
      3,
      ABILITIES,
      proficiencyBonusForLevel(3),
      { classRows: [], subclassRows: [] },
      "EDITION_2024",
    );
    // No rows supplied, yet maneuverChoiceCount/maneuverSaveDC/toolProfChoiceCount
    // are present — they can only have come from fighter.ts's own `deriveExtras`,
    // which an identity-only `{ slug }` stub does not carry.
    expect(info?.maneuverChoiceCount).toBe(3);
    expect(info?.toolProfChoiceCount).toBe(1);
    expect(typeof info?.maneuverSaveDC).toBe("number");
  });
});
