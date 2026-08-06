import { describe, it, expect } from "vitest";

import { BATTLE_MASTER_ROWS } from "@/lib/classes/__tests__/test-feature-rows.fixture.js";
import {
  buildLevelUpPlan,
  type LevelUpPlanCharacter,
  type TargetClassEntry,
} from "@/lib/leveling/level-up-plan.js";

const ABILITIES = { strength: 16, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 12, charisma: 10 };

// Builds a single-class character in the pre-level-up state. 2024 by default —
// this suite's fixture-level TargetClassEntry.subclassLevel values already
// stand in for the edition-resolved gate (#1308's comment on TargetClassEntry);
// deriveResources' OWN edition threading (#1291) is covered separately.
function char(
  name: string,
  level: number,
  subclass: string | null = null,
  edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024",
): LevelUpPlanCharacter {
  return { abilityScores: ABILITIES, classEntries: [{ name, level, subclass }], edition };
}

// Placeholder for the ~50 cases below that assert on step KINDS and never on HP
// numbers: `hitDie` is required (#1380) so they need a value, but which one is
// irrelevant to them and pinning each class's real die would be noise.
// **If you add an HP-meta assertion to a kinds-only test, pass that class's real
// die** — every case that reads meta does so explicitly (see the hitPoints-meta
// describe), and this default would silently give a Wizard the Fighter's d10.
const ANY_DIE = "d10";

// #1529: TargetClassEntry.extraAsiLevels/fightingStyleFeatLevel are now
// resolved by the CALLER from CharacterClass columns (resolveLevelUpContext
// does this in production); this pure-planner test fixture stands in with the
// same real per-class values the deleted EXTRA_ASI_LEVELS/
// fightingStyleFeatSlots records held, keyed the same lowercase way.
const CLASS_TABLE_DEFAULTS: Record<string, { extraAsiLevels: number[]; fightingStyleFeatLevel: number | null }> = {
  fighter: { extraAsiLevels: [6, 14], fightingStyleFeatLevel: 1 },
  rogue: { extraAsiLevels: [10], fightingStyleFeatLevel: null },
  paladin: { extraAsiLevels: [], fightingStyleFeatLevel: 2 },
  ranger: { extraAsiLevels: [], fightingStyleFeatLevel: 2 },
};

function target(
  name: string,
  newLevel: number,
  subclass: string | null = null,
  subclassLevel?: number,
  hitDie = ANY_DIE,
): TargetClassEntry {
  const defaults = CLASS_TABLE_DEFAULTS[name.toLowerCase()] ?? { extraAsiLevels: [], fightingStyleFeatLevel: null };
  return { name, newLevel, subclass, subclassLevel, hitDie, ...defaults };
}

// Extracts just the step kinds in order (the plan's ordered shape).
function kinds(steps: ReturnType<typeof buildLevelUpPlan>): string[] {
  return steps.map((s) => s.kind);
}

describe("buildLevelUpPlan — skeleton", () => {
  it("always brackets a plain level with hitPoints … review", () => {
    const plan = buildLevelUpPlan(char("fighter", 4), target("fighter", 5, "champion"));
    expect(kinds(plan)).toEqual(["hitPoints", "review"]);
  });
});

