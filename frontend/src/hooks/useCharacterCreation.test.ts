import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useCharacterCreation } from "@/hooks/useCharacterCreation";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { ClassOption, ReferenceData } from "@/types/character";

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

const fetchReference = vi.fn();
const fetchItems = vi.fn();
const createCharacter = vi.fn();
const addCharacterToCampaign = vi.fn();
const uploadCharacterPortrait = vi.fn();
vi.mock("@/api/client", () => ({
  fetchReference: (...args: unknown[]) => fetchReference(...args),
  fetchItems: (...args: unknown[]) => fetchItems(...args),
  createCharacter: (...args: unknown[]) => createCharacter(...args),
  addCharacterToCampaign: (...args: unknown[]) => addCharacterToCampaign(...args),
  uploadCharacterPortrait: (...args: unknown[]) => uploadCharacterPortrait(...args),
}));

const DRAFT_KEY = "character-draft:new";

function makeClass(overrides: Partial<ClassOption> = {}): ClassOption {
  return {
    id: "class-1",
    name: "Rogue",
    hitDie: "d8",
    savingThrows: [],
    skillChoiceCount: 2,
    skillChoices: ["acrobatics", "stealth", "perception"],
    isSpellcaster: false,
    subclassGateLevel: 3,
    subclasses: [],
    startingEquipment: null,
    multiclassPrerequisite: null,
    toolProficiencies: [],
    toolChoices: [],
    toolChoiceCount: 0,
    level1SpellPicks: null,
    primaryAbility: [],
    ...overrides,
  };
}

const reference: ReferenceData = {
  races: [{ id: "race-1", name: "Elf", speed: 30, toolProficiencies: [] }],
  species: [{ id: "sp-elf", name: "Elf", slug: "elf", speed: 30, abilityIncreases: [], chooseSkills: null, chooseCantrip: null, variants: [] }],
  classes: [
    makeClass(),
    makeClass({
      id: "class-wiz",
      name: "Wizard",
      hitDie: "d6",
      isSpellcaster: true,
      skillChoices: ["arcana", "history"],
      level1SpellPicks: { cantrips: 3, spells: 2, maxSpellLevel: 1 },
    }),
  ],
  backgrounds: [
    { id: "bg-1", name: "Sage", skillProficiencies: ["perception"], toolProficiencies: [], abilityChoices: [], originFeat: null, startingEquipment: null },
  ],
  alignments: ["Neutral Good"],
  artisanTools: [],
  conditions: [],
  universalActions: [],
  itemRarities: [],
};

function seedDraft(overrides: Partial<CharacterDraft>) {
  const base: CharacterDraft = {
    name: "",
    alignment: "",
    speciesId: "",
    variantId: "",
    className: "",
    subclass: "",
    subclassId: "",
    background: "",
    useCustomBackground: false,
    customBackground: "",
    abilityMethod: "manual",
    abilityPool: null,
    abilityAssignments: {
      strength: null,
      dexterity: null,
      constitution: null,
      intelligence: null,
      wisdom: null,
      charisma: null,
    },
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    backgroundAbilities: {},
    speciesAbilities: {},
    speciesSkills: [],
    speciesCantripId: "",
    skillProficiencies: [],
    toolChoices: [],
    cantripIds: [],
    spellIds: [],
    equipmentDraft: null,
    backgroundEquipmentDraft: null,
    step: "identity",
    // Every test here exercises post-gate ceremony behavior (#1286); the gate
    // itself is CreationEntryGate.test.tsx's job.
    rulesEdition: "EDITION_2024",
    campaignId: null,
    campaignName: null,
    createdId: null,
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...base, ...overrides }));
}

function validDraft(): Partial<CharacterDraft> {
  return {
    name: "Lidda",
    alignment: "Neutral Good",
    speciesId: "sp-elf",
    className: "Rogue",
    background: "Sage",
    skillProficiencies: ["stealth", "acrobatics"],
  };
}

async function mount() {
  const hook = renderHook(() => useCharacterCreation());
  await waitFor(() => expect(hook.result.current.reference).not.toBeNull());
  return hook;
}

