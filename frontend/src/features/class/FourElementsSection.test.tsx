import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import FourElementsSection from "@/features/class/FourElementsSection";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import * as client from "@/api/client";
import type { CatalogDiscipline, Character } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchDisciplines: vi.fn() }));

const baseEffect = {
  damageType: null,
  attackType: null,
  saveAbility: null,
  saveEffect: null,
  buffTarget: null,
  buffModifier: null,
};

const FANGS: CatalogDiscipline = {
  id: "fangs-cat",
  name: "Fangs of the Fire Snake",
  description: "Catalog description.",
  minLevel: 3,
  cost: { kind: "pool", key: "ki", base: 1, perStep: 1 },
  effect: {
    effectType: "damage",
    dice: { count: 1, faces: 10, modifier: 0 },
    scaling: { mode: "poolStep", dicePerStep: 1 },
    ...baseEffect,
  },
  steps: [
    { ki: 1, roll: { count: 1, faces: 10, modifier: 0 } },
    { ki: 2, roll: { count: 2, faces: 10, modifier: 0 } },
    { ki: 3, roll: { count: 3, faces: 10, modifier: 0 } },
  ],
};

const SHAPE: CatalogDiscipline = {
  id: "shape-cat",
  name: "Shape the Flowing River",
  description: "Catalog description.",
  minLevel: 3,
  cost: { kind: "pool", key: "ki", base: 1 },
  effect: { effectType: "utility", scaling: { mode: "none" }, ...baseEffect },
  steps: [],
};

function makeCharacter(kiRemaining: number, known: { id: string; optionId?: string; name: string; description: string }[]): Character {
  return {
    id: "char-1",
    class: "Monk",
    level: 6,
    rulesEdition: "EDITION_2014",
    resources: {
      features: [],
      pools: [{ key: "ki", label: "Ki Points", total: 6, recharge: "shortRest", used: 6 - kiRemaining, remaining: kiRemaining }],
      maneuversKnown: [],
      toolProficienciesKnown: [],
      choicesKnown: { fourElementsDisciplines: known },
    },
  } as unknown as Character;
}

function renderSection(character: Character, props: Partial<React.ComponentProps<typeof FourElementsSection>> = {}) {
  const onCast = vi.fn();
  renderWithCharacter(<FourElementsSection busy={false} onCast={onCast} {...props} />, character);
  return { onCast };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.fetchDisciplines).mockResolvedValue([FANGS, SHAPE]);
});

describe("FourElementsSection", () => {
  it("lists known disciplines with ki remaining, fetched for the character's own edition", async () => {
    const user = userEvent.setup();
    renderSection(makeCharacter(4, [{ id: "e1", optionId: "fangs-cat", name: "Fangs of the Fire Snake", description: "Learned snapshot text." }]));
    await waitFor(() => expect(screen.getByText("Fangs of the Fire Snake")).toBeInTheDocument());
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(client.fetchDisciplines).toHaveBeenCalledWith("EDITION_2014");

    // Description renders in the row's expandable body (AbilityRowShell) —
    // the LEARNED snapshot text, not the catalog's own description.
    await user.click(screen.getByRole("button", { name: /Fangs of the Fire Snake/ }));
    expect(screen.getByText("Learned snapshot text.")).toBeInTheDocument();
  });

  it("shows the empty state and the level-up hint when nothing is known yet", () => {
    renderSection(makeCharacter(2, []));
    expect(screen.getByText("No disciplines learned yet.")).toBeInTheDocument();
    expect(screen.getByText(/chosen when you level up/)).toBeInTheDocument();
  });

  it("casts a scalable discipline at the selected ki amount, rolling the matching dice count", async () => {
    const user = userEvent.setup();
    const { onCast } = renderSection(
      makeCharacter(4, [{ id: "e1", optionId: "fangs-cat", name: "Fangs of the Fire Snake", description: "d" }]),
    );
    await waitFor(() => expect(screen.getByText("Fangs of the Fire Snake")).toBeInTheDocument());

    const row = screen.getByText("Fangs of the Fire Snake").closest("li")!;
    await user.selectOptions(within(row).getByRole("combobox"), "3");
    await user.click(within(row).getByRole("button", { name: "Cast" }));

    expect(onCast).toHaveBeenCalledTimes(1);
    const op = onCast.mock.calls[0][0];
    expect(op.type).toBe("castDiscipline");
    expect(op.entryId).toBe("e1");
    expect(op.requestedKi).toBe(3);
    // 3d10, each face in [1,10] — the roll itself is random, only its shape is asserted.
    expect(op.roll).toBeGreaterThanOrEqual(3);
    expect(op.roll).toBeLessThanOrEqual(30);
  });

  it("casts a no-dice utility discipline with no roll and no ki picker", async () => {
    const user = userEvent.setup();
    const { onCast } = renderSection(
      makeCharacter(2, [{ id: "e2", optionId: "shape-cat", name: "Shape the Flowing River", description: "d" }]),
    );
    await waitFor(() => expect(screen.getByText("Shape the Flowing River")).toBeInTheDocument());

    const row = screen.getByText("Shape the Flowing River").closest("li")!;
    expect(within(row).queryByRole("combobox")).not.toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Cast" }));

    expect(onCast).toHaveBeenCalledWith({ type: "castDiscipline", entryId: "e2", requestedKi: 1 });
  });

  it("disables Cast when ki can't cover even the base cost", async () => {
    renderSection(makeCharacter(0, [{ id: "e2", optionId: "shape-cat", name: "Shape the Flowing River", description: "d" }]));
    await waitFor(() => expect(screen.getByText("Shape the Flowing River")).toBeInTheDocument());
    const row = screen.getByText("Shape the Flowing River").closest("li")!;
    expect(within(row).getByRole("button", { name: "Cast" })).toBeDisabled();
  });

  it("surfaces a catalog load error", async () => {
    vi.mocked(client.fetchDisciplines).mockRejectedValue(new Error("boom"));
    renderSection(makeCharacter(3, []));
    await waitFor(() => expect(screen.getByText(/Couldn't load discipline catalog/)).toBeInTheDocument());
  });
});
