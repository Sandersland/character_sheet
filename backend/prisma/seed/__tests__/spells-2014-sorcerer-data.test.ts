// #1718 (content slice of epic #1517): shape + cross-check invariants for the
// Sorcerer by-class spell bucket. Pure data tests on the array itself — same
// pattern as spells-2014-shared-data.test.ts (#1713), spells-2014-wizard-data
// .test.ts (#1714), spells-2014-cleric-data.test.ts (#1715), spells-2014-
// druid-data.test.ts (#1716), and spells-2014-bard-data.test.ts (#1717) —
// because the DB round-trip (one Spell row per name, SpellClass fan-out,
// `?class=` resolution) is already proven generically by
// spell-fork-reseed.test.ts (#1710) and spells.test.ts's SpellClass-join
// describe blocks (#1711); this file's only job is to prove THIS SLICE'S
// DATA is correct, not re-prove the plumbing.
//
// Unlike every prior by-class slice, SORCERER_SPELLS_2014 owns ZERO rows:
// Sorcerer's full PHB'14 list overlaps so heavily with Wizard (and, for a
// handful of spells, Cleric/Druid) that every single one of Sorcerer's 123
// PHB'14 spells already has a higher-priority class on its list. See
// sorcerer.ts's own header comment for the full accounting.
import { describe, expect, it } from "vitest";

import { SORCERER_SPELLS_2014 } from "../spells-2014/sorcerer.js";
import { WIZARD_SPELLS_2014 } from "../spells-2014/wizard.js";
import { CLERIC_SPELLS_2014 } from "../spells-2014/cleric.js";
import { DRUID_SPELLS_2014 } from "../spells-2014/druid.js";
import { BARD_SPELLS_2014 } from "../spells-2014/bard.js";
import { SHARED_SPELLS_2014 } from "../spells-2014/shared.js";

describe("SORCERER_SPELLS_2014 — row-ownership rule (epic #1517)", () => {
  it("owns zero rows — every PHB'14 Sorcerer spell already has a higher-priority class (Wizard/Cleric/Druid/Bard) on its list", () => {
    expect(SORCERER_SPELLS_2014).toEqual([]);
  });

  it("no row hardcodes its own edition — index.ts's SPELLS_2014 default is the only place that sets it (vacuous while the array is empty, kept for parity with the other by-class slices)", () => {
    const tagged = SORCERER_SPELLS_2014.filter((s) => s.edition !== undefined).map((s) => s.name);
    expect(tagged).toEqual([]);
  });
});

