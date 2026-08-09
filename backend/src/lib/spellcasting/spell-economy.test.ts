import { describe, expect, it } from "vitest";

import { spellEconomyRestrictions } from "./spell-economy.js";

describe("spellEconomyRestrictions (#1439)", () => {
  it("nothing cast → both flags false", () => {
    expect(spellEconomyRestrictions(null, null)).toEqual({
      bonusActionBlockedByActionSpell: false,
      actionLimitedToCantrips: false,
    });
  });

  it("leveled Action spell → bonus action blocked, action not limited", () => {
    expect(spellEconomyRestrictions("leveled", null)).toEqual({
      bonusActionBlockedByActionSpell: true,
      actionLimitedToCantrips: false,
    });
  });

  it("leveled bonus-action spell → action limited to cantrips, bonus not blocked", () => {
    expect(spellEconomyRestrictions(null, "leveled")).toEqual({
      bonusActionBlockedByActionSpell: false,
      actionLimitedToCantrips: true,
    });
  });

  it("a cantrip in either slot never restricts", () => {
    expect(spellEconomyRestrictions("cantrip", "cantrip")).toEqual({
      bonusActionBlockedByActionSpell: false,
      actionLimitedToCantrips: false,
    });
  });

  it("leveled in both slots sets both flags", () => {
    expect(spellEconomyRestrictions("leveled", "leveled")).toEqual({
      bonusActionBlockedByActionSpell: true,
      actionLimitedToCantrips: true,
    });
  });
});
