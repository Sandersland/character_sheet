import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HitPointTracker from "@/features/hitpoints/HitPointTracker";
import * as client from "@/api/client";
import type { Character, ConcentrationCheck } from "@/types/character";

// Mock the API client — HitPointTracker batches HP ops and swaps the returned
// character via onUpdate, then toasts any concentration check (issue #41).
vi.mock("@/api/client", () => ({
  applyHitPointOperations: vi.fn(),
}));

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
});

describe("HitPointTracker concentration toast (issue #41)", () => {
  it("toasts a held concentration save", async () => {
    mockResolve([
      { spellName: "Bless", reason: "damage", held: true, roll: 12, saveBonus: 2, total: 14, dc: 12, damage: 8 },
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
      { spellName: "Bless", reason: "damage", held: false, roll: 3, saveBonus: 2, total: 5, dc: 12, damage: 8 },
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
      { spellName: "Bless", reason: "death", held: false, roll: null, saveBonus: null, total: null, dc: null, damage: 999 },
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
