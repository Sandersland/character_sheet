// Pure (no DB) tests for deriveEntryScopedActions: re-derives each class
// entry's own DERIVED_ACTIONS rows at THAT entry's own effective level,
// instead of only the primary entry at total level.
import { describe, expect, it } from "vitest";

import { deriveActions, deriveEntryScopedActions } from "@/lib/classes/actions.js";
import { testFeatureRowsFor } from "@/lib/classes/__tests__/test-feature-rows.fixture.js";
import { deriveDeflectSpec } from "@/lib/srd/deflect.js";

// Mirrors production's featureRowsOf.
const getFeatureRows = (entry: { name: string; subclass?: string }) => testFeatureRowsFor(entry.name, entry.subclass);

describe("deriveEntryScopedActions", () => {
  it("single-class parity: output is identical to a bare deriveActions call when the row carrier contributes nothing", () => {
    const entries = [{ name: "fighter", subclass: "eldritch knight", level: 3 }];
    const emptyRows = () => ({ classRows: [], subclassRows: [] });
    const entryScoped = deriveEntryScopedActions(entries, 3, [], true, "EDITION_2014", emptyRows);
    // deriveActions is slug-native — deriveEntryScopedActions resolves "eldritch knight" to this slug internally.
    const bare = deriveActions("fighter", "fighter-eldritch-knight", 3, [], true, "EDITION_2014");
    expect(entryScoped).toEqual(bare);
  });

  it("Fighter 5 (primary) / Warrior of Shadow monk 3 (secondary): shadowArts is present, keyed off the monk entry's own level (3) not total level (8)", () => {
    const entries = [
      { name: "fighter", subclass: undefined, level: 5 },
      { name: "monk", subclass: "warrior of shadow", level: 3 },
    ];
    const actions = deriveEntryScopedActions(entries, 8, [], true, "EDITION_2024", getFeatureRows);
    expect(actions.some((a) => a.key === "shadowArts")).toBe(true);
    expect(actions.some((a) => a.key === "cloakOfShadows")).toBe(false);
  });

  it("Fighter 5 (primary) / Warrior of Shadow monk 2 (secondary, below L3): shadowArts absent", () => {
    const entries = [
      { name: "fighter", subclass: undefined, level: 5 },
      { name: "monk", subclass: "warrior of shadow", level: 2 },
    ];
    const actions = deriveEntryScopedActions(entries, 7, [], true, "EDITION_2024", getFeatureRows);
    expect(actions.some((a) => a.key === "shadowArts")).toBe(false);
  });

  it("a secondary Fighter's actionSurge appears even though Fighter isn't the primary entry", () => {
    const entries = [
      { name: "wizard", subclass: undefined, level: 5 },
      { name: "fighter", subclass: undefined, level: 2 },
    ];
    const actions = deriveEntryScopedActions(entries, 7, [], true, "EDITION_2024", getFeatureRows);
    expect(actions.some((a) => a.key === "actionSurge")).toBe(true);
  });

  it("a row-driven Fighter action (actionSurge) is disabled when its pool is exhausted", () => {
    const entries = [{ name: "fighter", subclass: undefined, level: 2 }];
    const actions = deriveEntryScopedActions(entries, 2, [{ key: "actionSurge", remaining: 0 }], true, "EDITION_2024", getFeatureRows);
    const card = actions.find((a) => a.key === "actionSurge");
    expect(card?.enabled).toBe(false);
    expect(card?.disabledReason).toBe("No actionSurge remaining");
  });

  it("dedupes by key when two entries could both match (base/primary wins ties, mirrors mergeLayers)", () => {
    const entries = [
      { name: "monk", subclass: "warrior of shadow", level: 6 },
      { name: "monk", subclass: "warrior of shadow", level: 6 },
    ];
    const actions = deriveEntryScopedActions(entries, 12, [], true, "EDITION_2024", getFeatureRows);
    expect(actions.filter((a) => a.key === "shadowStep")).toHaveLength(1);
  });

  // Cleric grants Channel Divinity at class level 2, Paladin at level 3; one
  // merged row must surface as exactly one card for a multiclass.
  describe("channelDivinity — one row, two granting classes (#1340)", () => {
    it("cleric 2 / paladin 3: exactly one card, keyed channelDivinity (not the old per-class keys)", () => {
      const entries = [
        { name: "cleric", subclass: "life domain", level: 2 },
        { name: "paladin", subclass: "oath of devotion", level: 3 },
      ];
      const actions = deriveEntryScopedActions(entries, 5, [{ key: "channelDivinity", remaining: 1 }], true, "EDITION_2024", getFeatureRows);
      expect(actions.filter((a) => a.key === "channelDivinity")).toHaveLength(1);
      expect(actions.filter((a) => a.name === "Channel Divinity")).toHaveLength(1);
      expect(actions.some((a) => a.key === "channelDivinityCleric")).toBe(false);
      expect(actions.some((a) => a.key === "channelDivinityPaladin")).toBe(false);
    });

    it("paladin 4 (primary) / cleric 6 (secondary): still exactly one card", () => {
      const entries = [
        { name: "paladin", subclass: "oath of devotion", level: 4 },
        { name: "cleric", subclass: "life domain", level: 6 },
      ];
      const actions = deriveEntryScopedActions(entries, 10, [{ key: "channelDivinity", remaining: 2 }], true, "EDITION_2024", getFeatureRows);
      expect(actions.filter((a) => a.key === "channelDivinity")).toHaveLength(1);
    });

    it("cleric 1 / paladin 3: present (paladin's own gate alone grants it)", () => {
      const entries = [
        { name: "cleric", subclass: "life domain", level: 1 },
        { name: "paladin", subclass: "oath of devotion", level: 3 },
      ];
      const actions = deriveEntryScopedActions(entries, 4, [{ key: "channelDivinity", remaining: 1 }], true, "EDITION_2024", getFeatureRows);
      expect(actions.some((a) => a.key === "channelDivinity")).toBe(true);
    });

    it("cleric 1 / paladin 2: absent (neither entry has reached its own gate)", () => {
      const entries = [
        { name: "cleric", subclass: "life domain", level: 1 },
        { name: "paladin", subclass: "oath of devotion", level: 2 },
      ];
      const actions = deriveEntryScopedActions(entries, 3, [], true, "EDITION_2024", getFeatureRows);
      expect(actions.some((a) => a.key === "channelDivinity")).toBe(false);
    });

    it("cleric 2 / paladin 2: present (cleric's own gate alone grants it)", () => {
      const entries = [
        { name: "cleric", subclass: "life domain", level: 2 },
        { name: "paladin", subclass: "oath of devotion", level: 2 },
      ];
      const actions = deriveEntryScopedActions(entries, 4, [{ key: "channelDivinity", remaining: 1 }], true, "EDITION_2024", getFeatureRows);
      expect(actions.some((a) => a.key === "channelDivinity")).toBe(true);
    });

    it("the card's reminder names both granting classes", () => {
      const entries = [
        { name: "cleric", subclass: "life domain", level: 2 },
        { name: "paladin", subclass: "oath of devotion", level: 3 },
      ];
      const actions = deriveEntryScopedActions(entries, 5, [{ key: "channelDivinity", remaining: 1 }], true, "EDITION_2024", getFeatureRows);
      const card = actions.find((a) => a.key === "channelDivinity");
      expect(card?.reminder).toMatch(/Cleric/);
      expect(card?.reminder).toMatch(/Paladin/);
    });

    it("enabled respects the merged pool's remaining, not a per-class count", () => {
      const entries = [
        { name: "cleric", subclass: "life domain", level: 2 },
        { name: "paladin", subclass: "oath of devotion", level: 3 },
      ];
      const actions = deriveEntryScopedActions(entries, 5, [{ key: "channelDivinity", remaining: 0 }], true, "EDITION_2024", getFeatureRows);
      const card = actions.find((a) => a.key === "channelDivinity");
      expect(card?.enabled).toBe(false);
    });
  });

  // PHB'14 p.75: Eldritch Knight's Arcane Charge is reminder text on the
  // row-driven Action Surge action, not a new action row.
  describe("Arcane Charge — reminder on Action Surge (2014, #1852)", () => {
    it("an Eldritch Knight L15+ (2014) sees the Arcane Charge reminder on actionSurge", () => {
      const entries = [{ name: "fighter", subclass: "eldritch knight", level: 15 }];
      const actions = deriveEntryScopedActions(entries, 15, [], true, "EDITION_2014", getFeatureRows);
      const card = actions.find((a) => a.key === "actionSurge");
      expect(card?.reminder).toMatch(/Arcane Charge/);
      expect(card?.reminder).toMatch(/teleport/);
    });

    it("a non-Eldritch-Knight fighter L15+ (2014) sees no Arcane Charge reminder", () => {
      const entries = [{ name: "fighter", subclass: "champion", level: 15 }];
      const actions = deriveEntryScopedActions(entries, 15, [], true, "EDITION_2014", getFeatureRows);
      const card = actions.find((a) => a.key === "actionSurge");
      expect(card).toBeDefined();
      expect(card?.reminder).toBeUndefined();
    });

    it("an Eldritch Knight below level 15 (2014) sees no Arcane Charge reminder", () => {
      const entries = [{ name: "fighter", subclass: "eldritch knight", level: 14 }];
      const actions = deriveEntryScopedActions(entries, 14, [], true, "EDITION_2014", getFeatureRows);
      const card = actions.find((a) => a.key === "actionSurge");
      expect(card).toBeDefined();
      expect(card?.reminder).toBeUndefined();
    });

    it("an Eldritch Knight L15+ in 2024 sees no Arcane Charge reminder", () => {
      const entries = [{ name: "fighter", subclass: "eldritch knight", level: 15 }];
      const actions = deriveEntryScopedActions(entries, 15, [], true, "EDITION_2024", getFeatureRows);
      const card = actions.find((a) => a.key === "actionSurge");
      expect(card).toBeDefined();
      expect(card?.reminder).toBeUndefined();
    });

    it("an Eldritch Knight L15+ (2014), secondary entry: reminder keyed off the entry's own level, not total level", () => {
      const entries = [
        { name: "wizard", subclass: undefined, level: 10 },
        { name: "fighter", subclass: "eldritch knight", level: 15 },
      ];
      const actions = deriveEntryScopedActions(entries, 25, [], true, "EDITION_2014", getFeatureRows);
      const card = actions.find((a) => a.key === "actionSurge");
      expect(card?.reminder).toMatch(/Arcane Charge/);
    });

    it("a multiclass Eldritch Knight below Fighter 15 gets no reminder even when total level clears 15", () => {
      const entries = [
        { name: "wizard", subclass: undefined, level: 11 },
        { name: "fighter", subclass: "eldritch knight", level: 14 },
      ];
      const actions = deriveEntryScopedActions(entries, 25, [], true, "EDITION_2014", getFeatureRows);
      const card = actions.find((a) => a.key === "actionSurge");
      expect(card).toBeDefined();
      expect(card?.reminder).toBeUndefined();
    });
  });

  // deflectAugmentor attaches the resolved roll spec via the same fold point
  // Arcane Charge uses above; omitting abilityMods must leave `effect` unset rather than throw.
  describe("Deflect Attacks / Deflect Missiles — resolved effect via announce augmentor (#1910)", () => {
    const abilityMods = { dexterity: 3 };

    it("2024 monk L3: deflectAttacks carries the resolved reduction effect and the B/P/S damage-type clause", () => {
      const entries = [{ name: "monk", subclass: undefined, level: 3 }];
      const actions = deriveEntryScopedActions(entries, 3, [], true, "EDITION_2024", getFeatureRows, abilityMods);
      const expected = deriveDeflectSpec(3, 3, "EDITION_2024");
      const base = actions.find((a) => a.key === "deflectAttacks");
      expect(base?.effect).toEqual({ effectType: "utility", dice: expected.reduction, scaling: { mode: "none" } });
      expect(base?.damageTypeClause).toBe("bludgeoning, piercing, or slashing damage");
      const redirect = actions.find((a) => a.key === "deflectAttacksRedirect");
      expect(redirect?.effect).toEqual({ effectType: "damage", dice: expected.redirect, scaling: { mode: "none" } });
    });

    it("2024 monk L12: reduction/redirect dice scale with monk level, damage-type clause still B/P/S (below L13)", () => {
      const entries = [{ name: "monk", subclass: undefined, level: 12 }];
      const actions = deriveEntryScopedActions(entries, 12, [], true, "EDITION_2024", getFeatureRows, abilityMods);
      const expected = deriveDeflectSpec(12, 3, "EDITION_2024");
      const base = actions.find((a) => a.key === "deflectAttacks");
      expect(base?.effect).toEqual({ effectType: "utility", dice: expected.reduction, scaling: { mode: "none" } });
      expect(base?.damageTypeClause).toBe("bludgeoning, piercing, or slashing damage");
      const redirect = actions.find((a) => a.key === "deflectAttacksRedirect");
      expect(redirect?.effect).toEqual({ effectType: "damage", dice: expected.redirect, scaling: { mode: "none" } });
    });

    it("2024 monk L13: damage-type clause widens to 'any damage type' (Deflect Energy)", () => {
      const entries = [{ name: "monk", subclass: undefined, level: 13 }];
      const actions = deriveEntryScopedActions(entries, 13, [], true, "EDITION_2024", getFeatureRows, abilityMods);
      const expected = deriveDeflectSpec(13, 3, "EDITION_2024");
      const base = actions.find((a) => a.key === "deflectAttacks");
      expect(base?.effect).toEqual({ effectType: "utility", dice: expected.reduction, scaling: { mode: "none" } });
      expect(base?.damageTypeClause).toBe("any damage type");
    });

    it("2014 monk L3+: deflectMissiles carries the resolved reduction effect, deflectMissilesThrow the redirect (1d6+Dex)", () => {
      const entries = [{ name: "monk", subclass: undefined, level: 5 }];
      const actions = deriveEntryScopedActions(entries, 5, [], true, "EDITION_2014", getFeatureRows, abilityMods);
      const expected = deriveDeflectSpec(5, 3, "EDITION_2014");
      const base = actions.find((a) => a.key === "deflectMissiles");
      expect(base?.effect).toEqual({ effectType: "utility", dice: expected.reduction, scaling: { mode: "none" } });
      expect(base?.damageTypeClause).toBeUndefined();
      const throwBack = actions.find((a) => a.key === "deflectMissilesThrow");
      expect(throwBack?.effect).toEqual({ effectType: "damage", dice: expected.redirect, scaling: { mode: "none" } });
    });

    it("omitting abilityMods (the cast-guard callers' shape) leaves deflectAttacks unaugmented", () => {
      const entries = [{ name: "monk", subclass: undefined, level: 3 }];
      const actions = deriveEntryScopedActions(entries, 3, [], true, "EDITION_2024", getFeatureRows);
      const base = actions.find((a) => a.key === "deflectAttacks");
      expect(base).toBeDefined();
      expect(base?.effect).toBeUndefined();
    });
  });
});
