import { useEffect, type ReactElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HitPointTracker from "@/features/hitpoints/HitPointTracker";
import { RollProvider } from "@/features/dice/RollContext";
import * as client from "@/api/client";
import type { RollResult } from "@/lib/dice";
import type { Character, ConcentrationCheck } from "@/types/character";

// Mock the API client — HitPointTracker batches HP ops and swaps the returned
// character via onUpdate, then toasts any concentration check (issue #41).
// logRoll backs the concentration save's session-log emit (issue #460).
vi.mock("@/api/client", () => ({
  applyHitPointOperations: vi.fn(),
  logRoll: vi.fn().mockResolvedValue(undefined),
}));

// The concentration-save modal reads useRoll(); every render is wrapped so it
// resolves (matching the app, where HitPointTracker always sits in a RollProvider).
function render(ui: ReactElement) {
  return rtlRender(<RollProvider>{ui}</RollProvider>);
}

// Mock the 3D DiceRoller (issue #76): the real one mounts a Three.js Canvas that
// doesn't render in jsdom. The stub fires onResult once on mount with a fixed
// natural d20 (14), standing in for a completed tumble.
const SAVE_DIE = 14;
vi.mock("@/features/dice/DiceRoller", () => {
  function MockDiceRoller({
    onResult,
    spec,
  }: {
    onResult?: (r: RollResult) => void;
    spec?: { count: number; faces: number; modifier?: number };
  }) {
    useEffect(() => {
      const modifier = spec?.modifier ?? 0;
      onResult?.({
        dice: [{ value: SAVE_DIE, dropped: false }],
        modifier,
        total: SAVE_DIE + modifier,
        spec: { count: 1, faces: 20, modifier },
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
  // Damage is the default segmented mode; type into its stepper field and apply.
  const damageInput = screen.getByRole("spinbutton", { name: /damage amount/i });
  await user.type(damageInput, "8");
  await user.click(screen.getByRole("button", { name: /apply \d+ damage/i }));
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

describe("HitPointTracker segmented action control (issue #225)", () => {
  it("damage is the default mode and fires a damage op", async () => {
    mockResolve([]);
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await applyDamage();

    const [, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(ops[0]).toMatchObject({ type: "damage", amount: 8 });
  });

  it("switching to Heal fires a heal op (vitality verb)", async () => {
    const user = userEvent.setup();
    mockResolve([]);
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: /heal/i }));
    await user.type(screen.getByRole("spinbutton", { name: /heal amount/i }), "5");
    await user.click(screen.getByRole("button", { name: /^heal \d+$/i }));

    const [, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(ops[0]).toEqual({ type: "heal", amount: 5 });
  });

  it("switching to Temp HP fires a setTemp op", async () => {
    const user = userEvent.setup();
    mockResolve([]);
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: /temp hp/i }));
    await user.type(screen.getByRole("spinbutton", { name: /temporary hit points/i }), "7");
    await user.click(screen.getByRole("button", { name: /grant \d+ temp hp/i }));

    const [, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(ops[0]).toEqual({ type: "setTemp", amount: 7 });
  });

  it("the stepper +/- adjusts the shared amount", async () => {
    const user = userEvent.setup();
    mockResolve([]);
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    const field = screen.getByRole("spinbutton", { name: /damage amount/i });
    await user.click(screen.getByRole("button", { name: /increase amount/i }));
    await user.click(screen.getByRole("button", { name: /increase amount/i }));
    expect(field).toHaveValue(2);
    await user.click(screen.getByRole("button", { name: /decrease amount/i }));
    expect(field).toHaveValue(1);
  });

  it("Enter submits the active mode", async () => {
    const user = userEvent.setup();
    mockResolve([]);
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: /heal/i }));
    const field = screen.getByRole("spinbutton", { name: /heal amount/i });
    await user.type(field, "4{Enter}");

    const [, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(ops[0]).toEqual({ type: "heal", amount: 4 });
  });
});

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
  it("auto-roll on (default) shows the banner and no save modal", async () => {
    mockResolve([check({ held: true, roll: 12, saveBonus: 2, total: 14, dc: 12 })]);
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await applyDamage();

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The damage op carries the auto-roll preference (default true).
    const [, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(ops[0]).toMatchObject({ type: "damage", autoRollConcentration: true });
  });

  it("turning off auto-roll defers the save and opens the roll modal", async () => {
    const user = userEvent.setup();
    mockResolve([
      check({ status: "pending", entryId: "entry-1", dc: 15, saveBonus: 2, held: null, damage: 30 }),
    ]);
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: /auto-roll concentration saves/i }));
    await applyDamage();

    // A modal opens (no inline banner / UI shift in the HP card).
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /roll save/i })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const [, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(ops[0]).toMatchObject({ type: "damage", autoRollConcentration: false });
  });

  it("rolling in the modal submits a concentrationSave op and shows the result", async () => {
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
        concentrationChecks: [check({ held: true, roll: SAVE_DIE, saveBonus: 2, total: 16, dc: 15, damage: 30 })],
      });
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: /auto-roll concentration saves/i }));
    await applyDamage();
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /roll save/i }));

    // The mocked DiceRoller fires onResult → a concentrationSave op is submitted
    // with the natural d20 (not the bonus-inclusive total).
    const secondCall = vi.mocked(client.applyHitPointOperations).mock.calls[1];
    expect(secondCall[1][0]).toEqual({
      type: "concentrationSave",
      entryId: "entry-1",
      roll: SAVE_DIE,
      damage: 30,
    });
    // The result lingers in the modal (14 + 2 = 16 vs DC 15 → holds).
    expect(within(dialog).getByText(/16 vs DC 15/)).toBeInTheDocument();
    expect(within(dialog).getByText(/holds/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /done/i })).toBeInTheDocument();
  });
});

