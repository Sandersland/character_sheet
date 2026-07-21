import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ClassFeaturesSection from "@/features/class/ClassFeaturesSection";
import { RollProvider } from "@/features/dice/RollContext";
import * as client from "@/api/client";
import type { AdvancementEntry, CatalogDiscipline, CatalogFeat, Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyClassTransactions: vi.fn(),
  applyAdvancementTransactions: vi.fn(),
  applyResourceTransactions: vi.fn(),
  applyDisciplineTransactions: vi.fn(),
  applyConditionTransactions: vi.fn(),
  fetchDisciplines: vi.fn(),
  fetchFeats: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

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
    level: 5,
    fightingStyleSlots: { total: opts.total, used: taken.length },
    advancements: taken,
    resources: { features: [], pools: [], maneuversKnown: [], toolProficienciesKnown: [] },
  } as unknown as Character;
}

describe("ClassFeaturesSection — Fighting Style", () => {
  it("renders the picker when a fighting-style slot is open and none taken", () => {
    render(
      <ClassFeaturesSection character={makeFighter({ total: 1 })} referenceClasses={[]} onUpdate={vi.fn()} />,
    );
    expect(screen.getByText("Fighting Style")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /choose a fighting style/i })).toBeInTheDocument();
  });

  it("does NOT render the Fighting Style section when total slots is 0", () => {
    render(
      <ClassFeaturesSection character={makeFighter({ total: 0 })} referenceClasses={[]} onUpdate={vi.fn()} />,
    );
    expect(screen.queryByText("Fighting Style")).not.toBeInTheDocument();
  });

  it("shows a taken feat's name + description, and no picker once slots are full", () => {
    const taken = [
      { id: "fs1", level: 1, kind: "feat", slot: "fightingStyle", featId: "archery", featName: "Archery", featDescription: "+2 bonus to attack rolls with ranged weapons.", abilityDeltas: {}, hpDelta: 0, initDelta: 0 },
    ] as unknown as AdvancementEntry[];
    render(
      <ClassFeaturesSection character={makeFighter({ total: 1, taken })} referenceClasses={[]} onUpdate={vi.fn()} />,
    );
    expect(screen.getByText("Archery")).toBeInTheDocument();
    expect(screen.getByText(/\+2 bonus to attack rolls/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /choose a fighting style/i })).not.toBeInTheDocument();
  });

  it("choosing a style takes a slot:fightingStyle feat via applyAdvancementTransactions, excluding non-styles", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    vi.mocked(client.fetchFeats).mockResolvedValue(FS_CATALOG);
    const mockApply = vi.mocked(client.applyAdvancementTransactions);
    mockApply.mockResolvedValue(makeFighter({ total: 1 }));

    render(
      <ClassFeaturesSection character={makeFighter({ total: 1 })} referenceClasses={[]} onUpdate={onUpdate} />,
    );

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

describe("ClassFeaturesSection — Cloak of Shadows", () => {
  function makeShadowMonk(cloakOfShadowsAvailable: boolean): Character {
    return {
      id: "char-1",
      class: "Monk",
      level: cloakOfShadowsAvailable ? 11 : 6,
      subclass: "Way of Shadow",
      conditions: { active: [], exhaustion: 0 },
      resources: {
        features: [],
        pools: [],
        maneuversKnown: [],
        toolProficienciesKnown: [],
        cloakOfShadowsAvailable: cloakOfShadowsAvailable || undefined,
      },
    } as unknown as Character;
  }

  it("offers the Cloak of Shadows control at L11 and applies invisible via applyConditionTransactions", async () => {
    const user = userEvent.setup();
    vi.mocked(client.applyConditionTransactions).mockResolvedValue(makeShadowMonk(true));

    render(
      <ClassFeaturesSection character={makeShadowMonk(true)} referenceClasses={[]} onUpdate={vi.fn()} />,
    );

    expect(screen.getByText("Cloak of Shadows")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Become Invisible" }));

    expect(client.applyConditionTransactions).toHaveBeenCalledWith("char-1", [
      { type: "applyCondition", key: "invisible", source: "Cloak of Shadows" },
    ]);
  });

  it("does NOT offer Cloak of Shadows below L11 (flag absent)", () => {
    render(
      <ClassFeaturesSection character={makeShadowMonk(false)} referenceClasses={[]} onUpdate={vi.fn()} />,
    );
    expect(screen.queryByText("Cloak of Shadows")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Become Invisible" })).not.toBeInTheDocument();
  });
});

describe("ClassFeaturesSection — Elemental Disciplines", () => {
  const DISCIPLINE_CATALOG: CatalogDiscipline[] = [
    {
      id: "fangs",
      name: "Fangs of the Fire Snake",
      description: "Extend reach and deal fire damage.",
      minLevel: 3,
      alwaysKnown: false,
      saveAbility: null,
      cost: { kind: "pool", key: "ki", base: 1, perStep: 1 },
      effect: { effectType: "damage", dice: { count: 1, faces: 10, modifier: 0 }, damageType: "fire", attackType: "attack", saveAbility: null, saveEffect: null, scaling: { mode: "ki", dicePerStep: 1 } },
    },
    {
      id: "thunders",
      name: "Fist of Four Thunders",
      description: "Cast thunderwave.",
      minLevel: 3,
      alwaysKnown: false,
      saveAbility: "constitution",
      cost: { kind: "pool", key: "ki", base: 2 },
      effect: { effectType: "damage", dice: { count: 3, faces: 8, modifier: 0 }, damageType: "thunder", attackType: "save", saveAbility: "constitution", saveEffect: "half", scaling: { mode: "ki", dicePerStep: 0 } },
    },
  ];

  function makeMonk(): Character {
    return {
      id: "char-1",
      class: "Monk",
      level: 6,
      subclass: "Way of the Four Elements",
      resources: {
        features: [],
        pools: [{ key: "ki", label: "Ki", total: 6, recharge: "shortRest", used: 0, remaining: 6 }],
        maneuversKnown: [],
        toolProficienciesKnown: [],
        disciplineChoiceCount: 2,
        disciplineSaveDC: 13,
        disciplinesKnown: [{ id: "entry-1", disciplineId: "fangs", name: "Fangs of the Fire Snake", description: "Extend reach and deal fire damage." }],
      },
    } as unknown as Character;
  }

  beforeEach(() => {
    vi.mocked(client.fetchDisciplines).mockResolvedValue(DISCIPLINE_CATALOG);
  });

  it("renders the discipline block for a Four Elements monk and casts through applyDisciplineTransactions", async () => {
    const user = userEvent.setup();
    vi.mocked(client.applyDisciplineTransactions).mockResolvedValue(makeMonk());

    render(
      <RollProvider>
        <ClassFeaturesSection character={makeMonk()} referenceClasses={[]} onUpdate={vi.fn()} />
      </RollProvider>,
    );

    expect(screen.getByText("Elemental Disciplines")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Fangs of the Fire Snake")).toBeInTheDocument());

    const fangsRow = screen.getByText("Fangs of the Fire Snake").closest("li")!;
    await user.click(within(fangsRow).getByRole("button", { name: "Cast" }));

    await waitFor(() => expect(client.applyDisciplineTransactions).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(client.applyDisciplineTransactions).mock.calls[0];
    expect(ops[0]).toMatchObject({ type: "castDiscipline", disciplineId: "fangs", kiSpent: 1 });
  });

  it("learns a discipline through applyResourceTransactions", async () => {
    const user = userEvent.setup();
    vi.mocked(client.applyResourceTransactions).mockResolvedValue(makeMonk());

    render(
      <RollProvider>
        <ClassFeaturesSection character={makeMonk()} referenceClasses={[]} onUpdate={vi.fn()} />
      </RollProvider>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /learn discipline/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /learn discipline/i }));
    const thunderRow = screen.getByText("Fist of Four Thunders").closest("li")!;
    await user.click(within(thunderRow).getByRole("button", { name: "Learn" }));

    expect(client.applyResourceTransactions).toHaveBeenCalledWith("char-1", [
      { type: "learnDiscipline", disciplineId: "thunders" },
    ]);
  });
});
