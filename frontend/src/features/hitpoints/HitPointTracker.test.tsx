import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HitPointTracker from "@/features/hitpoints/HitPointTracker";
import * as client from "@/api/client";
import type { RollResult } from "@/lib/dice";
import type { Character, ConcentrationCheck } from "@/types/character";

// Mock the API client — HitPointTracker batches HP ops and swaps the returned
// character via onUpdate, then toasts any concentration check (issue #41).
vi.mock("@/api/client", () => ({
  applyHitPointOperations: vi.fn(),
}));

// Mock the 3D DiceRoller (issue #76): the real one mounts a Three.js Canvas that
// doesn't render in jsdom. The stub fires onResult once on mount with a fixed
// natural d20 (14), standing in for a completed tumble.
const SAVE_DIE = 14;
vi.mock("@/features/dice/DiceRoller", () => {
  function MockDiceRoller({ onResult }: { onResult?: (r: RollResult) => void }) {
    useEffect(() => {
      onResult?.({
        dice: [{ value: SAVE_DIE, dropped: false }],
        modifier: 0,
        total: SAVE_DIE,
        spec: { count: 1, faces: 20 },
      });
      // Fire exactly once when the roller mounts.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="dice-roller" />;
  }
  return { default: MockDiceRoller };
});

function makeCharacter(): Character {
  return {
    id: "char-1",
    hitPoints: { current: 20, max: 22, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 2, die: "d10", spent: 0 },
    abilityScores: {
      strength: 10, dexterity: 10, constitution: 14,
      intelligence: 10, wisdom: 10, charisma: 10,
    },
    pendingLevelUps: 0,
    advancementSlots: { total: 0, used: 0 },
    // Present → spellcaster → the auto-roll toggle is shown.
    spellcasting: {
      ability: "intelligence", spellSaveDC: 13, spellAttackBonus: 5,
      slots: [], spells: [], concentratingOn: null,
    },
  } as unknown as Character;
}

function mockResolve(concentrationChecks: ConcentrationCheck[]) {
  vi.mocked(client.applyHitPointOperations).mockResolvedValue({
    character: makeCharacter(),
    concentrationChecks,
  });
}

async function applyDamage() {
  const user = userEvent.setup();
  // Damage / Heal / Temp inputs all share placeholder "0"; the Damage field is
  // the first and its "Apply" button is unique to the damage control.
  const damageInput = screen.getAllByPlaceholderText("0")[0];
  await user.type(damageInput, "8");
  await user.click(screen.getByRole("button", { name: "Apply" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

/** A resolved/pending concentration check, with #76 fields defaulted. */
function check(partial: Partial<ConcentrationCheck>): ConcentrationCheck {
  return {
    status: "resolved",
    entryId: "entry-1",
    spellName: "Bless",
    reason: "damage",
    held: false,
    roll: null,
    saveBonus: 0,
    total: null,
    dc: null,
    damage: 8,
    ...partial,
  };
}

describe("HitPointTracker concentration toast (issue #41)", () => {
  it("toasts a held concentration save", async () => {
    mockResolve([
      check({ held: true, roll: 12, saveBonus: 2, total: 14, dc: 12 }),
    ]);
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await applyDamage();

    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent(/14 vs DC 12/);
    expect(note).toHaveTextContent(/held/i);
    expect(note).toHaveTextContent("Bless");
  });

  it("toasts a lost concentration save", async () => {
    mockResolve([
      check({ held: false, roll: 3, saveBonus: 2, total: 5, dc: 12 }),
    ]);
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await applyDamage();

    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent(/5 vs DC 12/);
    expect(note).toHaveTextContent(/lost/i);
    expect(note).toHaveTextContent("Bless");
  });

  it("toasts a death-reason drop with no save numbers", async () => {
    mockResolve([
      check({ reason: "death", held: false, saveBonus: null, damage: 999 }),
    ]);
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await applyDamage();

    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent(/dropped to 0 HP/i);
    expect(note).not.toHaveTextContent(/DC/);
  });

  it("shows no banner when there is no concentration check", async () => {
    mockResolve([]);
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await applyDamage();

    expect(vi.mocked(client.applyHitPointOperations)).toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("HitPointTracker interactive concentration save (issue #76)", () => {
  it("auto-roll on (default) shows the banner and no Roll CON save button", async () => {
    mockResolve([check({ held: true, roll: 12, saveBonus: 2, total: 14, dc: 12 })]);
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await applyDamage();

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /roll con save/i })).not.toBeInTheDocument();
    // The damage op carries the auto-roll preference (default true).
    const [, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(ops[0]).toMatchObject({ type: "damage", autoRollConcentration: true });
  });

  it("turning off auto-roll defers the save and prompts to roll", async () => {
    const user = userEvent.setup();
    mockResolve([
      check({ status: "pending", entryId: "entry-1", dc: 15, saveBonus: 2, held: null, damage: 30 }),
    ]);
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: /auto-roll concentration saves/i }));
    await applyDamage();

    // A roll prompt appears instead of an immediate result banner.
    expect(await screen.findByRole("button", { name: /roll con save/i })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const [, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(ops[0]).toMatchObject({ type: "damage", autoRollConcentration: false });
  });

  it("rolling the save submits a concentrationSave op with the natural d20", async () => {
    const user = userEvent.setup();
    // First the damage op returns a pending check; then the save op resolves.
    vi.mocked(client.applyHitPointOperations)
      .mockResolvedValueOnce({
        character: makeCharacter(),
        concentrationChecks: [
          check({ status: "pending", entryId: "entry-1", dc: 15, saveBonus: 2, held: null, damage: 30 }),
        ],
      })
      .mockResolvedValueOnce({
        character: makeCharacter(),
        concentrationChecks: [check({ held: false, roll: SAVE_DIE, saveBonus: 2, total: 16, dc: 15, damage: 30 })],
      });
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: /auto-roll concentration saves/i }));
    await applyDamage();
    await user.click(await screen.findByRole("button", { name: /roll con save/i }));

    // The mocked DiceRoller fires onResult → a concentrationSave op is submitted.
    const secondCall = vi.mocked(client.applyHitPointOperations).mock.calls[1];
    expect(secondCall[1][0]).toEqual({
      type: "concentrationSave",
      entryId: "entry-1",
      roll: SAVE_DIE,
      damage: 30,
    });
    // The resolved outcome surfaces in the banner.
    expect(await screen.findByRole("status")).toHaveTextContent(/lost/i);
  });
});
