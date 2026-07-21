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
    { id: "elemental-attunement", name: "Elemental Attunement", description: "attune", minLevel: 3, alwaysKnown: true },
    { id: "fangs-of-the-fire-snake", name: "Fangs of the Fire Snake", description: "fire", minLevel: 3, alwaysKnown: false },
    { id: "ride-the-wind", name: "Ride the Wind", description: "fly", minLevel: 6, alwaysKnown: false },
  ]),
  fetchReference: vi.fn(async () => ({ artisanTools: [{ name: "Smith's Tools", category: "artisan" }] })),
  fetchFeats: vi.fn(async () => [
    { id: "archery", name: "Archery", description: "arch", category: "fighting_style" },
    { id: "defense", name: "Defense", description: "def", category: "fighting_style" },
    { id: "sentinel", name: "Sentinel", description: "sent", category: "general" },
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
      expect(await cfg.loadOptions({ targetLevel: 1 })).toEqual([
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
      const opts = await cfg.loadOptions({ targetLevel: 1 });
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
      expect(await cfg.loadOptions({ targetLevel: 1 })).toEqual([{ id: "Smith's Tools", name: "Smith's Tools" }]);
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

    it("gates by target level, drops alwaysKnown options, and tags the L-gate at level 3", async () => {
      const opts = await cfg.loadOptions({ targetLevel: 3 });
      expect(opts).toEqual([
        { id: "fangs-of-the-fire-snake", name: "Fangs of the Fire Snake", description: "fire", tag: "L3+" },
      ]);
    });

    it("includes higher minLevel options once the target level reaches them", async () => {
      const opts = await cfg.loadOptions({ targetLevel: 6 });
      expect(opts.map((o) => ({ id: o.id, tag: o.tag }))).toEqual([
        { id: "fangs-of-the-fire-snake", tag: "L3+" },
        { id: "ride-the-wind", tag: "L6+" },
      ]);
    });

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
