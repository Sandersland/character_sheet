// Pins deriveResources() output across every class/subclass/level combination.
// This is the safety net for the class-features.ts → classes/<class>.ts split
// (#662): the split must move content verbatim, so this snapshot must stay
// byte-identical before and after the refactor.
//
// #1524 RE-SCOPE (arbiter-corrected AC — see #1524's struck criteria): the
// original AC ("byte-identical for both editions after the swap") is
// unsatisfiable. `deriveResources` now takes a `featureRows` carrier
// immediately before `edition`; this file calls it with real carriers built
// from testFeatureRowsFor (the TS modules — #1524's Fact 1), so `.features`
// itself still derives real content, but every entry now ALSO carries a
// required `edition` field that didn't exist before (DerivedFeature.edition
// was optional and this snapshot never recorded it). Recording that on every
// one of ~50 test cases would be a wall of one-line adds carrying no signal.
// `features` is split OUT of the recorded object below; the DB-backed parity
// test (class-feature-parity.test.ts) was the stronger proof that the move
// changed no feature content, until #1675 retired it (vacuous the moment
// Monk, its last un-skipped class, joined LITERAL_ROW_CLASSES —
// literal-fixture-parity.test.ts, #1593, is the content-drift proof now).
// This snapshot has no such expiry — resources/extras/choices never depended
// on the TS arrays' feature text at all.
import { describe, expect, it } from "vitest";

import { deriveResources, deriveResourcesForCharacterRow, resolveClassDie, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { CLASS_SUBCLASSES } from "./class-subclasses.fixture.js";
import { testFeatureRowsFor } from "./test-feature-rows.fixture.js";

const ABILITY_SCORES = {
  strength: 14,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  wisdom: 13,
  charisma: 15,
};

// Strips `features` from a derived info object for the snapshot — see the
// file header for why. `resources`/extras (maneuverChoiceCount/SaveDC,
// toolProfChoiceCount)/subclassChoices are untouched by #1524's move (they
// never read featureRows), so this is the whole of what changed.
function withoutFeatures(info: DerivedClassInfo | null): unknown {
  if (!info) return null;
  const rest: Record<string, unknown> = { ...info };
  delete rest.features;
  return rest;
}

describe("deriveResources snapshot — pins output for every class/subclass across all 20 levels", () => {
  for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
    for (const subclass of subclasses) {
      it(`${className} / ${subclass ?? "(no subclass)"}`, () => {
        const featureRows = testFeatureRowsFor(className, subclass);
        const byLevel = Array.from({ length: 20 }, (_, i) => {
          const level = i + 1;
          const profBonus = proficiencyBonusForLevel(level);
          return {
            level,
            info: withoutFeatures(deriveResources(className, subclass, level, ABILITY_SCORES, profBonus, featureRows, "EDITION_2024")),
          };
        });
        expect(byLevel).toMatchSnapshot();
      });
    }
  }

  it("returns null for a wholly unknown class", () => {
    expect(deriveResources("not-a-class", undefined, 5, ABILITY_SCORES, 3, undefined, "EDITION_2024")).toBeNull();
  });
});

describe("resolveClassDie snapshot — every class-die pool across all classes/subclasses", () => {
  for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
    for (const subclass of subclasses) {
      it(`${className} / ${subclass ?? "(no subclass)"}`, () => {
        const featureRows = testFeatureRowsFor(className, subclass);
        const rows = Array.from({ length: 20 }, (_, i) => {
          const level = i + 1;
          const profBonus = proficiencyBonusForLevel(level);
          const info = deriveResources(className, subclass, level, ABILITY_SCORES, profBonus, featureRows, "EDITION_2024");
          if (!info) return { level, dice: {} };
          const dice: Record<string, number | null> = {};
          for (const resource of info.resources) {
            if (resource.die) dice[resource.key] = resolveClassDie(resource.key, info);
          }
          return { level, dice };
        });
        expect(rows).toMatchSnapshot();
      });
    }
  }
});

describe("deriveResourcesForCharacterRow", () => {
  it("derives level + resources from XP and the primary class entry", () => {
    const { derived, level } = deriveResourcesForCharacterRow({
      experiencePoints: 355000,
      abilityScores: ABILITY_SCORES,
      classEntries: [{ name: "fighter", subclass: "battle master" }],
      rulesEdition: "EDITION_2024",
    });
    expect(level).toBe(20);
    // #1524: deriveResourcesForCharacterRow has no relation to read (its row
    // type carries no class/subclassRef), so `.features` is now always empty
    // here — expected (no production caller exists; see registry.ts's own
    // comment). #1528: the same absent-carrier gap also means Fighter's
    // row-driven base pools (Second Wind/Action Surge/Indomitable) are absent
    // from `.resources` here. #1546 Part B retired the LAST exception:
    // Battle Master's superiorityDice pool/maneuverChoiceCount/
    // toolProfChoiceCount/maneuverSaveDC moved off fighter.ts's `resourceFn`/
    // `deriveExtras` (unaffected by a missing carrier) onto rows too, so this
    // absent-carrier caller now sees NOTHING at all — `derived` is null.
    expect(derived).toBeNull();
  });

  it("returns null derived resources and level 1 for an empty class-entry list", () => {
    const { derived, level } = deriveResourcesForCharacterRow({
      experiencePoints: 0,
      abilityScores: ABILITY_SCORES,
      classEntries: [],
      rulesEdition: "EDITION_2024",
    });
    expect(level).toBe(1);
    expect(derived).toBeNull();
  });
});
