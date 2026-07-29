import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ClassFeaturesSection from "@/features/class/ClassFeaturesSection";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import * as client from "@/api/client";
import type { AdvancementEntry, CatalogFeat, Character, ClassOption } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyClassTransactions: vi.fn(),
  applyAdvancementTransactions: vi.fn(),
  applyResourceTransactions: vi.fn(),
  applyShadowArtsTransactions: vi.fn(),
  fetchFeats: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ClassFeaturesSection reads useCurrentCharacter(), so every render seeds the
// cache and mounts CurrentCharacterProvider via renderWithCharacter.
function render(character: Character) {
  return renderWithCharacter(<ClassFeaturesSection referenceClasses={[]} />, character);
}

const FS_CATALOG = [
  { id: "archery", name: "Archery", description: "+2 bonus to attack rolls with ranged weapons.", category: "fighting_style" },
  { id: "defense", name: "Defense", description: "+1 AC while wearing armor.", category: "fighting_style" },
  { id: "sentinel", name: "Sentinel", description: "not a style", category: "general" },
] as unknown as CatalogFeat[];

// A fighter with a Fighting Style slot partition (#1137). `taken` are the
// fightingStyle-slot advancements; `used` derives from their count by default.
function makeFighter(opts: { total: number; taken?: AdvancementEntry[] }): Character {
  const taken = opts.taken ?? [];
  return {
    id: "char-1",
    class: "Fighter",
    rulesEdition: "EDITION_2014",
    level: 5,
    fightingStyleSlots: { total: opts.total, used: taken.length },
    advancements: taken,
    resources: { features: [], pools: [], maneuversKnown: [], toolProficienciesKnown: [] },
  } as unknown as Character;
}

describe("ClassFeaturesSection — Fighting Style", () => {
  it("renders the picker when a fighting-style slot is open and none taken", () => {
    render(makeFighter({ total: 1 }));
    expect(screen.getByText("Fighting Style")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /choose a fighting style/i })).toBeInTheDocument();
  });

  it("does NOT render the Fighting Style section when total slots is 0", () => {
    render(makeFighter({ total: 0 }));
    expect(screen.queryByText("Fighting Style")).not.toBeInTheDocument();
  });

  it("shows a taken feat's name + description, and no picker once slots are full", () => {
    const taken = [
      { id: "fs1", level: 1, kind: "feat", slot: "fightingStyle", featId: "archery", featName: "Archery", featDescription: "+2 bonus to attack rolls with ranged weapons.", abilityDeltas: {}, hpDelta: 0, initDelta: 0 },
    ] as unknown as AdvancementEntry[];
    render(makeFighter({ total: 1, taken }));
    expect(screen.getByText("Archery")).toBeInTheDocument();
    expect(screen.getByText(/\+2 bonus to attack rolls/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /choose a fighting style/i })).not.toBeInTheDocument();
  });

  it("choosing a style takes a slot:fightingStyle feat via applyAdvancementTransactions, excluding non-styles", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchFeats).mockResolvedValue(FS_CATALOG);
    const mockApply = vi.mocked(client.applyAdvancementTransactions);
    mockApply.mockResolvedValue(makeFighter({ total: 1 }));

    render(makeFighter({ total: 1 }));

    await user.click(screen.getByRole("button", { name: /choose a fighting style/i }));
    // A general-category feat must not leak into the fighting-style picker.
    expect(await screen.findByText("Archery")).toBeInTheDocument();
    expect(screen.queryByText("Sentinel")).not.toBeInTheDocument();

    const archeryRow = screen.getByText("Archery").closest("li")!;
    await user.click(within(archeryRow).getByRole("button", { name: "Choose" }));

    expect(mockApply).toHaveBeenCalledWith("char-1", [
      { type: "takeFeat", featId: "archery", slot: "fightingStyle" },
    ]);
  });
});

describe("ClassFeaturesSection — Cloak of Shadows (2024 rewrite, #1246: L11 -> L17)", () => {
  function makeShadowMonk(cloakAvailable: boolean): Character {
    return {
      id: "char-1",
      class: "Monk",
      level: cloakAvailable ? 17 : 11,
      subclass: "Warrior of Shadow",
      conditions: { active: [], exhaustion: 0 },
      resources: {
        features: [],
        pools: [{ key: "focus", label: "Focus", total: 17, recharge: "shortRest", used: 0, remaining: 17 }],
        maneuversKnown: [],
        toolProficienciesKnown: [],
      },
      // cloakOfShadows entitlement is availableActions[] presence (#1315), not a resources boolean.
      availableActions: cloakAvailable
        ? [{ key: "cloakOfShadows", name: "Cloak of Shadows", cost: "action", enabled: true }]
        : [],
    } as unknown as Character;
  }

  it("offers the Cloak of Shadows control at L17 and spends 3 focus via applyShadowArtsTransactions", async () => {
    const user = userEvent.setup();
    vi.mocked(client.applyShadowArtsTransactions).mockResolvedValue(makeShadowMonk(true));

    render(makeShadowMonk(true));

    expect(screen.getByText("Cloak of Shadows")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Become Invisible" }));

    expect(client.applyShadowArtsTransactions).toHaveBeenCalledWith("char-1", [
      { type: "activateCloakOfShadows" },
    ]);
  });

  it("does NOT offer Cloak of Shadows below L17 (flag absent — L11 is Improved Shadow Step instead)", () => {
    render(makeShadowMonk(false));
    expect(screen.queryByText("Cloak of Shadows")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Become Invisible" })).not.toBeInTheDocument();
  });
});

// #1325: needsSubclass must follow subclassGateLevel — the value /api/reference
// already resolved for the character's edition — never a raw catalog column.
// A level-1 Cleric only needs the prompt+picker under a 2014-resolved def
// (gate 1); the SAME character with a 2024-resolved def (gate 3) shows neither.
describe("ClassFeaturesSection — subclass gate per edition (#1325)", () => {
  function clericDef(subclassGateLevel: number): ClassOption {
    return {
      id: "class-cleric",
      name: "Cleric",
      hitDie: "d8",
      savingThrows: [],
      skillChoiceCount: 2,
      skillChoices: [],
      isSpellcaster: true,
      subclassGateLevel,
      subclasses: [{ id: "sc-life", name: "Life Domain", description: "" }],
      startingEquipment: null,
      multiclassPrerequisite: null,
      toolProficiencies: [],
      toolChoices: [],
      toolChoiceCount: 0,
      level1SpellPicks: { cantrips: 3, spells: 2 },
      primaryAbility: ["wisdom"],
    };
  }

  function level1Cleric(): Character {
    return {
      id: "char-1",
      class: "Cleric",
      level: 1,
      subclass: undefined,
      resources: { features: [], pools: [], maneuversKnown: [], toolProficienciesKnown: [] },
    } as unknown as Character;
  }

  function renderWithReference(referenceClasses: ClassOption[]) {
    return renderWithCharacter(<ClassFeaturesSection referenceClasses={referenceClasses} />, level1Cleric());
  }

  it("a 2014-resolved def (gate 1) offers the subclass prompt + picker at level 1", () => {
    renderWithReference([clericDef(1)]);
    expect(screen.getByText(/You have reached level 1 — choose a subclass/)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("a 2024-resolved def (gate 3) offers neither at level 1", () => {
    renderWithReference([clericDef(3)]);
    expect(screen.queryByText(/choose a subclass/)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
