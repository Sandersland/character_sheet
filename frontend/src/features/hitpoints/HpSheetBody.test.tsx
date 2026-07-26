import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HpSheetBody from "@/features/hitpoints/HpSheetBody";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import * as client from "@/api/client";
import type { Character, ConcentrationCheck } from "@/types/character";

// Mirrors HitPointTracker's client mock — HpSheetBody shares useHitPointApply.
vi.mock("@/api/client", () => ({
  applyHitPointOperations: vi.fn(),
  logRoll: vi.fn().mockResolvedValue(undefined),
}));

function render(character: Character) {
  return renderWithCharacter(<HpSheetBody />, character);
}

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
  const damageInput = screen.getByRole("spinbutton", { name: /damage amount/i });
  await user.type(damageInput, "8");
  await user.click(screen.getByRole("button", { name: /apply \d+ damage/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// #1166: the checkbox is retired from this surface too — the standing
// preference (useAutoRollConcentrationPref) drives the damage op instead.
describe("HpSheetBody standing concentration preference (#1166)", () => {
  it("renders no auto-roll-concentration checkbox", () => {
    mockResolve([]);
    render(makeCharacter());
    expect(
      screen.queryByRole("checkbox", { name: /auto-roll concentration saves/i }),
    ).not.toBeInTheDocument();
  });

  it("defaults to auto-roll on (no stored preference)", async () => {
    mockResolve([]);
    render(makeCharacter());

    await applyDamage();

    const [, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(ops[0]).toMatchObject({ type: "damage", autoRollConcentration: true });
  });

  it("honors a stored 'off' preference with no per-surface UI", async () => {
    localStorage.setItem("cs:pref:autoRollConcentration", "false");
    mockResolve([]);
    render(makeCharacter());

    await applyDamage();

    const [, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(ops[0]).toMatchObject({ type: "damage", autoRollConcentration: false });
  });
});
