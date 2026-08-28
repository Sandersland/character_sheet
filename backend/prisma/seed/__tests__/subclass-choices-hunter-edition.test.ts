import { describe, expect, it } from "vitest";

import { SUBCLASS_CHOICE_OPTIONS } from "../subclass-choices.js";

type Edition = "EDITION_2014" | "EDITION_2024";

function optionsFor(source: string, edition: Edition) {
  return SUBCLASS_CHOICE_OPTIONS.filter((o) => o.source === source && o.edition === edition);
}

function optionNamed(source: string, name: string, edition: Edition) {
  const found = optionsFor(source, edition).filter((o) => o.name === name);
  expect(found, `${source}/${name}/${edition}`).toHaveLength(1);
  return found[0];
}

describe("2014-only Hunter options (SRD 5.1 pp. 37-38; absent from SRD 5.2 p. 61)", () => {
  it.each([
    ["huntersPrey", "Giant Killer"],
    ["defensiveTactics", "Steel Will"],
    ["hunterMultiattack", "Volley"],
    ["hunterMultiattack", "Whirlwind Attack"],
    ["superiorHuntersDefense", "Evasion"],
    ["superiorHuntersDefense", "Stand Against the Tide"],
    ["superiorHuntersDefense", "Uncanny Dodge"],
  ])("%s/%s is tagged EDITION_2014 and has no EDITION_2024 row", (source, name) => {
    expect(optionsFor(source, "EDITION_2014").some((o) => o.name === name)).toBe(true);
    expect(optionsFor(source, "EDITION_2024").some((o) => o.name === name)).toBe(false);
  });
});

describe("2014 query yields today's full option set, SRD 5.1 pp. 37-38 text", () => {
  it("huntersPrey: Colossus Slayer, Giant Killer, Horde Breaker", () => {
    expect(optionsFor("huntersPrey", "EDITION_2014").map((o) => o.name).sort()).toEqual(["Colossus Slayer", "Giant Killer", "Horde Breaker"]);
  });

  it("defensiveTactics: Escape the Horde, Multiattack Defense, Steel Will", () => {
    expect(optionsFor("defensiveTactics", "EDITION_2014").map((o) => o.name).sort()).toEqual(["Escape the Horde", "Multiattack Defense", "Steel Will"]);
  });
});

describe("2024 query yields exactly the surviving options, SRD 5.2 p. 61 verbatim text (transcription fidelity)", () => {
  it("huntersPrey narrows to Colossus Slayer + Horde Breaker", () => {
    expect(optionsFor("huntersPrey", "EDITION_2024").map((o) => o.name).sort()).toEqual(["Colossus Slayer", "Horde Breaker"]);
  });

  it("defensiveTactics narrows to Escape the Horde + Multiattack Defense", () => {
    expect(optionsFor("defensiveTactics", "EDITION_2024").map((o) => o.name).sort()).toEqual(["Escape the Horde", "Multiattack Defense"]);
  });

  it("hunterMultiattack and superiorHuntersDefense have no EDITION_2024 options at all", () => {
    expect(optionsFor("hunterMultiattack", "EDITION_2024")).toEqual([]);
    expect(optionsFor("superiorHuntersDefense", "EDITION_2024")).toEqual([]);
  });

  it("Colossus Slayer (2024): verbatim SRD 5.2 p. 61 text — no mechanical change, but 'wounded' rewords to 'missing any of its Hit Points'", () => {
    expect(optionNamed("huntersPrey", "Colossus Slayer", "EDITION_2024").description).toBe(
      "Your tenacity can wear down even the most resilient foes. When you hit a creature with a weapon, the weapon deals an extra 1d8 damage to the target if it's missing any of its Hit Points. You can deal this extra damage only once per turn.",
    );
  });

  it("Horde Breaker (2024): verbatim SRD 5.2 p. 61 text — adds the 'haven't attacked this turn' restriction (a real mechanical change vs 5.1)", () => {
    expect(optionNamed("huntersPrey", "Horde Breaker", "EDITION_2024").description).toBe(
      "Once on each of your turns when you make an attack with a weapon, you can make another attack with the same weapon against a different creature that is within 5 feet of the original target, that is within the weapon's range, and that you haven't attacked this turn.",
    );
    expect(optionNamed("huntersPrey", "Horde Breaker", "EDITION_2014").description).not.toContain("haven't attacked this turn");
  });

  it("Escape the Horde (2024): verbatim SRD 5.2 p. 61 text — no mechanical change, Disadvantage capitalized per SRD 5.2 style", () => {
    expect(optionNamed("defensiveTactics", "Escape the Horde", "EDITION_2024").description).toBe(
      "Opportunity Attacks have Disadvantage against you.",
    );
  });

  it("Multiattack Defense (2024): verbatim SRD 5.2 p. 61 text — a full mechanical rework, +4 AC becomes attacker Disadvantage", () => {
    expect(optionNamed("defensiveTactics", "Multiattack Defense", "EDITION_2024").description).toBe(
      "When a creature hits you with an attack roll, that creature has Disadvantage on all other attack rolls against you this turn.",
    );
    expect(optionNamed("defensiveTactics", "Multiattack Defense", "EDITION_2014").description).toContain("+4 bonus to AC");
  });
});
