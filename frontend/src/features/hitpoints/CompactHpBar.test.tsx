import { type ReactElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CompactHpBar from "@/features/hitpoints/CompactHpBar";
import { RollProvider } from "@/features/dice/RollContext";
import { axe } from "@/test/axe";
import * as client from "@/api/client";
import type { Character, ConcentrationCheck } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyHitPointOperations: vi.fn(),
  logRoll: vi.fn().mockResolvedValue(undefined),
}));

// The sheet may host the concentration-save modal, which reads useRoll().
function render(ui: ReactElement) {
  return rtlRender(<RollProvider>{ui}</RollProvider>);
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    hitPoints: { current: 20, max: 22, temp: 3, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 2, die: "d10", spent: 0 },
    abilityScores: {
      strength: 10, dexterity: 10, constitution: 14,
      intelligence: 10, wisdom: 10, charisma: 10,
    },
    pendingLevelUps: 0,
    advancementSlots: { total: 0, used: 0 },
    spellcasting: {
      ability: "intelligence", spellSaveDC: 13, spellAttackBonus: 5,
      slots: [], spells: [], concentratingOn: null,
    },
    ...overrides,
  } as unknown as Character;
}

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
    damage: 7,
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("CompactHpBar read-only strip (regression pin)", () => {
  it("renders current/max and the temp badge when closed", () => {
    render(<CompactHpBar character={makeCharacter()} onUpdate={vi.fn()} />);

    // The button is the strip; its content shows the read-only numbers.
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText(/\/ 22/)).toBeInTheDocument();
    expect(screen.getByText(/\+3 temp/i)).toBeInTheDocument();
    // No sheet until tapped.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("exposes the strip as a button named 'Manage hit points'", () => {
    render(<CompactHpBar character={makeCharacter()} onUpdate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /manage hit points/i })).toBeInTheDocument();
  });
});

describe("CompactHpBar tap-to-manage sheet (#768)", () => {
  it("tapping the bar opens the 'Hit Points' sheet", async () => {
    const user = userEvent.setup();
    render(<CompactHpBar character={makeCharacter()} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /manage hit points/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: /hit points/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /damage/i })).toBeInTheDocument();
  });

  it("applying 7 damage sends a damage op and swaps the character", async () => {
    const user = userEvent.setup();
    const updated = makeCharacter({
      hitPoints: { current: 13, max: 22, temp: 3, deathSaves: { successes: 0, failures: 0 } },
    } as Partial<Character>);
    vi.mocked(client.applyHitPointOperations).mockResolvedValue({
      character: updated,
      concentrationChecks: [],
    });
    const onUpdate = vi.fn();
    render(<CompactHpBar character={makeCharacter()} onUpdate={onUpdate} />);

    await user.click(screen.getByRole("button", { name: /manage hit points/i }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("spinbutton", { name: /damage amount/i }), "7");
    await user.click(within(dialog).getByRole("button", { name: /apply \d+ damage/i }));

    const [id, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(id).toBe("char-1");
    expect(ops[0]).toMatchObject({ type: "damage", amount: 7 });
    expect(onUpdate).toHaveBeenCalledWith(updated);
  });

  it("surfaces a concentration check from sheet damage like the Rest tab", async () => {
    const user = userEvent.setup();
    vi.mocked(client.applyHitPointOperations).mockResolvedValue({
      character: makeCharacter(),
      concentrationChecks: [check({ held: true, roll: 12, saveBonus: 2, total: 14, dc: 12 })],
    });
    render(<CompactHpBar character={makeCharacter()} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /manage hit points/i }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("spinbutton", { name: /damage amount/i }), "7");
    await user.click(within(dialog).getByRole("button", { name: /apply \d+ damage/i }));

    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent(/14 vs DC 12/);
    expect(note).toHaveTextContent(/held/i);
    expect(note).toHaveTextContent("Bless");
  });

  it("has no axe violations with the sheet open", async () => {
    const user = userEvent.setup();
    const { container } = render(<CompactHpBar character={makeCharacter()} onUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /manage hit points/i }));
    await screen.findByRole("dialog");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("CompactHpBar mobile overflow guard (#827)", () => {
  it("keeps the tap hint on one line so it can't wrap and squeeze the bar", () => {
    render(<CompactHpBar character={makeCharacter()} onUpdate={vi.fn()} />);
    const hint = screen.getByText(/^tap$/i);
    expect(hint.className).toMatch(/whitespace-nowrap/);
    expect(hint.className).toMatch(/sm:hidden/);
  });

  it("lets the Hit Points label truncate instead of forcing width", () => {
    render(<CompactHpBar character={makeCharacter()} onUpdate={vi.fn()} />);
    expect(screen.getByText(/hit points/i).className).toMatch(/truncate/);
  });

  it("narrows the meter on mobile but restores full width at md+", () => {
    const { container } = render(<CompactHpBar character={makeCharacter()} onUpdate={vi.fn()} />);
    const meter = container.querySelector(".sm\\:w-32");
    expect(meter).not.toBeNull();
    expect(meter?.className).toMatch(/\bw-20\b/);
  });
});
