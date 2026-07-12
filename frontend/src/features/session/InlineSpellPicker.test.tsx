import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineSpellPicker from "@/features/session/InlineSpellPicker";
import { RollProvider } from "@/features/dice/RollContext";
import { applySpellcastingTransactions, logRoll } from "@/api/client";
import type { Character, Spell } from "@/types/character";

vi.mock("@/api/client", () => ({
  applySpellcastingTransactions: vi.fn(),
  logRoll: vi.fn().mockResolvedValue(undefined),
}));

const mockApply = vi.mocked(applySpellcastingTransactions);
const mockLogRoll = vi.mocked(logRoll);

const cantrip: Spell = {
  id: "sp-cantrip",
  name: "Sacred Flame",
  level: 0,
  school: "evocation",
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  description: "",
  effectKind: "damage",
  effectDiceCount: 1,
  effectDiceFaces: 8,
  damageType: "radiant",
  attackType: "save",
  saveAbility: "dexterity",
  cantripScaling: true,
};

const attackSpell: Spell = {
  id: "sp-attack",
  name: "Chromatic Orb",
  level: 1,
  prepared: true,
  school: "conjuration",
  castingTime: "1 action",
  range: "90 feet",
  duration: "Instantaneous",
  description: "",
  effectKind: "damage",
  effectDiceCount: 3,
  effectDiceFaces: 8,
  damageType: "fire",
  attackType: "attack",
  upcastDicePerLevel: 1,
};

const healSpell: Spell = {
  id: "sp-heal",
  name: "Cure Wounds",
  level: 1,
  prepared: true,
  school: "evocation",
  castingTime: "1 action",
  range: "Touch",
  duration: "Instantaneous",
  description: "",
  effectKind: "heal",
  effectDiceCount: 1,
  effectDiceFaces: 8,
  upcastDicePerLevel: 1,
};

const ALL_SPELLS = [cantrip, attackSpell, healSpell];

function makeCharacter(spells: Spell[] = ALL_SPELLS): Character {
  return {
    id: "char-1",
    name: "Tester",
    level: 1,
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 16,
      wisdom: 10,
      charisma: 10,
    },
    spellcasting: {
      ability: "intelligence",
      spellSaveDC: 14,
      spellAttackBonus: 5,
      slots: [
        { level: 1, total: 2, used: 0 },
        { level: 2, total: 1, used: 0 },
      ],
      arcana: [],
      spells,
    },
  } as unknown as Character;
}

const updatedChar = makeCharacter();

interface Spies {
  onUpdate: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
  onLogChanged: ReturnType<typeof vi.fn>;
  onCommitSlot: ReturnType<typeof vi.fn>;
}

function renderPicker(
  character: Character,
  opts: { castingTimeFilter?: string; slotAvailable?: boolean; focusSpellId?: string } = {},
): Spies {
  const spies: Spies = {
    onUpdate: vi.fn(),
    onClose: vi.fn(),
    onLogChanged: vi.fn(),
    onCommitSlot: vi.fn(),
  };
  render(
    <RollProvider>
      <InlineSpellPicker
        character={character}
        sessionId="sess-1"
        onUpdate={spies.onUpdate}
        onClose={spies.onClose}
        onLogChanged={spies.onLogChanged}
        slot="action"
        slotAvailable={opts.slotAvailable ?? true}
        onCommitSlot={spies.onCommitSlot}
        spellCastThisTurn={{}}
        allies={[]}
        castingTimeFilter={opts.castingTimeFilter ?? "1 action"}
        focusSpellId={opts.focusSpellId}
      />
    </RollProvider>,
  );
  return spies;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApply.mockResolvedValue(updatedChar);
  mockLogRoll.mockResolvedValue(undefined);
  vi.spyOn(Math, "random").mockReturnValue(0);
});