describe("SORCERER_SPELLS_2014 — full PHB'14 Sorcerer membership is complete across all authoring slices", () => {
  // The full PHB'14 Sorcerer spell list (126 spells: dnd5eapi.co's
  // /api/2014/classes/sorcerer/spells enumerates 120; Chromatic Orb and Ray
  // of Sickness are real PHB'14 Sorcerer spells absent from that SRD-based
  // dataset (already authored in wizard.ts, #1714); Witch Bolt is a third
  // absent-from-SRD PHB'14 Sorcerer spell this slice found missing from every
  // file and added to shared.ts. #1719 (Warlock)'s own manual sweep for
  // spells absent from dnd5eapi found 3 MORE: Cloud of Daggers, Crown of
  // Madness, and Friends are all genuine PHB'14 Sorcerer spells (each a
  // Bard/Sorcerer/Warlock/Wizard 4-list spell) missing from every slice
  // until #1719 added them to shared.ts — bumping this total from 123 to
  // 126) partitioned by which slice authors the row. Every name below must
  // carry "sorcerer" in its classes[] wherever it's actually authored —
  // this test is the permanent guard that the "already fanned" claim in
  // sorcerer.ts's header holds.
  const WIZARD_OWNED_SORCERER_SPELLS = [
    "Acid Splash",
    "Fire Bolt",
    "Ray of Frost",
    "Shocking Grasp",
    "Burning Hands",
    "Chromatic Orb",
    "Color Spray",
    "False Life",
    "Mage Armor",
    "Magic Missile",
    "Ray of Sickness",
    "Shield",
    "Alter Self",
    "Blur",
    "Enlarge/Reduce",
    "Levitate",
    "Scorching Ray",
    "Web",
    "Blink",
    "Fireball",
    "Haste",
    "Lightning Bolt",
    "Slow",
    "Cloudkill",
    "Cone of Cold",
    "Creation",
    "Telekinesis",
    "Chain Lightning",
    "Disintegrate",
    "Globe of Invulnerability",
    "Delayed Blast Fireball",
    "Prismatic Spray",
    "Incendiary Cloud",
    "Meteor Swarm",
    "Time Stop",
    "Wish",
  ];
  const DRUID_OWNED_SORCERER_SPELLS = ["Dominate Beast"];

  it("every Wizard-owned spell Sorcerer also gets already carries sorcerer membership in wizard.ts (membership-only, not re-authored here)", () => {
    const missing = WIZARD_OWNED_SORCERER_SPELLS.filter((name) => {
      const row = WIZARD_SPELLS_2014.find((s) => s.name === name);
      return !row || !row.classes.includes("sorcerer");
    });
    expect(missing, "a Wizard-owned Sorcerer spell missing its sorcerer membership tag in wizard.ts").toEqual([]);
  });

  it("every Druid-owned spell Sorcerer also gets already carries sorcerer membership in druid.ts (membership-only, not re-authored here)", () => {
    const missing = DRUID_OWNED_SORCERER_SPELLS.filter((name) => {
      const row = DRUID_SPELLS_2014.find((s) => s.name === name);
      return !row || !row.classes.includes("sorcerer");
    });
    expect(missing, "a Druid-owned Sorcerer spell missing its sorcerer membership tag in druid.ts").toEqual([]);
  });

  it("no Cleric-owned or Bard-owned 2-list spell exists that Sorcerer also gets (Cleric and Bard both outrank Sorcerer in the tie-break, so any such spell would be their territory, not a gap here) — both files carry zero sorcerer tags", () => {
    expect(CLERIC_SPELLS_2014.filter((s) => s.classes.includes("sorcerer")).map((s) => s.name)).toEqual([]);
    expect(BARD_SPELLS_2014.filter((s) => s.classes.includes("sorcerer")).map((s) => s.name)).toEqual([]);
  });

  it("SHARED_SPELLS_2014's sorcerer-tagged row count plus the Wizard/Druid owner slices' sorcerer-tagged counts plus this slice's own 0 rows equals the full 126-spell PHB'14 Sorcerer list", () => {
    const sharedSorcererCount = SHARED_SPELLS_2014.filter((s) => s.classes.includes("sorcerer")).length;
    const total = sharedSorcererCount + WIZARD_OWNED_SORCERER_SPELLS.length + DRUID_OWNED_SORCERER_SPELLS.length + SORCERER_SPELLS_2014.length;
    expect(total).toBe(126);
  });

  it("no PHB'14 2024-only Sorcerer addition (e.g. Chaos Bolt, Shield of Faith reassigned to Sorcerer in 2024) is offered anywhere in the 2014 tables — this slice's membership check only counts genuine 2014 Sorcerer-owned spells", () => {
    // Shield of Faith is Cleric/Paladin-only in the 2014 SRD list; 2024 added
    // Sorcerer to it. It must not carry a sorcerer tag in any 2014 file.
    const shieldOfFaith = [...WIZARD_SPELLS_2014, ...CLERIC_SPELLS_2014, ...DRUID_SPELLS_2014, ...BARD_SPELLS_2014, ...SHARED_SPELLS_2014].find(
      (s) => s.name === "Shield of Faith",
    );
    expect(shieldOfFaith?.classes.includes("sorcerer")).not.toBe(true);
  });
});
