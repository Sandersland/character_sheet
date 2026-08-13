// Pure (no DB) tests for deriveEntryScopedActions (#1315): the shared rule
// function backing `availableActions[]` (serialize/classes.ts) that re-derives
// each class entry's own DERIVED_ACTIONS rows at THAT entry's own effective
// level, instead of only the primary entry at total level — mirrors
// deriveEntryScopedResources (#1206/#1177). This is also the function
// shadow-arts.ts's cast guards resolve through (shadow-arts.ts), so a secondary
// Warrior of Shadow monk's shadowArts/cloakOfShadows gate the same way for both
// the wire value and the cast guard — see CLAUDE.md's level-gated-registry rule.
import { describe, expect, it } from "vitest";

import { deriveActions, deriveEntryScopedActions } from "@/lib/classes/actions.js";
import { testFeatureRowsFor } from "@/lib/classes/__tests__/test-feature-rows.fixture.js";
import { deriveDeflectSpec } from "@/lib/srd/deflect.js";

// Fighter's Second Wind/Action Surge are row-driven now (#1528) — every
// deriveEntryScopedActions call below that expects to see them needs this
// carrier callback (mirrors production's featureRowsOf).
const getFeatureRows = (entry: { name: string; subclass?: string }) => testFeatureRowsFor(entry.name, entry.subclass);

describe("deriveEntryScopedActions", () => {
  it("single-class parity: output is identical to a bare deriveActions call", () => {
    const entries = [{ name: "monk", subclass: "warrior of shadow", level: 6 }];
    const entryScoped = deriveEntryScopedActions(entries, 6, [], true, "EDITION_2024", getFeatureRows);
    // deriveActions is slug-native (#1277) — "warrior of shadow" resolves to
    // this slug via resolveSubclassSlug, which deriveEntryScopedActions calls
    // internally; this bare comparison passes the resolved slug directly.
    const bare = deriveActions("monk", "monk-warrior-of-shadow", 6, [], true, "EDITION_2024");
    expect(entryScoped).toEqual(bare);
  });

  it("Fighter 5 (primary) / Warrior of Shadow monk 3 (secondary): shadowArts is present, keyed off the monk entry's own level (3) not total level (8)", () => {
    const entries = [
      { name: "fighter", subclass: undefined, level: 5 },
      { name: "monk", subclass: "warrior of shadow", level: 3 },
    ];
    const actions = deriveEntryScopedActions(entries, 8, [], true, "EDITION_2024", getFeatureRows);
    expect(actions.some((a) => a.key === "shadowArts")).toBe(true);
    // cloakOfShadows needs monk entry level 17 — nowhere near reached at entry level 3,
    // even though the (irrelevant) total level of 8 is well past shadowArts' own gate.
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
    // Generalizes the same fix beyond monk: buildAvailableActionsView used to
    // derive only from the PRIMARY entry, so a secondary Fighter's actions never
    // appeared regardless of its own level.
    const entries = [
      { name: "wizard", subclass: undefined, level: 5 },
      { name: "fighter", subclass: undefined, level: 2 },
    ];
    const actions = deriveEntryScopedActions(entries, 7, [], true, "EDITION_2024", getFeatureRows);
    expect(actions.some((a) => a.key === "actionSurge")).toBe(true);
  });

  // #1528: actionFromRow (actions.ts) resolves a row-driven action's
  // enabled/disabledReason through the SAME resolveEnablement function the
  // DERIVED_ACTIONS path uses (proven generically by wildShape's test in
  // actions.test.ts) — but nothing exercised that shared function actually
  // getting called correctly off a Fighter row's own resourceKey/cost until
  // this test (actions.test.ts's two references to a nonexistent
  // "actionsFromRows.test.ts" claimed this coverage lived here; it didn't).
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

  // #1340: cleric.ts (grantLevel 2) and paladin.ts (grantLevel 3) both grant
  // "Channel Divinity" — one merged DERIVED_ACTIONS row (key "channelDivinity",
  // grantClasses) must surface as exactly ONE card for a Cleric/Paladin
  // multiclass, keyed off each entry's own effective level (mirrors
  // deriveEntryScopedActions' existing dedupe-by-key policy).
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

  // Eldritch Knight Arcane Charge (2014, PHB'14 p.75, #1852): reminder text
  // riding the row-driven Action Surge action, not a new action row — pure
  // self-or-announce (#416: positional teleport, no target/positioning
  // model). Mutation-proofs all three gates (subclass, level, edition)
  // independently, mirroring shadowArts'/cloakOfShadows' own per-gate style
  // above.
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

    // The discriminating negative: total level (25) clears the L15 gate but
    // the fighter ENTRY's own level (14) does not — a gate reading total
    // level would wrongly attach the reminder here, so this test FAILS if
    // withArcaneChargeReminder is ever fed totalLevel instead of effLevel.
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

  // Deflect Attacks (2024) / Deflect Missiles (2014) announce augmentor
  // (#1910): deflectAugmentor (lib/srd/deflect.ts) attaches the resolved roll
  // spec via the SAME fold point Arcane Charge uses above. `abilityMods` is
  // the new optional parameter threaded through for this (#1910's scope item
  // 3) — omitting it (as shadow-arts.ts/disciplines.ts/warrior-of-elements.ts
  // do) must leave `effect` unset even though the gate action key is present,
  // proving the augmentor no-ops rather than throwing.
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