describe("HitPointTracker damage type + resistance (#456)", () => {
  function rageCharacter(): Character {
    return {
      ...makeCharacter(),
      activeEffects: {
        buffs: [
          {
            id: "r",
            key: "rage",
            target: "meleeDamage",
            modifier: 2,
            source: "Rage",
            duration: "while-active",
            resistDamageTypes: ["bludgeoning", "piercing", "slashing"],
          },
        ],
      },
    } as unknown as Character;
  }

  it("sends an optional damage type with the damage op", async () => {
    const user = userEvent.setup();
    mockResolve([]);
    render(<HitPointTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await user.type(screen.getByRole("spinbutton", { name: /damage amount/i }), "8");
    await user.selectOptions(screen.getByRole("combobox", { name: /damage type/i }), "fire");
    await user.click(screen.getByRole("button", { name: /apply \d+ damage/i }));

    const [, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(ops[0]).toMatchObject({ type: "damage", amount: 8, damageType: "fire", applyResistance: true });
  });

  it("shows the auto-halve preview for a resisted type and applies resistance by default", async () => {
    const user = userEvent.setup();
    mockResolve([]);
    render(<HitPointTracker character={rageCharacter()} onUpdate={vi.fn()} />);

    await user.type(screen.getByRole("spinbutton", { name: /damage amount/i }), "12");
    await user.selectOptions(screen.getByRole("combobox", { name: /damage type/i }), "slashing");

    expect(screen.getByRole("status")).toHaveTextContent(/halves to 6/i);

    await user.click(screen.getByRole("button", { name: /apply \d+ damage/i }));
    const [, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(ops[0]).toMatchObject({ type: "damage", amount: 12, damageType: "slashing", applyResistance: true });
  });

  it("lets the player decline the auto-halve (manual override)", async () => {
    const user = userEvent.setup();
    mockResolve([]);
    render(<HitPointTracker character={rageCharacter()} onUpdate={vi.fn()} />);

    await user.type(screen.getByRole("spinbutton", { name: /damage amount/i }), "12");
    await user.selectOptions(screen.getByRole("combobox", { name: /damage type/i }), "slashing");
    // Uncheck the "apply resistance" toggle to take the full amount.
    await user.click(screen.getByRole("checkbox", { name: /resistant to slashing/i }));
    await user.click(screen.getByRole("button", { name: /apply \d+ damage/i }));

    const [, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(ops[0]).toMatchObject({ type: "damage", amount: 12, damageType: "slashing", applyResistance: false });
  });

  it("does not show a resistance preview for a non-matching type", async () => {
    const user = userEvent.setup();
    mockResolve([]);
    render(<HitPointTracker character={rageCharacter()} onUpdate={vi.fn()} />);

    await user.type(screen.getByRole("spinbutton", { name: /damage amount/i }), "12");
    await user.selectOptions(screen.getByRole("combobox", { name: /damage type/i }), "fire");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
