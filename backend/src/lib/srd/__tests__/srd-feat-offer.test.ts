import { describe, expect, it } from "vitest";

import { deriveFeatBonuses, featOfferedForAsiSlot } from "@/lib/srd/feats.js";
import type { AdvancementEntry } from "@/lib/classes/resources.js";

// Edition-invariant (#1310): PHB'24 pp. 87-88 draws origin/general/fighting_style
// /epic_boon; PHB'14's own rule (p.165, no per-feat level gate, earliest ASI at
// level 4) is what the "general" branch's `?? 4` default already encodes, so
// featOfferedForAsiSlot takes no `edition` parameter — every 2014 Feat row is
// `category: "general"` with a NULL levelPrerequisite, and origin/fighting_style
// /epic_boon rows are all EDITION_2024-tagged so a 2014 character never reaches
// those branches at all.
describe("featOfferedForAsiSlot", () => {
  it("never offers Origin feats", () => {
    expect(featOfferedForAsiSlot({ category: "origin", levelPrerequisite: null }, 1)).toBe(false);
    expect(featOfferedForAsiSlot({ category: "origin", levelPrerequisite: null }, 20)).toBe(false);
  });

  it("never offers Fighting Style feats via an ASI slot", () => {
    expect(featOfferedForAsiSlot({ category: "fighting_style", levelPrerequisite: null }, 20)).toBe(false);
  });

  it("offers General feats at level >= 4 (default prerequisite) — this IS the PHB'14 rule, not just PHB'24's", () => {
    expect(featOfferedForAsiSlot({ category: "general", levelPrerequisite: null }, 3)).toBe(false);
    expect(featOfferedForAsiSlot({ category: "general", levelPrerequisite: null }, 4)).toBe(true);
  });

  it("honours an explicit General levelPrerequisite override", () => {
    expect(featOfferedForAsiSlot({ category: "general", levelPrerequisite: 8 }, 7)).toBe(false);
    expect(featOfferedForAsiSlot({ category: "general", levelPrerequisite: 8 }, 8)).toBe(true);
  });

  it("offers Epic Boon feats only at level >= 19 (default prerequisite)", () => {
    expect(featOfferedForAsiSlot({ category: "epic_boon", levelPrerequisite: null }, 18)).toBe(false);
    expect(featOfferedForAsiSlot({ category: "epic_boon", levelPrerequisite: null }, 19)).toBe(true);
  });

  it("fails safe-closed for an unknown future category", () => {
    // A category added to the DB enum but not to the switch must never leak feats.
    expect(featOfferedForAsiSlot({ category: "mystery" as never, levelPrerequisite: null }, 20)).toBe(false);
  });
});

// PHB'24: Alert's initiative bonus scales with Proficiency Bonus rather than a
// flat +5 — modeled via FeatImprovement.scaling = "proficiencyBonus".
describe("deriveFeatBonuses — proficiencyBonus scaling", () => {
  const entry = (): AdvancementEntry => ({
    id: "e1",
    level: 4,
    kind: "feat",
    abilityDeltas: {},
    hpDelta: 0,
    initDelta: 0,
    improvements: [{ target: "initiative", amount: 1, scaling: "proficiencyBonus" }],
  });

  it("multiplies the amount by the proficiency bonus at the applied level", () => {
    expect(deriveFeatBonuses([entry()], 4).initiative).toBe(2); // PB +2 at level 4
    expect(deriveFeatBonuses([entry()], 5).initiative).toBe(3); // PB +3 at level 5
    expect(deriveFeatBonuses([entry()], 17).initiative).toBe(6); // PB +6 at level 17
  });
});