describe("InlineSpellPicker — characterization", () => {
  it("renders every castable spell", () => {
    renderPicker(makeCharacter());
    expect(screen.getByText("Sacred Flame")).toBeInTheDocument();
    expect(screen.getByText("Chromatic Orb")).toBeInTheDocument();
    expect(screen.getByText("Cure Wounds")).toBeInTheDocument();
  });

  it("shows the empty state when the casting-time filter matches nothing", () => {
    renderPicker(makeCharacter(), { castingTimeFilter: "1 bonus action" });
    expect(screen.getByText(/No prepared spells available to cast right now/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("casts a save cantrip: fires the op, commits the slot at level 0, refreshes", async () => {
    const spies = renderPicker(makeCharacter([cantrip]));

    await userEvent.click(screen.getByRole("button", { name: /^Cast/ }));

    expect(mockApply).toHaveBeenCalledWith("char-1", [
      expect.objectContaining({ type: "castSpell", entryId: "sp-cantrip" }),
    ]);
    expect(spies.onCommitSlot).toHaveBeenCalledWith(0);
    await waitFor(() => expect(spies.onUpdate).toHaveBeenCalledWith(updatedChar));
  });

  it("upcasts a leveled spell at the chosen slot level", async () => {
    renderPicker(makeCharacter([healSpell]));

    await userEvent.click(screen.getByRole("button", { name: /^L2/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Cast/ }));

    expect(mockApply).toHaveBeenCalledWith("char-1", [
      expect.objectContaining({ type: "castSpell", entryId: "sp-heal", slotLevel: 2 }),
    ]);
  });

  it("self-targeted heal passes an apply payload to the backend", async () => {
    const spies = renderPicker(makeCharacter([healSpell]));

    await userEvent.click(screen.getByRole("button", { name: /^Cast/ }));

    expect(mockApply).toHaveBeenCalledWith("char-1", [
      expect.objectContaining({
        type: "castSpell",
        entryId: "sp-heal",
        slotLevel: 1,
        apply: expect.objectContaining({ target: "self", kind: "heal", amount: expect.any(Number) }),
      }),
    ]);
    expect(spies.onCommitSlot).toHaveBeenCalledWith(1);
  });

  it("attack spell is a two-step: Attack commits the slot + logs, then Cast fires the op without re-committing", async () => {
    const spies = renderPicker(makeCharacter([attackSpell]));

    // Cast is gated until the attack is rolled.
    expect(screen.getByRole("button", { name: /^Cast/ })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /^Attack/ }));

    expect(spies.onCommitSlot).toHaveBeenCalledTimes(1);
    expect(spies.onCommitSlot).toHaveBeenCalledWith(1);
    expect(mockLogRoll).toHaveBeenCalled();

    const castBtn = screen.getByRole("button", { name: /^Cast/ });
    expect(castBtn).toBeEnabled();
    await userEvent.click(castBtn);

    expect(mockApply).toHaveBeenCalledWith("char-1", [
      expect.objectContaining({ type: "castSpell", entryId: "sp-attack", slotLevel: 1 }),
    ]);
    // Slot must not be committed a second time on cast.
    expect(spies.onCommitSlot).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(spies.onUpdate).toHaveBeenCalledWith(updatedChar));
  });

  it("Done closes the panel", async () => {
    const spies = renderPicker(makeCharacter());
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(spies.onClose).toHaveBeenCalled();
  });
});

describe("InlineSpellPicker — level sections", () => {
  it("groups spells under level headers with slot pips (sr-only, never color-only)", () => {
    renderPicker(makeCharacter());

    expect(screen.getByText("Cantrips · at will")).toBeInTheDocument();
    expect(screen.getByText("Level 1")).toBeInTheDocument();
    // Level-1 fixture: 2 of 2 slots remaining.
    expect(screen.getByText("2 of 2 slots remaining")).toBeInTheDocument();
    // No Level-2 spells prepared → no Level 2 section despite the L2 slot.
    expect(screen.queryByText("Level 2")).not.toBeInTheDocument();
  });

  it("hides levels with no affordable slot and explains via the footer note", () => {
    const spiritualWeapon: Spell = {
      id: "sp-sw",
      name: "Spiritual Weapon",
      level: 2,
      prepared: true,
      school: "evocation",
      castingTime: "1 action",
      range: "60 feet",
      duration: "1 minute",
      description: "",
    };
    const character = makeCharacter([healSpell, spiritualWeapon]);
    character.spellcasting!.slots = [{ level: 1, total: 2, used: 0 }];

    renderPicker(character);

    expect(screen.queryByText("Spiritual Weapon")).not.toBeInTheDocument();
    expect(screen.getByText("Level 2+ hidden — no slots remaining")).toBeInTheDocument();
  });
});

describe("InlineSpellPicker — focusSpellId pre-selection", () => {
  it("renders only the focused spell with a Show-all escape hatch", async () => {
    renderPicker(makeCharacter(), { focusSpellId: "sp-heal" });

    expect(screen.getByText("Cure Wounds")).toBeInTheDocument();
    expect(screen.queryByText("Sacred Flame")).not.toBeInTheDocument();
    expect(screen.queryByText("Chromatic Orb")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show all spells" }));

    expect(screen.getByText("Sacred Flame")).toBeInTheDocument();
    expect(screen.getByText("Chromatic Orb")).toBeInTheDocument();
    expect(screen.getByText("Cure Wounds")).toBeInTheDocument();
  });

  it("falls back to the full list when the focused spell is not castable", () => {
    renderPicker(makeCharacter(), { focusSpellId: "sp-unknown" });

    expect(screen.getByText("Sacred Flame")).toBeInTheDocument();
    expect(screen.getByText("Cure Wounds")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show all spells" })).not.toBeInTheDocument();
  });
});
