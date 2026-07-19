import { describe, expect, it } from "vitest";

import { buildLevelUpLedger, type LedgerResolvers, type LedgerRow } from "@/lib/levelUpLedger";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpPlanResponse, LevelUpStep } from "@/types/character";

const resolvers: LedgerResolvers = {
  maneuver: (id) => ({ m1: "Riposte", m2: "Trip Attack" })[id],
  discipline: (id) => ({ d1: "Fangs of the Fire Snake" })[id],
  spell: (id) => ({ s1: "Fireball" })[id],
  feat: (id) => ({ f1: "Sentinel" })[id],
};

function makeCharacter(over?: Partial<Character>): Character {
  return {
    level: 7,
    hitPoints: { max: 52 },
    hitDice: { total: 7, die: "d10" },
    abilityScores: { strength: 16, dexterity: 14, constitution: 15, intelligence: 10, wisdom: 12, charisma: 8 },
    ...over,
  } as unknown as Character;
}

function makePlan(steps: LevelUpStep[] = [], subclass: string | null = "Champion"): LevelUpPlanResponse {
  return { target: { className: "Fighter", subclass, newLevel: 8, isPrimary: true }, steps };
}

function rowFor(rows: LedgerRow[], label: string): LedgerRow | undefined {
  return rows.find((r) => r.label === label);
}

describe("buildLevelUpLedger", () => {
  it("renders level and average-HP rows and the hit-dice bump", () => {
    const rows = buildLevelUpLedger(makeCharacter(), { hp: { method: "average" } }, makePlan(), resolvers);

    expect(rowFor(rows, "Level")).toMatchObject({ before: "7", after: "8", variant: "delta" });
    // Con 15 → +2; d10 average = floor(10/2)+1+2 = 8; max 52 → 60.
    expect(rowFor(rows, "Maximum HP")).toMatchObject({ before: "52", after: "60" });
    expect(rowFor(rows, "Hit Dice")).toMatchObject({ before: "7d10", after: "8d10" });
  });

  it("a bare hp draft yields exactly the level, HP, and hit-dice rows", () => {
    const rows = buildLevelUpLedger(makeCharacter(), { hp: { method: "average" } }, makePlan(), resolvers);
    expect(rows.map((r) => r.label)).toEqual(["Level", "Maximum HP", "Hit Dice"]);
  });

  it("uses the rolled die plus Con mod for a roll draft", () => {
    const rows = buildLevelUpLedger(makeCharacter(), { hp: { method: "roll", roll: 7 } }, makePlan(), resolvers);
    // roll 7 + Con +2 = 9; max 52 → 61.
    expect(rowFor(rows, "Maximum HP")).toMatchObject({ after: "61" });
  });

  it("renders an ability row per takeAsi increase, a modifier note, and a recalculated note", () => {
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
    };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(), resolvers);

    // abilityLabel must resolve, never a raw key.
    const str = rowFor(rows, "Strength");
    expect(str).toMatchObject({ before: "16", after: "18", variant: "delta" });
    // Str 16 (+3) → 18 (+4): the modifier changed, so a note appears.
    expect(str?.note).toContain("+4");
    expect(rowFor(rows, "Recalculated")).toMatchObject({ variant: "note" });
    expect(rowFor(rows, "Recalculated")?.note).toContain("Strength");
  });

  it("keeps HP gain on the pre-level Con mod even when the ASI bumps Constitution", () => {
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "constitution", amount: 2 }] },
    };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(), resolvers);
    // Con 15 (+2) is used for HP even though the ASI raises it to 17 (+3).
    expect(rowFor(rows, "Maximum HP")).toMatchObject({ after: "60" });
    expect(rowFor(rows, "Constitution")).toMatchObject({ before: "15", after: "17" });
  });

  it("renders a custom feat name row plus its half-feat ability bump", () => {
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      advancement: {
        type: "takeFeat",
        custom: { name: "Custom Feat", description: "", abilityIncrease: 1, abilityOptions: ["dexterity"] },
        abilityChoice: "dexterity",
      },
    };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(), resolvers);

    expect(rowFor(rows, "Feat")).toMatchObject({ after: "Custom Feat" });
    // Dex 14 → 15: modifier stays +2, so no note.
    const dex = rowFor(rows, "Dexterity");
    expect(dex).toMatchObject({ before: "14", after: "15" });
    expect(dex?.note).toBeUndefined();
    expect(rowFor(rows, "Recalculated")?.note).toContain("Dexterity");
  });

  it("resolves a catalog feat name through the feat resolver", () => {
    const draft: LevelUpDraft = { hp: { method: "average" }, advancement: { type: "takeFeat", featId: "f1" } };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(), resolvers);
    expect(rowFor(rows, "Feat")).toMatchObject({ after: "Sentinel" });
  });

  it("reads the subclass name from the plan target", () => {
    const rows = buildLevelUpLedger(
      makeCharacter(),
      { hp: { method: "average" }, subclassId: "sc-champion" },
      makePlan(),
      resolvers,
    );
    expect(rowFor(rows, "Subclass")).toMatchObject({ after: "Champion" });
  });

  it("resolves the fighting-style label from its key", () => {
    const rows = buildLevelUpLedger(
      makeCharacter(),
      { hp: { method: "average" }, fightingStyle: "archery" },
      makePlan(),
      resolvers,
    );
    expect(rowFor(rows, "Fighting Style")).toMatchObject({ after: "Archery" });
  });

  it("lists tool proficiencies by their display name", () => {
    const rows = buildLevelUpLedger(
      makeCharacter(),
      { hp: { method: "average" }, toolProficiencies: [{ type: "learnToolProficiency", name: "Smith's Tools" }] },
      makePlan(),
      resolvers,
    );
    expect(rowFor(rows, "Tool Proficiencies")).toMatchObject({ items: ["Smith's Tools"], variant: "list" });
  });

  it("resolves catalog picks and falls back to custom names in a list row", () => {
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      maneuvers: [
        { type: "learnManeuver", maneuverId: "m1" },
        { type: "learnManeuver", custom: { name: "Homebrew Strike", description: "" } },
      ],
      disciplines: [{ type: "learnDiscipline", disciplineId: "d1" }],
      spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
    };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(), resolvers);

    expect(rowFor(rows, "Maneuvers")?.items).toEqual(["Riposte", "Homebrew Strike"]);
    expect(rowFor(rows, "Disciplines")?.items).toEqual(["Fangs of the Fire Snake"]);
    expect(rowFor(rows, "New Spells")?.items).toEqual(["Fireball"]);
  });

  it("names subclass-feature picks by custom name, else the step's meta label", () => {
    const steps: LevelUpStep[] = [
      { kind: "subclassChoice", meta: { key: "metamagic", label: "Metamagic" } },
    ];
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      subclassChoices: [
        { type: "learnSubclassChoice", choiceKey: "metamagic", custom: { name: "Quickened Spell", description: "" } },
        { type: "learnSubclassChoice", choiceKey: "metamagic", optionId: "o1" },
      ],
    };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(steps), resolvers);
    expect(rowFor(rows, "Subclass Features")?.items).toEqual(["Quickened Spell", "Metamagic"]);
  });
});