beforeEach(() => {
  localStorage.clear();
  navigate.mockReset();
  fetchReference.mockReset().mockResolvedValue(reference);
  fetchItems.mockReset().mockResolvedValue([]);
  createCharacter.mockReset().mockResolvedValue({ id: "char-99" });
  addCharacterToCampaign.mockReset().mockResolvedValue({});
  uploadCharacterPortrait.mockReset().mockResolvedValue({ id: "char-99" });
});

afterEach(() => {
  localStorage.clear();
});

describe("useCharacterCreation", () => {
  it("derives granted skills from the background and excludes them from class options", async () => {
    seedDraft({ speciesId: "sp-elf", className: "Rogue", background: "Sage" });
    const { result } = await mount();
    expect(result.current.skills.granted).toEqual(["perception"]);
    expect(result.current.skills.options).toEqual(["acrobatics", "stealth"]);
    expect(result.current.skills.max).toBe(2);
  });

  it("drops background-granted skills when a custom background is used", async () => {
    seedDraft({ className: "Rogue", background: "Sage", useCustomBackground: true });
    const { result } = await mount();
    expect(result.current.skills.granted).toEqual([]);
    expect(result.current.skills.options).toContain("perception");
  });

  it("toggle adds a class skill and removes it again", async () => {
    seedDraft({ className: "Rogue", background: "Sage" });
    const { result } = await mount();

    act(() => result.current.skills.toggle("stealth"));
    await waitFor(() => expect(result.current.skills.selected).toEqual(["stealth"]));

    act(() => result.current.skills.toggle("stealth"));
    await waitFor(() => expect(result.current.skills.selected).toEqual([]));
  });

  it("toggle does not exceed the class choice cap", async () => {
    seedDraft({ className: "Rogue", background: "Sage", skillProficiencies: ["stealth", "acrobatics"] });
    const { result } = await mount();
    expect(result.current.skills.selected).toEqual(["stealth", "acrobatics"]);

    act(() => result.current.skills.toggle("perception"));
    await Promise.resolve();
    expect(result.current.skills.selected).toEqual(["stealth", "acrobatics"]);
  });

  it("lists every unmet requirement for an empty draft and marks it invalid", async () => {
    seedDraft({});
    const { result } = await mount();
    expect(result.current.isValid).toBe(false);
    expect(result.current.missing).toEqual(["Name", "Alignment", "Species", "Class", "Background"]);
  });

  it("uses the trimmed custom background name for validation when custom is on", async () => {
    seedDraft({
      name: "A",
      alignment: "Neutral Good",
      speciesId: "sp-elf",
      className: "Rogue",
      useCustomBackground: true,
      customBackground: "   ",
    });
    const { result } = await mount();
    expect(result.current.missing).toEqual(["Background"]);
  });

  it("is valid once all required fields are present", async () => {
    seedDraft(validDraft());
    const { result } = await mount();
    expect(result.current.missing).toEqual([]);
    expect(result.current.isValid).toBe(true);
  });

  it("derives preview AC, speed, and max HP from scores and class hit die", async () => {
    seedDraft({
      speciesId: "sp-elf",
      className: "Rogue",
      abilityScores: {
        strength: 10,
        dexterity: 16,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
    });
    const { result } = await mount();
    expect(result.current.preview.dexModifier).toBe(3);
    expect(result.current.preview.armorClass).toBe(13);
    expect(result.current.preview.speed).toBe(30);
    expect(result.current.preview.maxHp).toBe(10); // d8 + con mod 2
  });

  it("has no preview speed or maxHp before race/class are chosen", async () => {
    seedDraft({});
    const { result } = await mount();
    expect(result.current.preview.speed).toBeUndefined();
    expect(result.current.preview.maxHp).toBeUndefined();
  });

  it("submits the create payload and navigates on success", async () => {
    seedDraft(validDraft());
    const { result } = await mount();

    await act(async () => {
      await result.current.save();
    });

    expect(createCharacter).toHaveBeenCalledTimes(1);
    expect(createCharacter).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Lidda",
        speciesId: "sp-elf",
        // Legacy race string derived from the chosen species name — kept as a
        // regression guard on that derivation through the full hook until #1684
        // removes the compat-window flat-race requirement.
        race: "Elf",
        background: "Sage",
        classes: [{ name: "Rogue", subclass: null, subclassId: undefined }],
        skillProficiencies: ["perception", "stealth", "acrobatics"],
      }),
    );
    expect(navigate).toHaveBeenCalledWith("/characters/char-99", { replace: true });
    expect(result.current.submitError).toBeNull();
    expect(addCharacterToCampaign).not.toHaveBeenCalled();
    // #1616: no staged portrait means no upload call at all.
    expect(uploadCharacterPortrait).not.toHaveBeenCalled();
  });

  // #1616: the create payload no longer carries any portrait field — portraits
  // are uploaded blobs, never client-supplied URLs.
  it("sends no portraitUrl in the create payload", async () => {
    seedDraft(validDraft());
    const { result } = await mount();

    await act(async () => {
      await result.current.save();
    });

    expect("portraitUrl" in createCharacter.mock.calls[0][0]).toBe(false);
  });

  // #1616: a staged portrait file is uploaded AFTER the character exists (and
  // after the campaign attach), against the created id.
  it("uploads the staged portrait after create and attach, then navigates", async () => {
    seedDraft({ ...validDraft(), campaignId: "camp-1" });
    const { result } = await mount();
    const file = new File(["png"], "hero.png", { type: "image/png" });

    act(() => result.current.setPortraitFile(file));
    await act(async () => {
      await result.current.save();
    });

    expect(uploadCharacterPortrait).toHaveBeenCalledWith("char-99", file);
    // Sequencing: the upload ran after both create and attach.
    expect(uploadCharacterPortrait.mock.invocationCallOrder[0]).toBeGreaterThan(
      createCharacter.mock.invocationCallOrder[0],
    );
    expect(uploadCharacterPortrait.mock.invocationCallOrder[0]).toBeGreaterThan(
      addCharacterToCampaign.mock.invocationCallOrder[0],
    );
    expect(navigate).toHaveBeenCalledWith("/characters/char-99", { replace: true });
    expect(result.current.submitError).toBeNull();
  });

  // The character exists by the time the upload can fail — the message must say
  // so, and a retry must not re-create.
  it("an upload failure keeps the created character, surfaces a retryable error, and does not navigate", async () => {
    uploadCharacterPortrait
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ id: "char-99" });
    seedDraft(validDraft());
    const { result } = await mount();

    act(() => result.current.setPortraitFile(new File(["png"], "hero.png", { type: "image/png" })));
    await act(async () => {
      await result.current.save();
    });

    expect(createCharacter).toHaveBeenCalledTimes(1);
    expect(result.current.submitError).toMatch(/portrait/i);
    expect(result.current.submitError).toMatch(/network down/);
    expect(navigate).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.save();
    });
    // Retry reuses the created id: no second create, one more upload.
    expect(createCharacter).toHaveBeenCalledTimes(1);
    expect(uploadCharacterPortrait).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith("/characters/char-99", { replace: true });
  });

  it("Start Over (clear) drops the staged portrait file", async () => {
    seedDraft(validDraft());
    const { result } = await mount();

    act(() => result.current.setPortraitFile(new File(["png"], "hero.png", { type: "image/png" })));
    expect(result.current.portraitFile).not.toBeNull();

    act(() => result.current.clear());
    expect(result.current.portraitFile).toBeNull();

    act(() => result.current.update(validDraft()));
    await act(async () => {
      await result.current.save();
    });
    expect(uploadCharacterPortrait).not.toHaveBeenCalled();
  });

  it("does not submit an invalid draft", async () => {
    seedDraft({ name: "Only a name" });
    const { result } = await mount();

    await act(async () => {
      await result.current.save();
    });
    expect(createCharacter).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("surfaces the real error message and does not navigate when create fails", async () => {
    createCharacter.mockRejectedValue(new Error("boom"));
    seedDraft(validDraft());
    const { result } = await mount();

    await act(async () => {
      await result.current.save();
    });
    expect(result.current.submitError).toBe("boom");
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
  });

  it("a failed create can be retried — each retry attempts createCharacter again (nothing exists yet)", async () => {
    createCharacter.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce({ id: "char-99" });
    seedDraft(validDraft());
    const { result } = await mount();

    await act(async () => {
      await result.current.save();
    });
    expect(result.current.submitError).toBe("network down");
    expect(createCharacter).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.save();
    });
    expect(createCharacter).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith("/characters/char-99", { replace: true });
  });

  // #1286: the campaign-inherited flow is this issue's primary use case — pin
  // that a resolved campaignId is actually acted on, not just carried in the draft.
  it("attaches the created character to the resolved campaign after a successful create", async () => {
    seedDraft({ ...validDraft(), campaignId: "camp-1" });
    const { result } = await mount();

    await act(async () => {
      await result.current.save();
    });

    expect(addCharacterToCampaign).toHaveBeenCalledWith("char-99", "camp-1");
    expect(navigate).toHaveBeenCalledWith("/characters/char-99", { replace: true });
    expect(result.current.submitError).toBeNull();
  });

  // The create-then-attach split (#1286) is two network calls; a failure on the
  // second must not orphan-and-duplicate: the character already exists, so a
  // retry must attach it rather than calling createCharacter again.
  it("an attach failure after a successful create keeps the character and retries only the attach", async () => {
    addCharacterToCampaign.mockRejectedValueOnce(new Error("Campaign not found")).mockResolvedValueOnce({});
    seedDraft({ ...validDraft(), campaignId: "camp-1" });
    const { result } = await mount();

    await act(async () => {
      await result.current.save();
    });
    expect(createCharacter).toHaveBeenCalledTimes(1);
    expect(addCharacterToCampaign).toHaveBeenCalledTimes(1);
    expect(result.current.submitError).toMatch(/Campaign not found/);
    expect(navigate).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.save();
    });
    // Retry: the character from the first attempt is reused — no second create.
    expect(createCharacter).toHaveBeenCalledTimes(1);
    expect(addCharacterToCampaign).toHaveBeenCalledTimes(2);
    expect(addCharacterToCampaign).toHaveBeenLastCalledWith("char-99", "camp-1");
    expect(navigate).toHaveBeenCalledWith("/characters/char-99", { replace: true });
  });

  // #1286: CharacterDraft (including campaignId) is persisted to localStorage,
  // but a plain useState-held "pending created id" would NOT survive a page
  // refresh — a remounted hook reads only what's in the draft, sees no id, and
  // would call createCharacter again, orphaning the first character. This test
  // exercises that exact sequence: unmount (tears down all React state, as a
  // refresh would) then mount a brand-new hook instance before retrying.
  it("survives a refresh: a remounted hook resumes the pending created id instead of re-creating", async () => {
    addCharacterToCampaign.mockRejectedValueOnce(new Error("Campaign not found")).mockResolvedValueOnce({});
    seedDraft({ ...validDraft(), campaignId: "camp-1" });

    const first = await mount();
    await act(async () => {
      await first.result.current.save();
    });
    expect(createCharacter).toHaveBeenCalledTimes(1);
    expect(first.result.current.submitError).toMatch(/Campaign not found/);

    // Simulate a refresh: the component tree — and any plain useState — is
    // torn down. Only what useCharacterDraft persisted to localStorage survives.
    first.unmount();

    const second = await mount();
    await act(async () => {
      await second.result.current.save();
    });

    // Exactly one createCharacter across the whole sequence, spanning the
    // "refresh" — the remount must resume the pending id, not create a second
    // character.
    expect(createCharacter).toHaveBeenCalledTimes(1);
    expect(addCharacterToCampaign).toHaveBeenCalledTimes(2);
    expect(addCharacterToCampaign).toHaveBeenLastCalledWith("char-99", "camp-1");
    expect(navigate).toHaveBeenCalledWith("/characters/char-99", { replace: true });
  });

  it("Start Over (clear) drops a pending created-but-unattached id so a later save creates fresh", async () => {
    addCharacterToCampaign.mockRejectedValue(new Error("Campaign not found"));
    seedDraft({ ...validDraft(), campaignId: "camp-1" });
    const { result } = await mount();

    await act(async () => {
      await result.current.save();
    });
    expect(createCharacter).toHaveBeenCalledTimes(1);

    act(() => result.current.clear());
    act(() => result.current.update(validDraft()));

    createCharacter.mockResolvedValue({ id: "char-100" });
    await act(async () => {
      await result.current.save();
    });
    // A fresh create, not a retry of the abandoned attempt's id.
    expect(createCharacter).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith("/characters/char-100", { replace: true });
  });

  // #1131: a class switch invalidates the chosen spells (different list + counts).
  it("clears chosen spells when the class changes", async () => {
    seedDraft({ className: "Rogue", cantripIds: ["c1"], spellIds: ["s1"] });
    const { result } = await mount();
    expect(result.current.draft.cantripIds).toEqual(["c1"]);

    act(() => result.current.update({ className: "Sorcerer" }));

    await waitFor(() => {
      expect(result.current.draft.cantripIds).toEqual([]);
      expect(result.current.draft.spellIds).toEqual([]);
    });
    expect(result.current.draft.className).toBe("Sorcerer");
  });

  it("keeps chosen spells across an unrelated draft change", async () => {
    seedDraft({ className: "Rogue", cantripIds: ["c1"], spellIds: ["s1"] });
    const { result } = await mount();

    act(() => result.current.update({ name: "Renamed" }));

    await waitFor(() => expect(result.current.draft.name).toBe("Renamed"));
    expect(result.current.draft.cantripIds).toEqual(["c1"]);
    expect(result.current.draft.spellIds).toEqual(["s1"]);
  });

  // #1176: the ceremony walk.
  it("derives the walk steps, skipping spells for a non-caster", async () => {
    seedDraft({ className: "Rogue", background: "Sage" });
    const { result } = await mount();
    expect(result.current.steps).toEqual(["identity", "abilities", "skills", "equipment", "review"]);
  });

  it("includes the spells step for a level-1 caster", async () => {
    seedDraft({ className: "Wizard" });
    const { result } = await mount();
    expect(result.current.steps).toContain("spells");
  });

  it("resumes at the persisted draft step", async () => {
    seedDraft({ ...validDraft(), step: "skills" });
    const { result } = await mount();
    expect(result.current.currentStep).toBe("skills");
    expect(result.current.stepIndex).toBe(2);
  });

  it("next() refuses to advance while the current step's gate fails", async () => {
    seedDraft({});
    const { result } = await mount();
    expect(result.current.canContinue).toBe(false);
    act(() => result.current.next());
    expect(result.current.currentStep).toBe("identity");
  });

  it("next() advances and persists the step when the gate passes", async () => {
    seedDraft(validDraft());
    const { result } = await mount();
    expect(result.current.currentStep).toBe("identity");
    expect(result.current.canContinue).toBe(true);

    act(() => result.current.next());
    await waitFor(() => expect(result.current.currentStep).toBe("abilities"));
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}").step).toBe("abilities");
  });

  it("back() returns to the previous step", async () => {
    seedDraft({ ...validDraft(), step: "skills" });
    const { result } = await mount();
    act(() => result.current.back());
    await waitFor(() => expect(result.current.currentStep).toBe("abilities"));
  });

  it("drops the spells step when the class changes to a non-caster", async () => {
    seedDraft({ className: "Wizard" });
    const { result } = await mount();
    expect(result.current.steps).toContain("spells");
    act(() => result.current.update({ className: "Rogue" }));
    await waitFor(() => expect(result.current.steps).not.toContain("spells"));
  });

  it("resolves a stale spells step to the first step for a non-caster without crashing", async () => {
    seedDraft({ className: "Rogue", step: "spells" });
    const { result } = await mount();
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.currentStep).toBe("identity");
  });
});
