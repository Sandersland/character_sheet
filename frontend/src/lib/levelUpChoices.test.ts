import { describe, expect, it, vi } from "vitest";

import { fetchReference, fetchSubclassChoiceOptions } from "@/api/client";
import {
  CHOICE_KIND_CONFIGS,
  choiceConfigForStep,
  filterChoiceOptions,
  nextChoiceSelection,
  type ChoiceOption,
} from "@/lib/levelUpChoices";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpStep } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchManeuvers: vi.fn(async () => [
    { id: "m1", name: "Riposte", description: "riposte" },
    { id: "m2", name: "Trip Attack", description: "trip" },
  ]),
  fetchReference: vi.fn(async () => ({ artisanTools: [{ name: "Smith's Tools", category: "artisan" }] })),
  fetchFeats: vi.fn(async () => [
    { id: "archery", name: "Archery", description: "arch", category: "fighting_style" },
    { id: "defense", name: "Defense", description: "def", category: "fighting_style" },
    { id: "sentinel", name: "Sentinel", description: "sent", category: "general" },
  ]),
  fetchSubclassChoiceOptions: vi.fn(async () => [
    { id: "prey1", name: "Colossus Slayer", description: "cs", minLevel: 3 },
    { id: "prey2", name: "Giant Killer", description: "gk", minLevel: 3 },
  ]),
}));

function characterWith(resources: Partial<Character["resources"]>): Character {
  return { resources } as Character;
}

const baseDraft: LevelUpDraft = { hp: { method: "average" } };

describe("CHOICE_KIND_CONFIGS", () => {
  describe("maneuvers", () => {
    const cfg = CHOICE_KIND_CONFIGS.maneuvers!;

    it("loads catalog options", async () => {
      expect(await cfg.loadOptions({ targetLevel: 1, edition: "EDITION_2024" })).toEqual([
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

  describe("fightingStyleFeat", () => {
    const cfg = CHOICE_KIND_CONFIGS.fightingStyleFeat!;

    it("is single-select", () => {
      expect(cfg.single).toBe(true);
    });

    it("loads only the catalog's fighting_style feats", async () => {
      const opts = await cfg.loadOptions({ targetLevel: 1, edition: "EDITION_2024" });
      expect(opts).toEqual([
        { id: "archery", name: "Archery", description: "arch" },
        { id: "defense", name: "Defense", description: "def" },
      ]);
    });

    it("writes a slot:fightingStyle takeFeat op and replaces on re-pick", () => {
      const first = cfg.select(baseDraft, ["archery"]);
      expect(first).toEqual({
        fightingStyleFeat: { type: "takeFeat", featId: "archery", slot: "fightingStyle" },
      });
      const second = cfg.select(first as LevelUpDraft, ["defense"]);
      expect(second).toEqual({
        fightingStyleFeat: { type: "takeFeat", featId: "defense", slot: "fightingStyle" },
      });
      expect(cfg.selected(second as LevelUpDraft)).toEqual(["defense"]);
    });

    it("extracts already-taken fs feat ids from advancements (non-fs slots excluded)", () => {
      const character = {
        advancements: [
          { id: "a1", slot: "fightingStyle", featId: "dueling" },
          { id: "a2", featId: "sentinel" },
        ],
      } as unknown as Character;
      expect([...cfg.fromCharacter(character)]).toEqual(["dueling"]);
    });
  });

  describe("toolProficiency", () => {
    const cfg = CHOICE_KIND_CONFIGS.toolProficiency!;

    it("uses the tool name as id", async () => {
      expect(await cfg.loadOptions({ targetLevel: 1, edition: "EDITION_2024" })).toEqual([{ id: "Smith's Tools", name: "Smith's Tools" }]);
    });

    // Without this the test passes even if the edition never reaches the wire —
    // artisanTools is edition-invariant, so the returned options look right
    // either way. This is the only caller outside useReferenceData (#1325).
    it("passes the context edition through to fetchReference", async () => {
      await cfg.loadOptions({ targetLevel: 1, edition: "EDITION_2014" });
      expect(vi.mocked(fetchReference)).toHaveBeenCalledWith("EDITION_2014");
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

  describe("choiceConfigForStep", () => {
    const preyStep: LevelUpStep = {
      kind: "subclassChoice",
      count: 1,
      meta: { key: "huntersPrey", label: "Hunter's Prey", catalogSource: "huntersPrey" },
    };

    it("returns the kind config unchanged for the three per-kind steps", () => {
      expect(choiceConfigForStep({ kind: "maneuvers", count: 2 })).toBe(CHOICE_KIND_CONFIGS.maneuvers);
      expect(choiceConfigForStep({ kind: "fightingStyleFeat" })).toBe(CHOICE_KIND_CONFIGS.fightingStyleFeat);
      expect(choiceConfigForStep({ kind: "toolProficiency", count: 1 })).toBe(CHOICE_KIND_CONFIGS.toolProficiency);
    });

    it("loads the step's catalogSource with the context edition", async () => {
      const cfg = choiceConfigForStep(preyStep)!;
      const result = await cfg.loadOptions({ targetLevel: 3, edition: "EDITION_2014" });

      expect(vi.mocked(fetchSubclassChoiceOptions)).toHaveBeenCalledWith("huntersPrey", "EDITION_2014");
      expect(result).toEqual([
        { id: "prey1", name: "Colossus Slayer", description: "cs" },
        { id: "prey2", name: "Giant Killer", description: "gk" },
      ]);
    });

    it("scopes selected to this step's meta.key", () => {
      const cfg = choiceConfigForStep(preyStep)!;
      const draft: LevelUpDraft = {
        hp: { method: "average" },
        subclassChoices: [
          { type: "learnSubclassChoice", choiceKey: "defensiveTactics", optionId: "dt1" },
          { type: "learnSubclassChoice", choiceKey: "huntersPrey", optionId: "prey1" },
        ],
      };
      expect(cfg.selected(draft)).toEqual(["prey1"]);
    });

    it("select replaces only this key's ops and preserves every other key's", () => {
      const cfg = choiceConfigForStep(preyStep)!;
      const draft: LevelUpDraft = {
        hp: { method: "average" },
        subclassChoices: [{ type: "learnSubclassChoice", choiceKey: "defensiveTactics", optionId: "dt1" }],
      };
      expect(cfg.select(draft, ["prey1"])).toEqual({
        subclassChoices: [
          { type: "learnSubclassChoice", choiceKey: "defensiveTactics", optionId: "dt1" },
          { type: "learnSubclassChoice", choiceKey: "huntersPrey", optionId: "prey1" },
        ],
      });
    });

    it("reads already-picked options out of choicesKnown[key]", () => {
      const cfg = choiceConfigForStep(preyStep)!;
      const character = {
        resources: {
          choicesKnown: {
            huntersPrey: [{ id: "e1", optionId: "prey1", name: "Colossus Slayer", description: "" }],
          },
        },
      } as unknown as Character;
      expect([...cfg.fromCharacter(character)]).toEqual(["prey1"]);
    });

    it("drops entries with no optionId (custom picks) from fromCharacter", () => {
      const cfg = choiceConfigForStep(preyStep)!;
      const character = {
        resources: { choicesKnown: { huntersPrey: [{ id: "e1", name: "Homebrew Pick", description: "" }] } },
      } as unknown as Character;
      expect([...cfg.fromCharacter(character)]).toEqual([]);
    });

    it("returns undefined for a subclassChoice step with no string meta.key", () => {
      expect(choiceConfigForStep({ kind: "subclassChoice", count: 1 })).toBeUndefined();
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
