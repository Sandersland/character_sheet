import { describe, expect, it } from "vitest";

import type { RulesEdition } from "@character-sheet/shared-types";

import { CONDITIONS, conditionDefinition, conditionRulesText, exhaustionRollEffects } from "@/lib/srd/condition-data.js";
import type { RollEffect } from "@/lib/srd/roll-effects.js";

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

// Pins reference equality, not deep equality — a duplicated row per edition would defeat the point of the sparse override map.
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

// rollEffects is deliberately dropped from the wire — the client receives resolved rollModifiers already, so shipping per-condition grants would ship the rule.
describe("conditionRulesText", () => {
  // Asserts alphabetical label order, not declaration order; can't catch the sort being removed since CONDITIONS is already alphabetical.
  it("returns all 14 conditions in alphabetical label order, for both editions", () => {
    for (const edition of ["EDITION_2024", "EDITION_2014"] as const) {
      const rows = conditionRulesText(edition);
      expect(rows).toHaveLength(14);
      expect(rows.map((r) => r.label)).toEqual([...rows.map((r) => r.label)].sort((a, b) => a.localeCompare(b)));
      expect([...rows.map((r) => r.key)].sort()).toEqual([...CONDITIONS.map((c) => c.key)].sort());
    }
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

// Initiative is a Dexterity check — SRD 5.2 / PHB'14 p. 189, Combat → Initiative.
describe("CONDITIONS invariant — unqualified check disadvantage must cover Initiative (#1327)", () => {
  // ability:undefined excludes ability-scoped grants like Rage's Strength-check advantage from tripping this check.
  const isUnqualifiedCheckDisadvantage = (e: RollEffect): boolean =>
    e.mode === "disadvantage" && e.kind === "check" && e.ability === undefined;

  // ability:undefined here too — an ability-scoped initiative grant wouldn't discharge an unqualified check grant.
  const isUnqualifiedInitiativeDisadvantage = (e: RollEffect): boolean =>
    e.mode === "disadvantage" && e.kind === "initiative" && e.ability === undefined;

  const offenders = (edition: RulesEdition) =>
    CONDITIONS.map((c) => c.key).filter((key) => {
      const effects = conditionDefinition(key, edition).rollEffects ?? [];
      return effects.some(isUnqualifiedCheckDisadvantage) && !effects.some(isUnqualifiedInitiativeDisadvantage);
    });

  it.each(["EDITION_2024", "EDITION_2014"] as const)(
    "%s: every condition granting unqualified disadvantage on ability checks also grants it on Initiative",
    (edition) => {
      expect(offenders(edition)).toEqual([]);
    },
  );

  // Non-vacuity pin: prevents the invariant above from passing on an empty set.
  it.each(["EDITION_2024", "EDITION_2014"] as const)("%s: covers exactly frightened and poisoned today", (edition) => {
    const covered = CONDITIONS.map((c) => c.key).filter((key) => {
      const effects = conditionDefinition(key, edition).rollEffects ?? [];
      return effects.some(isUnqualifiedCheckDisadvantage);
    });
    expect(covered).toEqual(["frightened", "poisoned"]);
  });

  it.each(["EDITION_2024", "EDITION_2014"] as const)(
    "%s: exhaustionRollEffects honours the same invariant at every level 0-6",
    (edition) => {
      for (let level = 0; level <= 6; level++) {
        const effects = exhaustionRollEffects(level, edition);
        if (effects.some(isUnqualifiedCheckDisadvantage)) {
          expect(effects.some(isUnqualifiedInitiativeDisadvantage)).toBe(true);
        }
      }
    },
  );
});
