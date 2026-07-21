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

function spell(id: string, level: number, classes: string[], description = ""): CatalogSpell {
  return {
    id, name: id, level, school: "evocation", castingTime: "1 action",
    range: "60 ft", duration: "Instant", description, concentration: false,
    ritual: false, classes, cantripScaling: false,
  };
}

const CATALOG: CatalogSpell[] = [
  spell("Firebolt", 0, ["wizard"]),        // cantrip — excluded
  spell("Shield", 1, ["wizard"], "An invisible barrier of magical force appears and protects you."),
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

// A known caster whose spellbook carries swap candidates (#1101).
function casterWithBook(book: Array<{ id: string; name: string; level: number; source?: "subclass" | "item" }>): Character {
  const spells = book.map((b) => ({ school: "evocation", castingTime: "1a", range: "self", duration: "1m", prepared: false, ...b }));
  return {
    id: "c1",
    classes: [{ id: "e1", name: "wizard", level: 4 }],
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
    grantedSpells: [],
  };
  return (
    <LevelUpStepContext.Provider value={{ character, draft, setDraft, plan }}>
      <NewSpellsStep step={step} />
      <output data-testid="picks">{JSON.stringify(draft.spellsLearned ?? [])}</output>
      <output data-testid="forgets">{JSON.stringify(draft.spellsForgotten ?? [])}</output>
      <output data-testid="cantrips">{JSON.stringify(draft.cantripsLearned ?? [])}</output>
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
    const known = await screen.findByRole("button", { name: "Shield already known" });
    expect(known).toBeDisabled();
    expect(screen.getByText("Known")).toBeInTheDocument();
  });

  it("selecting a spell writes a learnSpell op and advances the M-of-N counter", async () => {
    const user = userEvent.setup();
    render(<Harness step={newSpellsStep()} character={caster()} />);
    expect(await screen.findByText(/0 of 2/)).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Add Shield" }));

    await waitFor(() => expect(screen.getByText(/1 of 2/)).toBeInTheDocument());
    expect(screen.getByTestId("picks")).toHaveTextContent(
      JSON.stringify([{ type: "learnSpell", spellId: "Shield" }]),
    );
  });

  it("hard-caps selection at the count (the N+1th is disabled)", async () => {
    const user = userEvent.setup();
    render(<Harness step={newSpellsStep(1)} character={caster()} />);
    await user.click(await screen.findByRole("button", { name: "Add Shield" }));

    await waitFor(() => expect(screen.getByText(/1 of 1/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Add MistyStep" })).toBeDisabled();
  });

  it("under Magical Secrets, off-class spells are offered", async () => {
    render(<Harness step={newSpellsStep(2, { maxSpellLevel: 2, magicalSecrets: true })} character={caster()} />);
    expect(await screen.findByText("CureWounds")).toBeInTheDocument();
    expect(screen.getByText(/Bard, Cleric, Druid, or Wizard/i)).toBeInTheDocument();
  });

  it("states the learn count and, when swaps are allowed, that the swap is separate (#1139)", async () => {
    render(<Harness step={newSpellsStep(1, { maxSpellLevel: 2, canSwap: true })} character={casterWithBook(BOOK)} />);
    expect(await screen.findByText(/You learn 1 new spell\./i)).toBeInTheDocument();
    expect(screen.getByText(/You may also swap one spell for another\./i)).toBeInTheDocument();
  });

  it("omits the swap sentence when the step cannot swap (#1139)", async () => {
    render(<Harness step={newSpellsStep(2)} character={caster()} />);
    expect(await screen.findByText(/You learn 2 new spells\./i)).toBeInTheDocument();
    expect(screen.queryByText(/You may also swap one spell for another/i)).not.toBeInTheDocument();
  });
});

describe("NewSpellsStep — cantrip picks (#1131)", () => {
  it("shows a cantrip section alongside the leveled picker and records a cantrip pick", async () => {
    const user = userEvent.setup();
    render(<Harness step={newSpellsStep(1, { maxSpellLevel: 2, cantrips: 1 })} character={caster()} />);
    expect(await screen.findByText(/Choose 1 cantrip/)).toBeInTheDocument();
    // The cantrip (Firebolt) is offered in the cantrip section; the leveled picker still lists Shield.
    await user.click(await screen.findByRole("button", { name: "Add Firebolt" }));
    await waitFor(() =>
      expect(screen.getByTestId("cantrips")).toHaveTextContent(
        JSON.stringify([{ type: "learnSpell", spellId: "Firebolt" }]),
      ),
    );
    expect(screen.getByRole("button", { name: "Add Shield" })).toBeInTheDocument();
    // A leveled pick stays in spellsLearned, never in cantripsLearned.
    await user.click(screen.getByRole("button", { name: "Add Shield" }));
    expect(screen.getByTestId("picks")).toHaveTextContent(
      JSON.stringify([{ type: "learnSpell", spellId: "Shield" }]),
    );
  });

  it("a cantrips-only level (count 0, no swap) hides the leveled picker", async () => {
    render(<Harness step={newSpellsStep(0, { cantrips: 1 })} character={caster()} />);
    expect(await screen.findByText(/Choose 1 cantrip/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Search spells")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Firebolt" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Shield" })).not.toBeInTheDocument();
  });

  it("opens the shared detail card with the full description on row tap; the CTA learns and closes it (#1158)", async () => {
    const user = userEvent.setup();
    render(<Harness step={newSpellsStep()} character={caster()} />);
    await user.click(await screen.findByRole("button", { name: "Open Shield" }));
    expect(screen.getByText(/invisible barrier of magical force/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Learn Shield/ }));
    expect(screen.getByTestId("picks")).toHaveTextContent(
      JSON.stringify([{ type: "learnSpell", spellId: "Shield" }]),
    );
    expect(screen.queryByText(/invisible barrier of magical force/)).not.toBeInTheDocument();
  });
});

const BOOK = [
  { id: "k-old", name: "OldChant", level: 1 },
  { id: "k-hex", name: "GrantedChant", level: 1, source: "subclass" as const }, // granted — excluded
  { id: "k-light", name: "CantripChant", level: 0 },                            // cantrip — excluded
];
const swapStep = (count = 1): LevelUpStep => newSpellsStep(count, { maxSpellLevel: 2, canSwap: true });

describe("NewSpellsStep — swap panel visibility (#1101)", () => {
  it("hides the swap panel when the step cannot swap", async () => {
    render(<Harness step={newSpellsStep(2)} character={casterWithBook(BOOK)} />);
    await screen.findByText("Shield");
    expect(screen.queryByRole("button", { name: /swap a known spell/i })).not.toBeInTheDocument();
  });

  it("shows a collapsed disclosure that lists only swappable spells once expanded", async () => {
    const user = userEvent.setup();
    render(<Harness step={swapStep()} character={casterWithBook(BOOK)} />);
    const toggle = await screen.findByRole("button", { name: /swap a known spell/i });
    // Collapsed: the swap candidates are not yet listed.
    expect(screen.queryByRole("button", { name: /OldChant/ })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(await screen.findByRole("button", { name: /OldChant/ })).toBeInTheDocument();
    // Granted + cantrip entries are never swap candidates.
    expect(screen.queryByRole("button", { name: /GrantedChant/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /CantripChant/ })).not.toBeInTheDocument();
  });
});

describe("NewSpellsStep — swap selection (#1101)", () => {
  it("picking a swap marks 'Forgetting', bumps the budget header, and allows one extra learn", async () => {
    const user = userEvent.setup();
    render(<Harness step={swapStep(1)} character={casterWithBook(BOOK)} />);
    await user.click(await screen.findByRole("button", { name: /swap a known spell/i }));
    await user.click(await screen.findByRole("button", { name: /OldChant/ }));

    expect(await screen.findByText(/Forgetting: OldChant/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose 2 \(1 \+ 1 swap\)/)).toBeInTheDocument();
    expect(screen.getByTestId("forgets")).toHaveTextContent(JSON.stringify([{ type: "forgetSpell", entryId: "k-old" }]));

    // The cap is now 2 — both catalog picks are allowed.
    await user.click(screen.getByRole("button", { name: "Add Shield" }));
    await user.click(screen.getByRole("button", { name: "Add MistyStep" }));
    expect(screen.getByTestId("picks")).toHaveTextContent(
      JSON.stringify([{ type: "learnSpell", spellId: "Shield" }, { type: "learnSpell", spellId: "MistyStep" }]),
    );
  });

  it("deselecting the swap reverts the header and trims the over-cap learn", async () => {
    const user = userEvent.setup();
    render(<Harness step={swapStep(1)} character={casterWithBook(BOOK)} />);
    const toggle = await screen.findByRole("button", { name: /swap a known spell/i });
    await user.click(toggle);
    await user.click(await screen.findByRole("button", { name: /OldChant/ }));
    await user.click(screen.getByRole("button", { name: "Add Shield" }));
    await user.click(screen.getByRole("button", { name: "Add MistyStep" }));
    // Deselect the swap — cap drops to 1, so one learn is trimmed.
    await user.click(screen.getByRole("button", { name: /OldChant/ }));

    await waitFor(() => expect(screen.getByTestId("forgets")).toHaveTextContent("[]"));
    expect(screen.getByTestId("picks")).toHaveTextContent(JSON.stringify([{ type: "learnSpell", spellId: "Shield" }]));
  });

  it("a swap-only level (count 0) shows the optional copy", async () => {
    render(<Harness step={swapStep(0)} character={casterWithBook(BOOK)} />);
    expect(await screen.findByText(/No new spells at this level, but you may swap one prepared spell/i)).toBeInTheDocument();
  });

  it("a staged swap on a count-0 level reads 'swap replacement', not '0 + 1 swap'", async () => {
    const user = userEvent.setup();
    render(<Harness step={swapStep(0)} character={casterWithBook(BOOK)} />);
    await user.click(await screen.findByRole("button", { name: /swap a known spell/i }));
    await user.click(await screen.findByRole("button", { name: /OldChant/ }));

    expect(await screen.findByText(/Choose 1 \(swap replacement\)/)).toBeInTheDocument();
    expect(screen.queryByText(/0 \+ 1 swap/)).not.toBeInTheDocument();
  });
});
