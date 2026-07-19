import { describe, expect, it, vi } from "vitest";

import {
  CHOICE_KIND_CONFIGS,
  filterChoiceOptions,
  nextChoiceSelection,
  type ChoiceOption,
} from "@/lib/levelUpChoices";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchManeuvers: vi.fn(async () => [
    { id: "m1", name: "Riposte", description: "riposte" },
    { id: "m2", name: "Trip Attack", description: "trip" },
  ]),
  fetchDisciplines: vi.fn(async () => [
    { id: "d1", name: "Fangs of the Fire Snake", description: "fire" },
  ]),
  fetchReference: vi.fn(async () => ({ artisanTools: [{ name: "Smith's Tools", category: "artisan" }] })),
}));

function characterWith(resources: Partial<Character["resources"]>): Character {
  return { resources } as Character;
}

const baseDraft: LevelUpDraft = { hp: { method: "average" } };

describe("CHOICE_KIND_CONFIGS", () => {
  describe("maneuvers", () => {
    const cfg = CHOICE_KIND_CONFIGS.maneuvers!;

    it("loads catalog options", async () => {
      expect(await cfg.loadOptions()).toEqual([
        { id: "m1", name: "Riposte", description: "riposte" },
        { id: "m2", name: "Trip Attack", description: "trip" },
      ]);
    });

    it("extracts known ids from the character", () => {
      const character = characterWith({
        maneuversKnown: [{ id: "e1", maneuverId: "m1", name: "Riposte", description: "" }],
      } as Character["resources"]);
      expect([...cfg.fromCharacter(character)]).toEqual(["m1"]);
    });

    it("round-trips select → selected as learnManeuver ops", () => {
      const patch = cfg.select(baseDraft, ["m1", "m2"]);
      expect(patch).toEqual({
        maneuvers: [
          { type: "learnManeuver", maneuverId: "m1" },
          { type: "learnManeuver", maneuverId: "m2" },
        ],
      });
      expect(cfg.selected(patch as LevelUpDraft)).toEqual(["m1", "m2"]);
    });
  });

  describe("fightingStyle", () => {
    const cfg = CHOICE_KIND_CONFIGS.fightingStyle!;

    it("is single-select", () => {
      expect(cfg.single).toBe(true);
    });

    it("loads static options with resolved labels", async () => {
      const opts = await cfg.loadOptions();
      const archery = opts.find((o) => o.id === "archery");
      expect(archery?.name).toBe("Archery");
      expect(opts).toHaveLength(6);
    });

    it("writes a scalar key and replaces on re-pick", () => {
      const first = cfg.select(baseDraft, ["archery"]);
      expect(first).toEqual({ fightingStyle: "archery" });
      const second = cfg.select(first as LevelUpDraft, ["defense"]);
      expect(second).toEqual({ fightingStyle: "defense" });
      expect(cfg.selected(second as LevelUpDraft)).toEqual(["defense"]);
    });

    it("extracts the known style", () => {
      const character = characterWith({ fightingStyle: "dueling" } as Character["resources"]);
      expect([...cfg.fromCharacter(character)]).toEqual(["dueling"]);
    });
  });

  describe("toolProficiency", () => {
    const cfg = CHOICE_KIND_CONFIGS.toolProficiency!;

    it("uses the tool name as id", async () => {
      expect(await cfg.loadOptions()).toEqual([{ id: "Smith's Tools", name: "Smith's Tools" }]);
    });

    it("round-trips select → selected as learnToolProficiency ops", () => {
      const patch = cfg.select(baseDraft, ["Smith's Tools"]);
      expect(patch).toEqual({ toolProficiencies: [{ type: "learnToolProficiency", name: "Smith's Tools" }] });
      expect(cfg.selected(patch as LevelUpDraft)).toEqual(["Smith's Tools"]);
    });

    it("extracts known tool names", () => {
      const character = characterWith({
        toolProficienciesKnown: [{ id: "t1", name: "Smith's Tools" }],
      } as Character["resources"]);
      expect([...cfg.fromCharacter(character)]).toEqual(["Smith's Tools"]);
    });
  });

  describe("disciplines", () => {
    const cfg = CHOICE_KIND_CONFIGS.disciplines!;

    it("round-trips select → selected as learnDiscipline ops", () => {
      const patch = cfg.select(baseDraft, ["d1"]);
      expect(patch).toEqual({ disciplines: [{ type: "learnDiscipline", disciplineId: "d1" }] });
      expect(cfg.selected(patch as LevelUpDraft)).toEqual(["d1"]);
    });

    it("extracts known discipline ids", () => {
      const character = characterWith({
        disciplinesKnown: [{ id: "e1", disciplineId: "d1", name: "", description: "" }],
      } as Character["resources"]);
      expect([...cfg.fromCharacter(character)]).toEqual(["d1"]);
    });
  });

  describe("nextChoiceSelection", () => {
    it("single-select replaces the current pick", () => {
      expect(nextChoiceSelection(["a"], "b", { single: true, count: 1 })).toEqual(["b"]);
    });

    it("multi-select adds an unchosen id below the cap", () => {
      expect(nextChoiceSelection(["a"], "b", { single: false, count: 2 })).toEqual(["a", "b"]);
    });

    it("multi-select toggles off a chosen id", () => {
      expect(nextChoiceSelection(["a", "b"], "a", { single: false, count: 2 })).toEqual(["b"]);
    });

    it("blocks an (N+1)th pick at the cap (returns null)", () => {
      expect(nextChoiceSelection(["a", "b"], "c", { single: false, count: 2 })).toBeNull();
    });
  });

  describe("filterChoiceOptions", () => {
    const opts: ChoiceOption[] = [
      { id: "1", name: "Riposte", description: "reaction attack" },
      { id: "2", name: "Trip Attack", description: "knock prone" },
    ];

    it("returns all options for a blank query", () => {
      expect(filterChoiceOptions(opts, "  ")).toHaveLength(2);
    });

    it("matches name case-insensitively", () => {
      expect(filterChoiceOptions(opts, "rIPoS").map((o) => o.id)).toEqual(["1"]);
    });

    it("matches description text", () => {
      expect(filterChoiceOptions(opts, "prone").map((o) => o.id)).toEqual(["2"]);
    });
  });
});
