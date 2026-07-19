// Pins deriveResources() output across every class/subclass/level combination.
// This is the safety net for the class-features.ts → classes/<class>.ts split
// (#662): the split must move content verbatim, so this snapshot must stay
// byte-identical before and after the refactor.
import { describe, expect, it } from "vitest";

import { deriveResources, deriveResourcesForCharacterRow, resolveClassDie } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

const CLASS_SUBCLASSES: Record<string, (string | undefined)[]> = {
  barbarian: [undefined, "totem warrior", "berserker"],
  bard: [undefined, "college of lore", "college of valor"],
  cleric: [undefined, "life domain", "trickery domain"],
  druid: [undefined, "circle of the land", "circle of the moon"],
  fighter: [undefined, "battle master", "champion", "eldritch knight"],
  monk: [undefined, "way of the open hand", "way of shadow", "way of the four elements"],
  paladin: [undefined, "oath of devotion", "oath of the ancients", "oath of vengeance"],
  ranger: [undefined, "hunter", "beast master"],
  rogue: [undefined, "arcane trickster", "assassin", "thief"],
  sorcerer: [undefined, "draconic bloodline", "wild magic"],
  warlock: [undefined, "the fiend", "the archfey", "the great old one"],
  wizard: [undefined, "school of evocation", "school of abjuration", "school of illusion"],
};

const ABILITY_SCORES = {
  strength: 14,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  wisdom: 13,
  charisma: 15,
};

describe("deriveResources snapshot — pins output for every class/subclass across all 20 levels", () => {
  for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
    for (const subclass of subclasses) {
      it(`${className} / ${subclass ?? "(no subclass)"}`, () => {
        const byLevel = Array.from({ length: 20 }, (_, i) => {
          const level = i + 1;
          const profBonus = proficiencyBonusForLevel(level);
          return {
            level,
            info: deriveResources(className, subclass, level, ABILITY_SCORES, profBonus),
          };
        });
        expect(byLevel).toMatchSnapshot();
      });
    }
  }

  it("returns null for a wholly unknown class", () => {
    expect(deriveResources("not-a-class", undefined, 5, ABILITY_SCORES, 3)).toBeNull();
  });
});

describe("resolveClassDie snapshot — every class-die pool across all classes/subclasses", () => {
  for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
    for (const subclass of subclasses) {
      it(`${className} / ${subclass ?? "(no subclass)"}`, () => {
        const rows = Array.from({ length: 20 }, (_, i) => {
          const level = i + 1;
          const profBonus = proficiencyBonusForLevel(level);
          const info = deriveResources(className, subclass, level, ABILITY_SCORES, profBonus);
          if (!info) return { level, dice: {} };
          const dice: Record<string, number | null> = {};
          for (const resource of info.resources) {
            if (resource.die) dice[resource.key] = resolveClassDie(resource.key, info);
          }
          return { level, dice };
        });
        expect(rows).toMatchSnapshot();
      });
    }
  }
});

describe("deriveResourcesForCharacterRow", () => {
  it("derives level + resources from XP and the primary class entry", () => {
    const { derived, level } = deriveResourcesForCharacterRow({
      experiencePoints: 355000,
      abilityScores: ABILITY_SCORES,
      classEntries: [{ name: "fighter", subclass: "battle master" }],
    });
    expect(level).toBe(20);
    expect(derived).toMatchSnapshot();
  });

  it("returns null derived resources and level 1 for an empty class-entry list", () => {
    const { derived, level } = deriveResourcesForCharacterRow({
      experiencePoints: 0,
      abilityScores: ABILITY_SCORES,
      classEntries: [],
    });
    expect(level).toBe(1);
    expect(derived).toBeNull();
  });
});
