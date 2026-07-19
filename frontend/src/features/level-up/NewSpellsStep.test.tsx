import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSpells } from "@/api/client";
import NewSpellsStep from "@/features/level-up/NewSpellsStep";
import { LevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { CatalogSpell, Character, LevelUpPlanResponse, LevelUpStep } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchSpells: vi.fn() }));
const fetchMock = vi.mocked(fetchSpells);

function spell(id: string, level: number, classes: string[]): CatalogSpell {
  return {
    id, name: id, level, school: "evocation", castingTime: "1 action",
    range: "60 ft", duration: "Instant", description: "", concentration: false,
    ritual: false, classes, cantripScaling: false,
  };
}

const CATALOG: CatalogSpell[] = [
  spell("Firebolt", 0, ["wizard"]),        // cantrip — excluded
  spell("Shield", 1, ["wizard"]),
  spell("MistyStep", 2, ["wizard"]),
  spell("Fireball", 3, ["wizard"]),        // above a level-2 ceiling
  spell("CureWounds", 1, ["cleric"]),      // off-class for a wizard
];

function caster(learnedSpellId?: string): Character {
  const spells = learnedSpellId ? [{ id: "entry-x", spellId: learnedSpellId, name: learnedSpellId, level: 1, school: "evocation", castingTime: "1a", range: "self", duration: "1m" }] : [];
  return {
    id: "c1",
    classes: [{ id: "e1", name: "wizard", level: 2 }],
    spellcasting: { slots: [], arcana: [], spells },
  } as unknown as Character;
}

function newSpellsStep(count = 2, meta: Record<string, unknown> = { maxSpellLevel: 2 }): LevelUpStep {
  return { kind: "newSpells", count, meta };
}

function Harness({ step, character }: { step: LevelUpStep; character: Character }) {
  const [draft, setDraft] = useState<LevelUpDraft>({});
  const plan: LevelUpPlanResponse = {
    target: { className: "wizard", subclass: null, newLevel: 3, isPrimary: true },
    steps: [step],
  };
  return (
    <LevelUpStepContext.Provider value={{ character, draft, setDraft, plan }}>
      <NewSpellsStep step={step} />
      <output data-testid="picks">{JSON.stringify(draft.spellsLearned ?? [])}</output>
    </LevelUpStepContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(CATALOG);
});

describe("NewSpellsStep", () => {
  it("lists only eligible spells (no cantrips, above-ceiling, or off-class)", async () => {
    render(<Harness step={newSpellsStep()} character={caster()} />);
    expect(await screen.findByText("Shield")).toBeInTheDocument();
    expect(screen.getByText("MistyStep")).toBeInTheDocument();
    expect(screen.queryByText("Firebolt")).not.toBeInTheDocument();
    expect(screen.queryByText("Fireball")).not.toBeInTheDocument();
    expect(screen.queryByText("CureWounds")).not.toBeInTheDocument();
  });

  it("marks an already-known spell as disabled", async () => {
    render(<Harness step={newSpellsStep()} character={caster("Shield")} />);
    const known = await screen.findByRole("button", { name: /Shield/ });
    expect(known).toBeDisabled();
    expect(screen.getByText("Known")).toBeInTheDocument();
  });

  it("selecting a spell writes a learnSpell op and advances the M-of-N counter", async () => {
    const user = userEvent.setup();
    render(<Harness step={newSpellsStep()} character={caster()} />);
    expect(await screen.findByText(/0 of 2/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Shield/ }));

    await waitFor(() => expect(screen.getByText(/1 of 2/)).toBeInTheDocument());
    expect(screen.getByTestId("picks")).toHaveTextContent(
      JSON.stringify([{ type: "learnSpell", spellId: "Shield" }]),
    );
  });

  it("hard-caps selection at the count (the N+1th is disabled)", async () => {
    const user = userEvent.setup();
    render(<Harness step={newSpellsStep(1)} character={caster()} />);
    await user.click(await screen.findByRole("button", { name: /Shield/ }));

    await waitFor(() => expect(screen.getByText(/1 of 1/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /MistyStep/ })).toBeDisabled();
  });

  it("under Magical Secrets, off-class spells are offered", async () => {
    render(<Harness step={newSpellsStep(2, { maxSpellLevel: 2, magicalSecrets: true })} character={caster()} />);
    expect(await screen.findByText("CureWounds")).toBeInTheDocument();
    expect(screen.getByText(/any class/i)).toBeInTheDocument();
  });
});
