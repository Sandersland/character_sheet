import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DisciplinesSection from "@/features/class/DisciplinesSection";
import { RollProvider } from "@/features/dice/RollContext";
import * as client from "@/api/client";
import type { CatalogDiscipline, Character, DisciplineEntry } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchDisciplines: vi.fn() }));

const CATALOG: CatalogDiscipline[] = [
  {
    id: "attune",
    name: "Elemental Attunement",
    description: "Free elemental parlor trick.",
    minLevel: 3,
    alwaysKnown: true,
    saveAbility: null,
    cost: { kind: "none" },
    effect: { effectType: "utility", damageType: null, attackType: null, saveAbility: null, saveEffect: null, scaling: { mode: "focus", dicePerStep: 0 } },
  },
  {
    id: "fangs",
    name: "Fangs of the Fire Snake",
    description: "Extend reach and deal fire damage.",
    minLevel: 3,
    alwaysKnown: false,
    saveAbility: null,
    cost: { kind: "pool", key: "focus", base: 1, perStep: 1 },
    effect: { effectType: "damage", dice: { count: 1, faces: 10, modifier: 0 }, damageType: "fire", attackType: "attack", saveAbility: null, saveEffect: null, scaling: { mode: "focus", dicePerStep: 1 } },
  },
  {
    id: "thunders",
    name: "Fist of Four Thunders",
    description: "Cast thunderwave.",
    minLevel: 3,
    alwaysKnown: false,
    saveAbility: "constitution",
    cost: { kind: "pool", key: "focus", base: 2 },
    effect: { effectType: "damage", dice: { count: 3, faces: 8, modifier: 0 }, damageType: "thunder", attackType: "save", saveAbility: "constitution", saveEffect: "half", scaling: { mode: "focus", dicePerStep: 0 } },
  },
];

function makeCharacter(focusRemaining: number): Character {
  return {
    id: "char-1",
    class: "Monk",
    level: 6,
    resources: {
      features: [],
      pools: [{ key: "focus", label: "Focus", total: 6, recharge: "shortRest", used: 6 - focusRemaining, remaining: focusRemaining }],
      maneuversKnown: [],
      disciplinesKnown: [],
      toolProficienciesKnown: [],
    },
  } as unknown as Character;
}

const learnedFangs: DisciplineEntry = { id: "entry-1", disciplineId: "fangs", name: "Fangs of the Fire Snake", description: "Extend reach and deal fire damage." };

function renderSection(props: Partial<React.ComponentProps<typeof DisciplinesSection>> = {}) {
  const handlers = {
    onCast: vi.fn(),
    onLearn: vi.fn(),
    onForget: vi.fn(),
    onSwap: vi.fn(),
  };
  render(
    <RollProvider>
      <DisciplinesSection
        character={makeCharacter(6)}
        choiceCount={2}
        saveDC={13}
        disciplinesKnown={[learnedFangs]}
        busy={false}
        {...handlers}
        {...props}
      />
    </RollProvider>,
  );
  return handlers;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.fetchDisciplines).mockResolvedValue(CATALOG);
});

describe("DisciplinesSection", () => {
  it("shows focus save DC, focus remaining, the learned + always-known rows, and known count", async () => {
    renderSection();
    expect(screen.getByText("Focus Save DC:")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
    // Learned + always-known both listed once the catalog loads.
    await waitFor(() => expect(screen.getByText("Elemental Attunement")).toBeInTheDocument());
    expect(screen.getByText("Fangs of the Fire Snake")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 known")).toBeInTheDocument();
  });

  it("casts a known discipline, rolling and passing the total up as a castDiscipline op", async () => {
    const user = userEvent.setup();
    const handlers = renderSection();
    await waitFor(() => expect(screen.getByText("Fangs of the Fire Snake")).toBeInTheDocument());

    const fangsRow = screen.getByText("Fangs of the Fire Snake").closest("li")!;
    await user.click(within(fangsRow).getByRole("button", { name: "Cast" }));

    expect(handlers.onCast).toHaveBeenCalledTimes(1);
    const op = handlers.onCast.mock.calls[0][0];
    expect(op).toMatchObject({ type: "castDiscipline", disciplineId: "fangs", focusSpent: 1 });
    expect(op.roll).toBeGreaterThanOrEqual(1);
    expect(op.roll).toBeLessThanOrEqual(10);
  });

  it("lets a scalable discipline choose extra focus before casting", async () => {
    const user = userEvent.setup();
    const handlers = renderSection();
    await waitFor(() => expect(screen.getByText("Fangs of the Fire Snake")).toBeInTheDocument());

    const fangsRow = screen.getByText("Fangs of the Fire Snake").closest("li")!;
    await user.selectOptions(within(fangsRow).getByRole("combobox"), "3");
    await user.click(within(fangsRow).getByRole("button", { name: "Cast" }));

    const op = handlers.onCast.mock.calls[0][0];
    expect(op.focusSpent).toBe(3);
    // 3 focus → base 1 + 2 extra steps → 3d10, so at least 3.
    expect(op.roll).toBeGreaterThanOrEqual(3);
  });

  it("learns a discipline from the picker (gated to level, hides always-known/known)", async () => {
    const user = userEvent.setup();
    const handlers = renderSection();
    await waitFor(() => expect(screen.getByText("Fangs of the Fire Snake")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /learn discipline/i }));
    // Fist of Four Thunders is learnable; Elemental Attunement (always-known) and
    // the already-known Fangs are hidden from the picker.
    const panel = screen.getByText("Learn a Discipline").closest("div")!.parentElement!;
    const thunderRow = within(panel).getByText("Fist of Four Thunders").closest("li")!;
    await user.click(within(thunderRow).getByRole("button", { name: "Learn" }));

    expect(handlers.onLearn).toHaveBeenCalledWith({ type: "learnDiscipline", disciplineId: "thunders" });
  });

  it("swaps a known discipline for another", async () => {
    const user = userEvent.setup();
    const handlers = renderSection();
    await waitFor(() => expect(screen.getByText("Fangs of the Fire Snake")).toBeInTheDocument());

    const fangsRow = screen.getByText("Fangs of the Fire Snake").closest("li")!;
    await user.click(within(fangsRow).getByRole("button", { name: "Swap" }));

    expect(screen.getByText(/Swap out Fangs of the Fire Snake/)).toBeInTheDocument();
    const thunderRow = screen.getByText("Fist of Four Thunders").closest("li")!;
    await user.click(within(thunderRow).getByRole("button", { name: "Swap in" }));

    expect(handlers.onSwap).toHaveBeenCalledWith({ type: "swapDiscipline", entryId: "entry-1", disciplineId: "thunders" });
  });
});
