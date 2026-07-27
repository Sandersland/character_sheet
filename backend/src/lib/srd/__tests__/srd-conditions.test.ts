import { describe, expect, it } from "vitest";

import { CONDITIONS, conditionDefinition, conditionRulesText } from "@/lib/srd/condition-data.js";

// #1309: the 2014 half of what #1135 replaced. Nine conditions carry real
// mechanical or textual deltas from PHB'14 to SRD 5.2; the other five are
// byte-identical across editions and must resolve to the exact same object
// (not a duplicated row) in both.
describe("conditionDefinition — 2014 divergent conditions (#1309, PHB'14 pp. 290-292 Appendix A)", () => {
  it("charmed: 2014 description differs from 2024's; rollEffects stay absent in both", () => {
    const c2014 = conditionDefinition("charmed", "EDITION_2014");
    const c2024 = conditionDefinition("charmed", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.description).toBe(
      "Can't attack the charmer or target it with harmful abilities or magical effects. The charmer has advantage on ability checks to interact socially with the creature.",
    );
    expect(c2014.rollEffects).toBeUndefined();
    expect(c2024.rollEffects).toBeUndefined();
  });

  it("grappled: 2014 has no rollEffects; 2024 grants disadvantage on attack", () => {
    const c2014 = conditionDefinition("grappled", "EDITION_2014");
    const c2024 = conditionDefinition("grappled", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toBeUndefined();
    expect(c2024.rollEffects).toEqual([{ mode: "disadvantage", kind: "attack" }]);
  });

  it("incapacitated: 2014 has no rollEffects; 2024 grants disadvantage on initiative", () => {
    const c2014 = conditionDefinition("incapacitated", "EDITION_2014");
    const c2024 = conditionDefinition("incapacitated", "EDITION_2024");
    expect(c2014.description).toBe("Can't take actions or reactions.");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toBeUndefined();
    expect(c2024.rollEffects).toEqual([{ mode: "disadvantage", kind: "initiative" }]);
  });

  it("invisible: 2014 grants advantage on attack only; 2024 adds advantage on initiative too", () => {
    const c2014 = conditionDefinition("invisible", "EDITION_2014");
    const c2024 = conditionDefinition("invisible", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toEqual([{ mode: "advantage", kind: "attack" }]);
    expect(c2024.rollEffects).toEqual([
      { mode: "advantage", kind: "initiative" },
      { mode: "advantage", kind: "attack" },
    ]);
  });

  it("invisible: 2014 description keeps the load-bearing 'for the purpose of hiding' qualifier a prior transcription dropped", () => {
    const c2014 = conditionDefinition("invisible", "EDITION_2014");
    expect(c2014.description).toBe(
      "Impossible to see without the aid of magic or a special sense. For the purpose of hiding, the creature is heavily obscured. Attack rolls against it have disadvantage, and its attack rolls have advantage.",
    );
  });

  it("paralyzed: 2014 has no rollEffects; 2024 grants disadvantage on initiative (Incapacitated inheritance)", () => {
    const c2014 = conditionDefinition("paralyzed", "EDITION_2014");
    const c2024 = conditionDefinition("paralyzed", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toBeUndefined();
    expect(c2024.rollEffects).toEqual([{ mode: "disadvantage", kind: "initiative" }]);
  });

  it("petrified: 2014 has no rollEffects; 2024 grants disadvantage on initiative (Incapacitated inheritance)", () => {
    const c2014 = conditionDefinition("petrified", "EDITION_2014");
    const c2024 = conditionDefinition("petrified", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toBeUndefined();
    expect(c2024.rollEffects).toEqual([{ mode: "disadvantage", kind: "initiative" }]);
  });

  it("petrified: 2014 description includes the weight/aging, auto-failed-saves, and advantage-to-hit clauses (PHB'14 p. 291) that a prior transcription dropped", () => {
    const c2014 = conditionDefinition("petrified", "EDITION_2014");
    expect(c2014.description).toBe(
      "Transformed, along with nonmagical objects it is wearing or carrying, into a solid inanimate substance; its weight increases by a factor of ten, and it ceases aging. Incapacitated, can't move or speak, and is unaware of its surroundings. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage. Resistant to all damage; immune to poison and disease.",
    );
  });

  it("prone: description differs, but rollEffects (disadvantage on attack) stay identical", () => {
    const c2014 = conditionDefinition("prone", "EDITION_2014");
    const c2024 = conditionDefinition("prone", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toEqual([{ mode: "disadvantage", kind: "attack" }]);
    expect(c2024.rollEffects).toEqual([{ mode: "disadvantage", kind: "attack" }]);
  });

  it("stunned: 2014 has no rollEffects; 2024 grants disadvantage on initiative (Incapacitated inheritance)", () => {
    const c2014 = conditionDefinition("stunned", "EDITION_2014");
    const c2024 = conditionDefinition("stunned", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toBeUndefined();
    expect(c2024.rollEffects).toEqual([{ mode: "disadvantage", kind: "initiative" }]);
  });

  it("unconscious: 2014 flattens Prone's disadvantage on attack (both editions inherit Prone; 2014 Incapacitated just has no initiative grant to add)", () => {
    const c2014 = conditionDefinition("unconscious", "EDITION_2014");
    const c2024 = conditionDefinition("unconscious", "EDITION_2024");
    expect(c2014.description).not.toBe(c2024.description);
    expect(c2014.rollEffects).toEqual([{ mode: "disadvantage", kind: "attack" }]);
    expect(c2024.rollEffects).toEqual([
      { mode: "disadvantage", kind: "initiative" },
      { mode: "disadvantage", kind: "attack" },
    ]);
  });
});

// The remaining 5 conditions are byte-identical across editions; a
// duplicated row per edition would defeat the point of the sparse override
// map, so this pins reference equality, not just deep equality.
describe("conditionDefinition — byte-identical conditions resolve to one shared object (#1309)", () => {
  it.each(["blinded", "deafened", "frightened", "poisoned", "restrained"] as const)(
    "%s: 2014 and 2024 lookups return the exact same CONDITIONS row",
    (key) => {
      const c2014 = conditionDefinition(key, "EDITION_2014");
      const c2024 = conditionDefinition(key, "EDITION_2024");
      expect(c2014).toBe(c2024);
      expect(c2014).toBe(CONDITIONS.find((c) => c.key === key));
    },
  );
});

// #1322: these five pins were deleted from the frontend's CONDITION_DESCRIPTIONS
// (frontend/src/lib/conditions.test.ts) along with the mirror they lived in.
// Carried here rather than dropped, now asserted against the backend rules
// text they were always describing.
describe("conditionDefinition — 2024 (SRD 5.2) text pins migrated from the deleted frontend CONDITION_DESCRIPTIONS (#1322)", () => {
  it("scopes Grappled's attack disadvantage to targets other than the grappler", () => {
    expect(conditionDefinition("grappled", "EDITION_2024").description).toContain(
      "other than the grappler",
    );
  });

  it("mentions Invisible's advantage on initiative", () => {
    expect(conditionDefinition("invisible", "EDITION_2024").description.toLowerCase()).toContain(
      "initiative",
    );
  });

  it("mentions Incapacitated breaking Concentration and can't speak", () => {
    const description = conditionDefinition("incapacitated", "EDITION_2024").description;
    expect(description).toContain("Concentration");
    expect(description.toLowerCase()).toContain("can't speak");
  });

  it("no longer says Stunned can't move (2024 trim)", () => {
    expect(conditionDefinition("stunned", "EDITION_2024").description.toLowerCase()).not.toContain(
      "can't move",
    );
  });

  it("gives Petrified immunity to the Poisoned condition", () => {
    expect(conditionDefinition("petrified", "EDITION_2024").description).toContain("Poisoned");
  });
});

// #1322: the resolved {key,label,description} rows served on GET /api/reference.
// rollEffects is deliberately dropped — the client receives resolved
// rollModifiers already, so shipping raw per-condition grants would ship the rule.
describe("conditionRulesText", () => {
  it("returns all 14 conditions, in CONDITIONS' order, for both editions", () => {
    expect(conditionRulesText("EDITION_2024")).toHaveLength(14);
    expect(conditionRulesText("EDITION_2014")).toHaveLength(14);
    expect(conditionRulesText("EDITION_2024").map((r) => r.key)).toEqual(
      CONDITIONS.map((c) => c.key),
    );
  });

  it("each row is exactly {key,label,description} — no rollEffects on the wire", () => {
    for (const row of conditionRulesText("EDITION_2024")) {
      expect(Object.keys(row).sort()).toEqual(["description", "key", "label"]);
    }
  });

  it("forks one of #1309's nine divergent conditions between editions", () => {
    const grappled2014 = conditionRulesText("EDITION_2014").find((r) => r.key === "grappled")!;
    const grappled2024 = conditionRulesText("EDITION_2024").find((r) => r.key === "grappled")!;
    expect(grappled2014.description).not.toBe(grappled2024.description);
    expect(grappled2014.description).toContain("The condition ends if the grappler is incapacitated");
    expect(grappled2024.description).toContain("other than the grappler");
  });

  it("resolves one of the five edition-invariant conditions identically across editions", () => {
    const poisoned2014 = conditionRulesText("EDITION_2014").find((r) => r.key === "poisoned")!;
    const poisoned2024 = conditionRulesText("EDITION_2024").find((r) => r.key === "poisoned")!;
    expect(poisoned2014.description).toBe(poisoned2024.description);
  });

  it("labels never fork by edition and stay alphabetically ordered starting with Blinded", () => {
    const rows = conditionRulesText("EDITION_2024");
    expect(rows[0]).toMatchObject({ key: "blinded", label: "Blinded" });
    expect(rows.find((r) => r.key === "grappled")).toMatchObject({ label: "Grappled" });
  });
});