// #1380: the ceremony no longer reconstructs this from the reference catalog —
// these cases are the coverage that moved off the frontend's deleted hitDice.ts
// rule half (averageHitPointGain / hitPointGainRange / hitPointStepMath).
describe("buildLevelUpPlan — hitPoints meta", () => {
  function hitPointsMeta(constitution: number | undefined, hitDie: string): Record<string, unknown> {
    const abilityScores: Record<string, number> = { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10 };
    if (constitution !== undefined) abilityScores.constitution = constitution;
    const character: LevelUpPlanCharacter = {
      abilityScores,
      classEntries: [{ name: "fighter", level: 4, subclass: "champion" }],
      edition: "EDITION_2024",
    };
    const plan = buildLevelUpPlan(character, target("fighter", 5, "champion", undefined, hitDie));
    const step = plan.find((s) => s.kind === "hitPoints");
    if (!step?.meta) throw new Error("no hitPoints meta on the plan");
    return step.meta;
  }

  it("serves the die, faces, Con mod, fixed base, average gain and roll range (d10, Con 16)", () => {
    expect(hitPointsMeta(16, "d10")).toEqual({
      die: "d10",
      faces: 10,
      conMod: 3,
      fixedAverage: 6,
      averageGain: 9,
      minRoll: 4,
      maxRoll: 13,
      // No hpBaseline supplied → the inert all-zero default: effectiveMax is
      // just rawMax(0) + each outcome's gain (#1497).
      effectiveMaxAverage: 9,
      effectiveMaxByRoll: [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    });
  });

  it("applies a negative Con modifier to the average and both range ends (d6, Con 6)", () => {
    expect(hitPointsMeta(6, "d6")).toMatchObject({ conMod: -2, fixedAverage: 4, averageGain: 2, minRoll: 1, maxRoll: 4 });
  });

  // fixedAverage is served rather than left to the client because the max(1, …)
  // level-up floor makes it unrecoverable as averageGain − conMod: that would
  // read 1 − (−5) = 6 here, when the d6 fixed average is 4.
  it("floors averageGain at 1 while still serving the unfloored fixed average (d6, Con 1)", () => {
    expect(hitPointsMeta(1, "d6")).toMatchObject({ conMod: -5, fixedAverage: 4, averageGain: 1, minRoll: 1, maxRoll: 1 });
  });

  it("treats a missing constitution score as 10, exactly as the commit path does", () => {
    expect(hitPointsMeta(undefined, "d8")).toMatchObject({ conMod: 0, fixedAverage: 5, averageGain: 5 });
  });
});

// #1497: the post-level EFFECTIVE max (character.hitPoints.max's own
// composition, effectiveMaxHitPoints/hp-core.ts) — served so neither
// HitPointsStep nor buildLevelUpLedger has to add the level-up gain to the
// already-halved served max (PHB'14 p. 291 exhaustion tier 4, #1321), which is
// wrong once the halving itself grows with the new max.
describe("buildLevelUpPlan — hitPoints meta — effective post-level max (#1497)", () => {
  function effectiveMaxMeta(
    hpBaseline: { rawMax: number; featMaxHpBonus: number; exhaustionLevel: number },
    edition: "EDITION_2014" | "EDITION_2024",
    hitDie = "d10",
    constitution = 14,
  ): Record<string, unknown> {
    const abilityScores: Record<string, number> = { strength: 10, dexterity: 10, constitution, intelligence: 10, wisdom: 10, charisma: 10 };
    const character: LevelUpPlanCharacter = {
      abilityScores,
      classEntries: [{ name: "fighter", level: 4, subclass: "champion" }],
      edition,
      hpBaseline,
    };
    const plan = buildLevelUpPlan(character, target("fighter", 5, "champion", undefined, hitDie));
    const step = plan.find((s) => s.kind === "hitPoints");
    if (!step?.meta) throw new Error("no hitPoints meta on the plan");
    return step.meta;
  }

  // Con 14 → conMod +2; d10 average gain = floor(10/2)+1+2 = 8.
  it("halves an ODD pre-halving max the same way the commit does (2014, exhaustion 4, rawMax 31)", () => {
    const meta = effectiveMaxMeta({ rawMax: 31, featMaxHpBonus: 0, exhaustionLevel: 4 }, "EDITION_2014");
    // newRawMax = 31 + 8 = 39; halved (round up subtracted) = 39 - 20 = 19.
    expect(meta.effectiveMaxAverage).toBe(19);
  });

  it("halves an EVEN pre-halving max the same way the commit does (2014, exhaustion 4, rawMax 30)", () => {
    const meta = effectiveMaxMeta({ rawMax: 30, featMaxHpBonus: 0, exhaustionLevel: 4 }, "EDITION_2014");
    // newRawMax = 30 + 8 = 38; halved (round up subtracted) = 38 - 19 = 19.
    expect(meta.effectiveMaxAverage).toBe(19);
  });

  it("serves a per-roll effective-max array, indexed 1..faces, each independently halved (2014, exhaustion 4, rawMax 31)", () => {
    const meta = effectiveMaxMeta({ rawMax: 31, featMaxHpBonus: 0, exhaustionLevel: 4 }, "EDITION_2014", "d6", 14);
    const byRoll = meta.effectiveMaxByRoll as number[];
    expect(byRoll[0]).toBe(0); // inert placeholder — never a roll value.
    // Con +2; roll r → gain max(1, r+2); newRawMax = 31 + gain; then halved.
    for (let roll = 1; roll <= 6; roll++) {
      const gain = Math.max(1, roll + 2);
      const newRawMax = 31 + gain;
      expect(byRoll[roll]).toBe(newRawMax - Math.ceil(newRawMax / 2));
    }
  });

  it("a feat maxHp bonus is added before the exhaustion halving, same order as effectiveMaxHitPoints (2014, exhaustion 4)", () => {
    const meta = effectiveMaxMeta({ rawMax: 30, featMaxHpBonus: 4, exhaustionLevel: 4 }, "EDITION_2014");
    // newRawMax = 30 + 8 = 38; + feat 4 = 42; halved = 42 - 21 = 21.
    expect(meta.effectiveMaxAverage).toBe(21);
  });

  it("matches plain rawMax + gain when exhaustion is below tier 4 (2014, exhaustion 3) — today's numbers, unchanged", () => {
    const meta = effectiveMaxMeta({ rawMax: 31, featMaxHpBonus: 0, exhaustionLevel: 3 }, "EDITION_2014");
    expect(meta.effectiveMaxAverage).toBe(31 + 8);
  });

  it("matches plain rawMax + gain under SRD 5.2, even at a nominal exhaustion 4 — no tier-4 HP rule in 2024 (#1321)", () => {
    const meta = effectiveMaxMeta({ rawMax: 31, featMaxHpBonus: 0, exhaustionLevel: 4 }, "EDITION_2024");
    expect(meta.effectiveMaxAverage).toBe(31 + 8);
  });
});

describe("buildLevelUpPlan — advancement (ASI/Feat)", () => {
  it("Fighter 7→8 grants one advancement slot", () => {
    const plan = buildLevelUpPlan(char("fighter", 7, "champion"), target("fighter", 8, "champion"));
    expect(kinds(plan)).toEqual(["hitPoints", "advancement", "review"]);
    expect(plan.find((s) => s.kind === "advancement")?.count).toBe(1);
  });

  it("Fighter 6→7 grants no advancement (level 7 is not an ASI level)", () => {
    const plan = buildLevelUpPlan(char("fighter", 6, "champion"), target("fighter", 7, "champion"));
    expect(kinds(plan)).not.toContain("advancement");
  });

  it("Fighter's bonus ASI at level 6 is recognised", () => {
    const plan = buildLevelUpPlan(char("fighter", 5, "champion"), target("fighter", 6, "champion"));
    expect(kinds(plan)).toEqual(["hitPoints", "advancement", "review"]);
  });
});

describe("buildLevelUpPlan — subclass", () => {
  it("Champion Fighter 2→3 (unset) prompts the subclass choice", () => {
    const plan = buildLevelUpPlan(char("fighter", 2), target("fighter", 3, null));
    expect(kinds(plan)).toEqual(["hitPoints", "subclass", "review"]);
  });

  it("an already-chosen subclass emits no subclass step at level 3", () => {
    const plan = buildLevelUpPlan(char("fighter", 2, "champion"), target("fighter", 3, "champion"));
    expect(kinds(plan)).not.toContain("subclass");
  });

  it("Cleric 2→3 (unset) prompts the subclass choice at the default level 3 (#1128)", () => {
    const plan = buildLevelUpPlan(char("cleric", 2), target("cleric", 3, null));
    expect(kinds(plan)).toEqual(["hitPoints", "subclass", "review"]);
  });

  it("respects a passed-in non-default subclassLevel (subclass step at level 1)", () => {
    const plan = buildLevelUpPlan(char("cleric", 0), target("cleric", 1, null, 1));
    expect(kinds(plan)).toContain("subclass");
  });
});

describe("buildLevelUpPlan — bespoke choose-N (maneuvers/fightingStyleFeat/toolProficiency)", () => {
  it("Battle Master 6→7 grants 2 maneuvers", () => {
    // #1546 Part B-ii: maneuverChoiceCount is ROW-driven now (Combat
    // Superiority's derivedStat) — the persisted subclassFeatureRows carrier
    // must be supplied, mirroring what resolveLevelUpContext resolves in
    // production (TARGET_ENTRY_SELECT's subclassRef.features).
    const plan = buildLevelUpPlan(char("fighter", 6, "battle master"), { ...target("fighter", 7, "battle master"), subclassFeatureRows: BATTLE_MASTER_ROWS });
    expect(kinds(plan)).toEqual(["hitPoints", "maneuvers", "review"]);
    expect(plan.find((s) => s.kind === "maneuvers")?.count).toBe(2);
  });

  it("Fighter 0→1 grants a Fighting Style feat (#1137)", () => {
    const plan = buildLevelUpPlan(char("fighter", 0), target("fighter", 1, null));
    expect(kinds(plan)).toEqual(["hitPoints", "fightingStyleFeat", "review"]);
    expect(plan.find((s) => s.kind === "fightingStyleFeat")?.count).toBe(1);
  });

  it("Paladin 1→2 and Ranger 1→2 grant a Fighting Style feat (#1137)", () => {
    for (const cls of ["paladin", "ranger"]) {
      const plan = buildLevelUpPlan(char(cls, 1), target(cls, 2, null));
      expect(kinds(plan)).toContain("fightingStyleFeat");
      expect(plan.find((s) => s.kind === "fightingStyleFeat")?.count).toBe(1);
    }
  });

  it("Paladin 2→3 and a Fighter level-up past 1 grant no fighting-style feat", () => {
    expect(kinds(buildLevelUpPlan(char("paladin", 2), target("paladin", 3, null)))).not.toContain("fightingStyleFeat");
    expect(kinds(buildLevelUpPlan(char("fighter", 4, "champion"), target("fighter", 5, "champion")))).not.toContain("fightingStyleFeat");
  });

  it("Battle Master 2→3 re-plan (subclass pre-chosen) surfaces maneuvers + tool proficiency", () => {
    // #1546 Part B-ii: same row-driven carrier requirement as the 6→7 case above.
    const plan = buildLevelUpPlan(char("fighter", 2), { ...target("fighter", 3, "battle master"), subclassFeatureRows: BATTLE_MASTER_ROWS });
    expect(kinds(plan)).toEqual(["hitPoints", "maneuvers", "toolProficiency", "review"]);
    expect(plan.find((s) => s.kind === "maneuvers")?.count).toBe(3);
    expect(plan.find((s) => s.kind === "toolProficiency")?.count).toBe(1);
  });

  it("Champion 2→3 grants a subclass but no maneuvers", () => {
    const plan = buildLevelUpPlan(char("fighter", 2, "champion"), target("fighter", 3, "champion"));
    expect(kinds(plan)).not.toContain("maneuvers");
  });

  it("Warrior of the Elements 5→6 has no choice step (all features are fixed)", () => {
    const plan = buildLevelUpPlan(
      char("monk", 5, "warrior of the elements"),
      target("monk", 6, "warrior of the elements"),
    );
    expect(kinds(plan)).toEqual(["hitPoints", "review"]);
  });
});

describe("buildLevelUpPlan — generic subclassChoice (#899)", () => {
  it("Hunter Ranger 2→3 grants Hunter's Prey after the subclass step position", () => {
    const plan = buildLevelUpPlan(char("ranger", 2), target("ranger", 3, "hunter"));
    const choice = plan.find((s) => s.kind === "subclassChoice");
    expect(choice?.count).toBe(1);
    expect(choice?.meta).toMatchObject({ key: "huntersPrey", catalogSource: "huntersPrey" });
  });

  it("Hunter Ranger 6→7 grants Defensive Tactics only", () => {
    const plan = buildLevelUpPlan(char("ranger", 6, "hunter"), target("ranger", 7, "hunter"));
    const choices = plan.filter((s) => s.kind === "subclassChoice");
    expect(choices).toHaveLength(1);
    expect(choices[0].meta).toMatchObject({ key: "defensiveTactics" });
  });

  it("Beast Master 6→7 grants no generic choose-N", () => {
    const plan = buildLevelUpPlan(char("ranger", 6, "beast master"), target("ranger", 7, "beast master"));
    expect(kinds(plan)).not.toContain("subclassChoice");
  });
});

// #1503: Way of the Four Elements' fourElementsDisciplines choice is the
// first choose-N whose swapCadence resolves "onLevelUp" — every OTHER
// choose-N (Hunter's Prey above) has no canSwap at all (subclassChoiceSwapCadence
// defaults "never"), so canSwap:true here is the meaningful new assertion.
describe("buildLevelUpPlan — Way of the Four Elements disciplines (#1503)", () => {
  it("2→3 grants 1 discipline pick, canSwap true (a new discipline is being learned)", () => {
    const plan = buildLevelUpPlan(
      char("monk", 2, null, "EDITION_2014"),
      target("monk", 3, "way of the four elements"),
    );
    const choice = plan.find((s) => s.kind === "subclassChoice");
    expect(choice?.count).toBe(1);
    expect(choice?.meta).toMatchObject({ key: "fourElementsDisciplines", catalogSource: "discipline", canSwap: true });
  });

  it("5→6, 10→11, 16→17 each grant exactly 1 more pick (choice cap 1/2/3/4)", () => {
    for (const [from, to] of [[5, 6], [10, 11], [16, 17]] as const) {
      const plan = buildLevelUpPlan(
        char("monk", from, "way of the four elements", "EDITION_2014"),
        target("monk", to, "way of the four elements"),
      );
      const choice = plan.find((s) => s.kind === "subclassChoice");
      expect(choice?.count, `L${from}->${to}`).toBe(1);
      expect(choice?.meta?.canSwap, `L${from}->${to}`).toBe(true);
    }
  });

  it("a level with no new discipline grants no subclassChoice step at all (no swap-only step, unlike newSpells)", () => {
    const plan = buildLevelUpPlan(
      char("monk", 3, "way of the four elements", "EDITION_2014"),
      target("monk", 4, "way of the four elements"),
    );
    expect(kinds(plan)).not.toContain("subclassChoice");
  });

  it("2024 Warrior of the Elements has no subclassChoice step at all (no discipline menu in 2024)", () => {
    const plan = buildLevelUpPlan(
      char("monk", 2, null, "EDITION_2024"),
      target("monk", 3, "warrior of the elements"),
    );
    expect(kinds(plan)).not.toContain("subclassChoice");
  });
});

describe("buildLevelUpPlan — newSpells (2024 prepared model)", () => {
  it("Wizard 7→8 scribes 2 spells, after advancement, before review — no swap", () => {
    const plan = buildLevelUpPlan(char("wizard", 7), target("wizard", 8));
    expect(kinds(plan)).toEqual(["hitPoints", "advancement", "newSpells", "review"]);
    const step = plan.find((s) => s.kind === "newSpells");
    expect(step?.count).toBe(2);
    expect(step?.meta?.canSwap).toBeUndefined(); // wizard re-prepares on a rest, no level-up swap
  });

  it("carries the derived spell-level ceiling in meta.maxSpellLevel", () => {
    expect(buildLevelUpPlan(char("wizard", 2), target("wizard", 3)).find((s) => s.kind === "newSpells")?.meta?.maxSpellLevel).toBe(2);
    expect(buildLevelUpPlan(char("wizard", 8), target("wizard", 9)).find((s) => s.kind === "newSpells")?.meta?.maxSpellLevel).toBe(5);
    // Sorcerer learn level: ceiling present, no Magical Secrets flag.
    const sorc = buildLevelUpPlan(char("sorcerer", 4), target("sorcerer", 5)).find((s) => s.kind === "newSpells");
    expect(sorc?.meta?.maxSpellLevel).toBe(3);
    expect(sorc?.meta?.magicalSecrets).toBeUndefined();
  });

  it("Sorcerer 1→2 offers the prepared-count delta (2) with a swap", () => {
    const step = buildLevelUpPlan(char("sorcerer", 1), target("sorcerer", 2)).find((s) => s.kind === "newSpells");
    expect(step?.count).toBe(2); // sorcerer prepared 2→4
    expect(step?.meta?.canSwap).toBe(true);
  });

  it("re-prepare classes get a cantrip-only newSpells step at cantrip levels, none otherwise (#1131)", () => {
    // Cleric/Druid gain a cantrip at level 4 → a count-0 cantrips-only step, no swap.
    const cleric = buildLevelUpPlan(char("cleric", 3), target("cleric", 4)).find((s) => s.kind === "newSpells");
    expect(cleric?.count).toBe(0);
    expect(cleric?.meta?.cantrips).toBe(1);
    expect(cleric?.meta?.canSwap).toBeUndefined();
    // Flat levels (no new spells, no new cantrips) still emit nothing.
    expect(kinds(buildLevelUpPlan(char("cleric", 4), target("cleric", 5)))).not.toContain("newSpells");
    expect(kinds(buildLevelUpPlan(char("druid", 4), target("druid", 5)))).not.toContain("newSpells");
    // Paladin/Ranger prepare no cantrips → never a step from cantrips.
    expect(kinds(buildLevelUpPlan(char("paladin", 3), target("paladin", 4)))).not.toContain("newSpells");
    expect(kinds(buildLevelUpPlan(char("ranger", 3), target("ranger", 4)))).not.toContain("newSpells");
  });

  it("warlock 3→4 offers a spell and a cantrip (#1131)", () => {
    const step = buildLevelUpPlan(char("warlock", 3), target("warlock", 4)).find((s) => s.kind === "newSpells");
    expect(step?.count).toBe(1);
    expect(step?.meta?.cantrips).toBe(1);
  });

  // A fresh level-1 entry offers its full initial picks with no swap (a new
  // entry must not swap other classes' spells, #1131).
  const freshL1 = (cls: string) => buildLevelUpPlan(char(cls, 0), target(cls, 1)).find((s) => s.kind === "newSpells");

  it("a fresh level-1 Cleric offers 4 spells + 3 cantrips, no swap (#1131)", () => {
    expect(freshL1("cleric")).toMatchObject({ count: 4, meta: { cantrips: 3 } });
    expect(freshL1("cleric")?.meta?.canSwap).toBeUndefined();
  });

  it("a fresh level-1 Paladin offers 2 spells, no cantrips, no swap (#1131)", () => {
    expect(freshL1("paladin")?.count).toBe(2);
    expect(freshL1("paladin")?.meta?.cantrips).toBeUndefined();
    expect(freshL1("paladin")?.meta?.canSwap).toBeUndefined();
  });

  // #1513: a fresh level-1 Wizard entry (multiclass-add) fills the spellbook
  // (6), not the prepared count (4) — levelUpSpellPicks's level<=1 branch
  // reads WIZARD_LEVEL1_SPELLBOOK_SIZE, same as creation.
  it("a fresh level-1 Wizard offers 6 spells (its spellbook, #1513) + 3 cantrips, no swap", () => {
    expect(freshL1("wizard")).toMatchObject({ count: 6, meta: { cantrips: 3 } });
    expect(freshL1("wizard")?.meta?.canSwap).toBeUndefined();
  });

  it("a fresh onLevelUp caster (Sorcerer) gets no swap at level 1; a Fighter emits nothing (#1131)", () => {
    expect(freshL1("sorcerer")?.meta?.canSwap).toBeUndefined();
    expect(kinds(buildLevelUpPlan(char("fighter", 0), target("fighter", 1)))).not.toContain("newSpells");
  });

  it("emits a swap-only newSpells step on a flat onLevelUp level (Warlock 9→10, #1101)", () => {
    const step = buildLevelUpPlan(char("warlock", 9), target("warlock", 10)).find((s) => s.kind === "newSpells");
    expect(step?.count).toBe(0); // warlock prepared 10→10
    expect(step?.meta?.canSwap).toBe(true);
  });

  it("onLevelUp casters carry meta.canSwap on a normal learn level (Bard 2→3, #1101)", () => {
    const step = buildLevelUpPlan(char("bard", 2), target("bard", 3)).find((s) => s.kind === "newSpells");
    expect(step?.count).toBe(1);
    expect(step?.meta?.canSwap).toBe(true);
  });

  it("Wizard (a spellbook caster) never carries canSwap (#1101)", () => {
    const step = buildLevelUpPlan(char("wizard", 3), target("wizard", 4)).find((s) => s.kind === "newSpells");
    expect(step?.count).toBe(2);
    expect(step?.meta?.canSwap).toBeUndefined();
  });

  it("a plain Fighter 1→2 (non-caster) still emits no newSpells step", () => {
    expect(kinds(buildLevelUpPlan(char("fighter", 1), target("fighter", 2)))).not.toContain("newSpells");
  });

  it("tags every Bard level from 10 as Magical Secrets, not a normal learn level (2024)", () => {
    const secrets = buildLevelUpPlan(char("bard", 9), target("bard", 10)).find((s) => s.kind === "newSpells");
    expect(secrets?.count).toBe(1);
    expect(secrets?.meta?.magicalSecrets).toBe(true);
    expect(secrets?.meta?.maxSpellLevel).toBe(5);

    // 2024: Magical Secrets applies to any Bard pick from level 10 up (not just 10/14/18).
    const past = buildLevelUpPlan(char("bard", 10), target("bard", 11)).find((s) => s.kind === "newSpells");
    expect(past?.meta?.magicalSecrets).toBe(true);

    const normal = buildLevelUpPlan(char("bard", 2), target("bard", 3)).find((s) => s.kind === "newSpells");
    expect(normal?.count).toBe(1);
    expect(normal?.meta?.magicalSecrets).toBeUndefined();
    expect(normal?.meta?.maxSpellLevel).toBe(2);
  });

  it("carries meta.spellLists/meta.cantripLists — [className] for an ordinary caster", () => {
    const step = buildLevelUpPlan(char("wizard", 3), target("wizard", 4)).find((s) => s.kind === "newSpells");
    expect(step?.meta?.spellLists).toEqual(["wizard"]);
    expect(step?.meta?.cantripLists).toEqual(["wizard"]);
  });

  it("2024 Bard reaching 10 carries the four lists on spellLists and only bard on cantripLists (and stays at 11)", () => {
    const at10 = buildLevelUpPlan(char("bard", 9, null, "EDITION_2024"), target("bard", 10)).find((s) => s.kind === "newSpells");
    expect(at10?.meta?.spellLists).toEqual(["bard", "cleric", "druid", "wizard"]);
    expect(at10?.meta?.cantripLists).toEqual(["bard"]);

    const at11 = buildLevelUpPlan(char("bard", 10, null, "EDITION_2024"), target("bard", 11)).find((s) => s.kind === "newSpells");
    expect(at11?.meta?.spellLists).toEqual(["bard", "cleric", "druid", "wizard"]);
    expect(at11?.meta?.cantripLists).toEqual(["bard"]);
  });

  it("2014 Bard reaching 10 carries null on BOTH spellLists and cantripLists (PHB'14 p. 54)", () => {
    const step = buildLevelUpPlan(char("bard", 9, null, "EDITION_2014"), target("bard", 10)).find((s) => s.kind === "newSpells");
    expect(step?.meta?.spellLists).toBeNull();
    expect(step?.meta?.cantripLists).toBeNull();
  });

  it("2014 Bard below level 10 carries [\"bard\"] on both facets", () => {
    const step = buildLevelUpPlan(char("bard", 2, null, "EDITION_2014"), target("bard", 3)).find((s) => s.kind === "newSpells");
    expect(step?.meta?.spellLists).toEqual(["bard"]);
    expect(step?.meta?.cantripLists).toEqual(["bard"]);
  });

  it("third-caster subclasses (Eldritch Knight / Arcane Trickster) offer a delta pick + swap (#1101)", () => {
    const ek = buildLevelUpPlan(char("fighter", 3, "eldritch knight"), target("fighter", 4, "eldritch knight")).find((s) => s.kind === "newSpells");
    expect(ek?.count).toBe(1); // EK prepared 3→4
    expect(ek?.meta?.canSwap).toBe(true);
    const at = buildLevelUpPlan(char("rogue", 3, "arcane trickster"), target("rogue", 4, "arcane trickster")).find((s) => s.kind === "newSpells");
    expect(at?.count).toBe(1);
    expect(at?.meta?.canSwap).toBe(true);
  });

  it("meta.casterModel is 'known' on a 2014 Bard's step, 'prepared' on a 2024 Bard's", () => {
    const bard2014 = buildLevelUpPlan(char("bard", 2, null, "EDITION_2014"), target("bard", 3)).find((s) => s.kind === "newSpells");
    expect(bard2014?.meta?.casterModel).toBe("known");
    const bard2024 = buildLevelUpPlan(char("bard", 2, null, "EDITION_2024"), target("bard", 3)).find((s) => s.kind === "newSpells");
    expect(bard2024?.meta?.casterModel).toBe("prepared");
  });
});

// #1509: the 2014 known-caster fork reaches the ceremony's plan — edition-correct
// pick counts and the Ranger's onLevelUp swap. Bard/Sorcerer counts pin the exact
// bug the issue describes (2024's delta served to a 2014 character); Cleric/
// Paladin/Ranger pin swapCadenceFor's per-class 2014 forks.
describe("buildLevelUpPlan — newSpells (2014 known-caster model, #1509)", () => {
  it("Bard 4→5: SRD 5.1 grants 1 (8-7), not 2024's 2 (9-7)", () => {
    const step14 = buildLevelUpPlan(char("bard", 4, null, "EDITION_2014"), target("bard", 5)).find((s) => s.kind === "newSpells");
    expect(step14?.count).toBe(1);
    const step24 = buildLevelUpPlan(char("bard", 4, null, "EDITION_2024"), target("bard", 5)).find((s) => s.kind === "newSpells");
    expect(step24?.count).toBe(2);
  });

  it("Sorcerer 4→5: SRD 5.1 grants 1 (6-5), not 2024's 2 (9-7)", () => {
    const step14 = buildLevelUpPlan(char("sorcerer", 4, null, "EDITION_2014"), target("sorcerer", 5)).find((s) => s.kind === "newSpells");
    expect(step14?.count).toBe(1);
    const step24 = buildLevelUpPlan(char("sorcerer", 4, null, "EDITION_2024"), target("sorcerer", 5)).find((s) => s.kind === "newSpells");
    expect(step24?.count).toBe(2);
  });

  it("Wizard 4→5 stays 2 in both editions (edition-invariant flat scribe)", () => {
    const step14 = buildLevelUpPlan(char("wizard", 4, null, "EDITION_2014"), target("wizard", 5)).find((s) => s.kind === "newSpells");
    expect(step14?.count).toBe(2);
    const step24 = buildLevelUpPlan(char("wizard", 4, null, "EDITION_2024"), target("wizard", 5)).find((s) => s.kind === "newSpells");
    expect(step24?.count).toBe(2);
  });

  it("a 2014 Cleric 4→5 emits a newSpells step with count 0, no canSwap, no cantrips (re-prepares)", () => {
    const step = buildLevelUpPlan(char("cleric", 4, null, "EDITION_2014"), target("cleric", 5)).find((s) => s.kind === "newSpells");
    // Level 5 grows no cantrip column (breakpoints are 1/4/10) and re-prepares,
    // so no newSpells step is emitted at all — matches the 2024 shape at a flat level.
    expect(step).toBeUndefined();
    // Invariance pin: the level-4 CANTRIP growth step still fires in both editions.
    const cantripStep14 = buildLevelUpPlan(char("cleric", 3, null, "EDITION_2014"), target("cleric", 4)).find((s) => s.kind === "newSpells");
    expect(cantripStep14?.count).toBe(0);
    expect(cantripStep14?.meta?.cantrips).toBe(1);
    expect(cantripStep14?.meta?.canSwap).toBeUndefined();
    expect(cantripStep14?.meta?.casterModel).toBe("prepared");
  });

  it("a 2014 Ranger 1→2 emits newSpells with count 2 and canSwap true (SRD 5.1 onLevelUp); a 2024 Ranger 1→2 re-prepares — no step at all, same as the pre-existing Cleric/Druid/Paladin re-prepare shape", () => {
    const step14 = buildLevelUpPlan(char("ranger", 1, null, "EDITION_2014"), target("ranger", 2)).find((s) => s.kind === "newSpells");
    expect(step14?.count).toBe(2);
    expect(step14?.meta?.canSwap).toBe(true);
    expect(step14?.meta?.casterModel).toBe("known");

    // 2024 Ranger's cadence is oneOnLongRest (#1507), grouped with the
    // re-prepare classes' "0 after level 1" shape (see the 2024 describe block
    // above) — the level-up ceremony offers it no pick and no swap.
    expect(buildLevelUpPlan(char("ranger", 1, null, "EDITION_2024"), target("ranger", 2)).find((s) => s.kind === "newSpells")).toBeUndefined();
  });

  it("a fresh 2014 Ranger level-1 entry (multiclass-add) emits NO newSpells step at all", () => {
    const step = buildLevelUpPlan(char("ranger", 0, null, "EDITION_2014"), target("ranger", 1)).find((s) => s.kind === "newSpells");
    expect(step).toBeUndefined();
  });

  it("a 2014 Paladin 1→2 emits count 0 and no canSwap — no step at all (re-prepares, no cantrip column)", () => {
    const step = buildLevelUpPlan(char("paladin", 1, null, "EDITION_2014"), target("paladin", 2)).find((s) => s.kind === "newSpells");
    expect(step).toBeUndefined();
  });
});

describe("buildLevelUpPlan — subclass-unset re-plan contract", () => {
  it("Fighter 2→3 with subclass unset emits only the subclass step (no subclass-derived choices)", () => {
    const plan = buildLevelUpPlan(char("fighter", 2), target("fighter", 3, null));
    expect(kinds(plan)).toEqual(["hitPoints", "subclass", "review"]);
  });

  it("Fighter 2→3 with Battle Master set surfaces the subclass-derived choices", () => {
    // #1546 Part B-ii: same row-driven carrier requirement as the describe
    // block above.
    const plan = buildLevelUpPlan(char("fighter", 2), { ...target("fighter", 3, "battle master"), subclassFeatureRows: BATTLE_MASTER_ROWS });
    expect(kinds(plan)).toContain("maneuvers");
    expect(kinds(plan)).toContain("toolProficiency");
  });
});
