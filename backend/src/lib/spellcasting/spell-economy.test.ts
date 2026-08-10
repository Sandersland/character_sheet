import { describe, expect, it } from "vitest";

import { spellEconomyRestrictions } from "./spell-economy.js";

const NONE = { bonusActionBlockedByActionSpell: false, bonusActionLimitedToCantrips: false, actionLimitedToCantrips: false };

// SRD 5.2 / PHB'24 — "One Spell with a Spell Slot per Turn": a leveled spell in
// either economy limits the OTHER to cantrips; a cantrip restricts nothing.
describe("spellEconomyRestrictions — 2024 (SRD 5.2)", () => {
  const rules = (a: "cantrip" | "leveled" | null, b: "cantrip" | "leveled" | null) =>
    spellEconomyRestrictions(a, b, "EDITION_2024");

  it("nothing cast → no restriction", () => {
    expect(rules(null, null)).toEqual(NONE);
  });

  it("leveled Action spell → bonus limited to CANTRIPS (not blocked), action free", () => {
    expect(rules("leveled", null)).toEqual({
      bonusActionBlockedByActionSpell: false,
      bonusActionLimitedToCantrips: true,
      actionLimitedToCantrips: false,
    });
  });

  it("leveled bonus-action spell → action limited to cantrips", () => {
    expect(rules(null, "leveled")).toEqual({
      bonusActionBlockedByActionSpell: false,
      bonusActionLimitedToCantrips: false,
      actionLimitedToCantrips: true,
    });
  });

  it("a cantrip in EITHER economy never restricts (2024)", () => {
    expect(rules("cantrip", "cantrip")).toEqual(NONE);
    expect(rules("cantrip", null)).toEqual(NONE);
    expect(rules(null, "cantrip")).toEqual(NONE);
  });
});

// SRD 5.1 / PHB'14 p.202 — a spell cast with a bonus action forbids any other
// spell that turn except a 1-action cantrip.
describe("spellEconomyRestrictions — 2014 (SRD 5.1)", () => {
  const rules = (a: "cantrip" | "leveled" | null, b: "cantrip" | "leveled" | null) =>
    spellEconomyRestrictions(a, b, "EDITION_2014");

  it("nothing cast → no restriction", () => {
    expect(rules(null, null)).toEqual(NONE);
  });

  it("leveled Action spell → bonus BLOCKED entirely (not even a cantrip)", () => {
    expect(rules("leveled", null)).toEqual({
      bonusActionBlockedByActionSpell: true,
      bonusActionLimitedToCantrips: false,
      actionLimitedToCantrips: false,
    });
  });

  it("a CANTRIP bonus-action spell still limits the action to cantrips (any bonus spell)", () => {
    expect(rules(null, "cantrip")).toEqual({
      bonusActionBlockedByActionSpell: false,
      bonusActionLimitedToCantrips: false,
      actionLimitedToCantrips: true,
    });
  });

  it("a leveled bonus-action spell also limits the action to cantrips", () => {
    expect(rules(null, "leveled")).toEqual({
      bonusActionBlockedByActionSpell: false,
      bonusActionLimitedToCantrips: false,
      actionLimitedToCantrips: true,
    });
  });

  it("a cantrip cast with the ACTION does not block the bonus action", () => {
    expect(rules("cantrip", null)).toEqual(NONE);
  });
});

// The edition difference the flags encode, side by side.
describe("edition divergence", () => {
  it("a cantrip-as-bonus limits the action in 2014 but NOT in 2024", () => {
    expect(spellEconomyRestrictions(null, "cantrip", "EDITION_2014").actionLimitedToCantrips).toBe(true);
    expect(spellEconomyRestrictions(null, "cantrip", "EDITION_2024").actionLimitedToCantrips).toBe(false);
  });

  it("a leveled Action spell BLOCKS the bonus action in 2014 but only limits it to cantrips in 2024", () => {
    expect(spellEconomyRestrictions("leveled", null, "EDITION_2014")).toMatchObject({
      bonusActionBlockedByActionSpell: true,
      bonusActionLimitedToCantrips: false,
    });
    expect(spellEconomyRestrictions("leveled", null, "EDITION_2024")).toMatchObject({
      bonusActionBlockedByActionSpell: false,
      bonusActionLimitedToCantrips: true,
    });
  });
});
