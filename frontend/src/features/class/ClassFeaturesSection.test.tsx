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

function render(character: Character) {
  return renderWithCharacter(<ClassFeaturesSection referenceClasses={[]} />, character);
}

const FS_CATALOG = [
  { id: "archery", name: "Archery", description: "+2 bonus to attack rolls with ranged weapons.", category: "fighting_style" },
  { id: "defense", name: "Defense", description: "+1 AC while wearing armor.", category: "fighting_style" },
  { id: "sentinel", name: "Sentinel", description: "not a style", category: "general" },
] as unknown as CatalogFeat[];

// fightingStyleGrantingClasses (#1495) is the server-computed earned subset
// forwarded to fetchFeats' class gate.
function makeFighter(opts: { total: number; taken?: AdvancementEntry[] }): Character {
  const taken = opts.taken ?? [];
  return {
    id: "char-1",
    class: "Fighter",
    classes: [{ id: "ce-1", name: "Fighter", level: 5, needsSubclass: false, subclassMismatch: false }],
    fightingStyleGrantingClasses: ["Fighter"],
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
    // No asiLevel (#1438): the server's ASI gate rejects every fighting_style row.
    expect(client.fetchFeats).toHaveBeenCalledWith("EDITION_2014", undefined, ["Fighter"]);
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
      rulesEdition: "EDITION_2024",
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
        ? [{
            key: "cloakOfShadows",
            name: "Cloak of Shadows",
            cost: "action",
            enabled: true,
            reminder: "Magic action, entirely within dim light or darkness: spend 3 focus to become invisible…",
          }]
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

// needsSubclass is read off the backend-emitted classes[0] entry, never
// re-derived from character.level/classDef.subclassGateLevel — re-deriving it
// stranded a character on a cross-edition subclass row with no way out (#1598).
describe("ClassFeaturesSection — subclass gate is backend-computed (#1598)", () => {
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
      level1SpellPicks: { cantrips: 3, spells: 2, maxSpellLevel: 1 },
      primaryAbility: ["wisdom"],
    };
  }

  function clericWithEntry(needsSubclass: boolean, subclass?: string): Character {
    return {
      id: "char-1",
      class: "Cleric",
      level: 1,
      subclass,
      classes: [{ id: "c1", name: "Cleric", level: 1, subclass, needsSubclass, subclassUnavailable: false }],
      resources: { features: [], pools: [], maneuversKnown: [], toolProficienciesKnown: [] },
    } as unknown as Character;
  }

  function renderWithReference(referenceClasses: ClassOption[], character: Character) {
    return renderWithCharacter(<ClassFeaturesSection referenceClasses={referenceClasses} />, character);
  }

  it("offers the subclass prompt + picker when the wire entry says needsSubclass, regardless of the LOCAL classDef gate number", () => {
    // gate 3 in the local classDef would fail a `level >= subclassGateLevel` check at level 1.
    renderWithReference([clericDef(3)], clericWithEntry(true));
    expect(screen.getByText(/You have reached level 3 — choose a subclass/)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("offers neither when the wire entry says needsSubclass is false", () => {
    renderWithReference([clericDef(1)], clericWithEntry(false));
    expect(screen.queryByText(/choose a subclass/)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

// The frontend reads every roster entry, not just classes[0], so a stranded
// cross-edition subclass on a SECONDARY class entry also gets an explanation + re-pick (#1602).
describe("ClassFeaturesSection — stranded SECONDARY class entry (#1602)", () => {
  function fighterDef(): ClassOption {
    return {
      id: "class-fighter",
      name: "Fighter",
      hitDie: "d10",
      savingThrows: [],
      skillChoiceCount: 2,
      skillChoices: [],
      isSpellcaster: false,
      subclassGateLevel: 3,
      subclasses: [{ id: "sc-champion", name: "Champion", description: "" }],
      startingEquipment: null,
      multiclassPrerequisite: null,
      toolProficiencies: [],
      toolChoices: [],
      toolChoiceCount: 0,
      level1SpellPicks: null,
      primaryAbility: ["strength"],
    };
  }

  function warlockDef(): ClassOption {
    return {
      id: "class-warlock",
      name: "Warlock",
      hitDie: "d8",
      savingThrows: [],
      skillChoiceCount: 2,
      skillChoices: [],
      isSpellcaster: true,
      subclassGateLevel: 3,
      subclasses: [{ id: "sc-fiend", name: "The Fiend", description: "" }],
      startingEquipment: null,
      multiclassPrerequisite: null,
      toolProficiencies: [],
      toolChoices: [],
      toolChoiceCount: 0,
      level1SpellPicks: { cantrips: 2, spells: 0, maxSpellLevel: 1 },
      primaryAbility: ["charisma"],
    };
  }

  function strandedMulticlassCharacter(): Character {
    return {
      id: "char-1",
      class: "Fighter",
      subclass: "Champion",
      level: 5,
      rulesEdition: "EDITION_2024",
      rulesEditionLabel: "2024 rules",
      classes: [
        { id: "ce-fighter", name: "Fighter", level: 2, subclass: "Champion", needsSubclass: false, subclassUnavailable: false },
        { id: "ce-warlock", name: "Warlock", level: 3, subclass: "The Archfey", needsSubclass: true, subclassUnavailable: true },
      ],
      resources: { features: [], pools: [], maneuversKnown: [], toolProficienciesKnown: [] },
    } as unknown as Character;
  }

  it("shows the explanation and offers a re-pick for the stranded SECONDARY entry, alongside the healthy primary entry", () => {
    renderWithCharacter(
      <ClassFeaturesSection referenceClasses={[fighterDef(), warlockDef()]} />,
      strandedMulticlassCharacter(),
    );

    // "Champion" appears twice (roster list + primary Subclass section).
    expect(screen.getAllByText("Champion").length).toBeGreaterThan(0);
    expect(screen.getByText("Fighter Subclass")).toBeInTheDocument();

    expect(screen.getByText("Warlock Subclass")).toBeInTheDocument();
    expect(screen.getAllByText("The Archfey").length).toBeGreaterThan(0);
    expect(screen.getByText(/The Archfey isn't part of 2024 rules/)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("re-picking the secondary entry's subclass sends setSubclass through the shared class-transactions wiring", async () => {
    const user = userEvent.setup();
    vi.mocked(client.applyClassTransactions).mockResolvedValue(strandedMulticlassCharacter());

    renderWithCharacter(
      <ClassFeaturesSection referenceClasses={[fighterDef(), warlockDef()]} />,
      strandedMulticlassCharacter(),
    );

    await user.selectOptions(screen.getByRole("combobox"), "sc-fiend");
    expect(client.applyClassTransactions).toHaveBeenCalledWith("char-1", [{ type: "setSubclass", subclassId: "sc-fiend" }]);
  });
});
