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
    // No asiLevel (#1438): the server's ASI gate rejects every fighting_style row,
    // so a level here would render this picker permanently empty.
    expect(client.fetchFeats).toHaveBeenCalledWith("EDITION_2014", undefined);
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

// #1598: needsSubclass is now read off the backend-emitted classes[0] entry,
// never re-derived from character.level/classDef.subclassGateLevel (that
// mirror — #1325's own fix — is exactly what stranded a character on a
// cross-edition subclass row with no way out: a held subclass NAME made the
// old `!character.subclass` half of the check false, so the picker never
// rendered). classDef here supplies only display data (the gate-level
// wording, the subclasses list) — the gate decision itself comes from
// classes[0].needsSubclass.
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
    // gate 3 in the local classDef would have failed the old client-side
    // `level >= subclassGateLevel` check at level 1 — proving the component
    // no longer looks at that number to decide whether to show the picker.
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
