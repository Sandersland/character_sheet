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

  it("SHARED_SPELLS_2014's sorcerer-tagged row count plus the Wizard/Druid owner slices' sorcerer-tagged counts plus this slice's own 0 rows equals the full 129-spell PHB'14 Sorcerer list", () => {
    const sharedSorcererCount = SHARED_SPELLS_2014.filter((s) => s.classes.includes("sorcerer")).length;
    const total = sharedSorcererCount + WIZARD_OWNED_SORCERER_SPELLS.length + DRUID_OWNED_SORCERER_SPELLS.length + SORCERER_SPELLS_2014.length;
    expect(total).toBe(129);
  });

  it("no PHB'14 2024-only Sorcerer addition (e.g. Chaos Bolt, Shield of Faith reassigned to Sorcerer in 2024) is offered anywhere in the 2014 tables — this slice's membership check only counts genuine 2014 Sorcerer-owned spells", () => {
    const shieldOfFaith = [...WIZARD_SPELLS_2014, ...CLERIC_SPELLS_2014, ...DRUID_SPELLS_2014, ...BARD_SPELLS_2014, ...SHARED_SPELLS_2014].find(
      (s) => s.name === "Shield of Faith",
    );
    expect(shieldOfFaith?.classes.includes("sorcerer")).not.toBe(true);
  });
});
