import { describe, expect, it } from "vitest";

import {
  buildClassChoiceOptions,
  sameLevelUpTarget,
  selectableClassChoiceCount,
} from "@/lib/levelUpClassChoice";
import type { AbilityScores, Character, ClassOption } from "@/types/character";

const scores = (over: Partial<AbilityScores> = {}): AbilityScores => ({
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
  ...over,
});

function makeClass(over: Partial<ClassOption>): ClassOption {
  return {
    id: over.id ?? "c",
    name: over.name ?? "Wizard",
    hitDie: over.hitDie ?? "d6",
    multiclassPrerequisite: over.multiclassPrerequisite ?? null,
    ...over,
  } as unknown as ClassOption;
}

function makeCharacter(over: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    abilityScores: scores(),
    classes: [{ id: "entry-1", name: "Fighter", level: 5 }],
    ...over,
  } as unknown as Character;
}

describe("buildClassChoiceOptions", () => {
  it("lists each existing class entry as an always-eligible option with its next level", () => {
    const character = makeCharacter({
      classes: [
        { id: "entry-1", name: "Fighter", level: 5, subclass: "Champion" },
        { id: "entry-2", name: "Wizard", level: 3 },
      ],
    } as Partial<Character>);
    const options = buildClassChoiceOptions(character, []);

    expect(options).toEqual([
      {
        target: { kind: "existing", classEntryId: "entry-1" },
        name: "Fighter (Champion)",
        levelLine: "Level 5 → 6",
        eligible: true,
      },
      {
        target: { kind: "existing", classEntryId: "entry-2" },
        name: "Wizard",
        levelLine: "Level 3 → 4",
        eligible: true,
      },
    ]);
  });

  it("excludes reference classes the character already owns", () => {
    const character = makeCharacter();
    const options = buildClassChoiceOptions(character, [makeClass({ id: "cls-fighter", name: "Fighter" })]);
    expect(options.filter((o) => o.target.kind === "new")).toHaveLength(0);
  });

  it("adds eligible new classes, gated by multiclassPrereqMet", () => {
    const character = makeCharacter({ abilityScores: scores({ intelligence: 13 }) } as Partial<Character>);
    const options = buildClassChoiceOptions(character, [
      makeClass({
        id: "cls-wizard",
        name: "Wizard",
        multiclassPrerequisite: { options: [{ intelligence: 13 }], description: "Intelligence 13" },
      }),
    ]);
    const wizard = options.find((o) => o.name === "Wizard");
    expect(wizard).toMatchObject({ target: { kind: "new", classId: "cls-wizard" }, eligible: true });
  });

  it("keeps an ineligible new class listed, disabled, with its requirement", () => {
    const character = makeCharacter(); // Int 10 — doesn't meet Int 13
    const options = buildClassChoiceOptions(character, [
      makeClass({
        id: "cls-wizard",
        name: "Wizard",
        multiclassPrerequisite: { options: [{ intelligence: 13 }], description: "Intelligence 13" },
      }),
    ]);
    const wizard = options.find((o) => o.name === "Wizard");
    expect(wizard).toMatchObject({ eligible: false, requirement: "Intelligence 13" });
  });

  it("treats an undefined reference list as no new-class options (still loading)", () => {
    const options = buildClassChoiceOptions(makeCharacter(), undefined);
    expect(options.every((o) => o.target.kind === "existing")).toBe(true);
  });
});

describe("selectableClassChoiceCount", () => {
  it("counts only eligible options", () => {
    const options = [
      { target: { kind: "existing" as const, classEntryId: "e1" }, name: "Fighter", levelLine: "", eligible: true },
      { target: { kind: "new" as const, classId: "c1" }, name: "Wizard", levelLine: "", eligible: false },
    ];
    expect(selectableClassChoiceCount(options)).toBe(1);
  });
});

describe("sameLevelUpTarget", () => {
  it("matches two existing targets by classEntryId", () => {
    expect(
      sameLevelUpTarget({ kind: "existing", classEntryId: "e1" }, { kind: "existing", classEntryId: "e1" }),
    ).toBe(true);
    expect(
      sameLevelUpTarget({ kind: "existing", classEntryId: "e1" }, { kind: "existing", classEntryId: "e2" }),
    ).toBe(false);
  });

  it("matches two new targets by classId, and never an existing/new cross-match", () => {
    expect(sameLevelUpTarget({ kind: "new", classId: "c1" }, { kind: "new", classId: "c1" })).toBe(true);
    expect(sameLevelUpTarget({ kind: "existing", classEntryId: "e1" }, { kind: "new", classId: "e1" })).toBe(false);
  });

  it("is false against null/undefined", () => {
    expect(sameLevelUpTarget(null, { kind: "new", classId: "c1" })).toBe(false);
    expect(sameLevelUpTarget(undefined, { kind: "existing", classEntryId: "e1" })).toBe(false);
  });
});
