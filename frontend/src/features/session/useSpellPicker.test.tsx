import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { useSpellPicker, type UseSpellPickerOptions } from "@/features/session/useSpellPicker";
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
  id: "sp-cantrip", name: "Sacred Flame", level: 0, school: "evocation",
  castingTime: "1 action", range: "60 feet", duration: "Instantaneous", description: "",
  effectKind: "damage", effectDiceCount: 1, effectDiceFaces: 8, attackType: "save",
  saveAbility: "dexterity", cantripScaling: true,
};
const attackSpell: Spell = {
  id: "sp-attack", name: "Chromatic Orb", level: 1, prepared: true, school: "conjuration",
  castingTime: "1 action", range: "90 feet", duration: "Instantaneous", description: "",
  effectKind: "damage", effectDiceCount: 3, effectDiceFaces: 8, damageType: "fire",
  attackType: "attack", upcastDicePerLevel: 1,
};
const healSpell: Spell = {
  id: "sp-heal", name: "Cure Wounds", level: 1, prepared: true, school: "evocation",
  castingTime: "1 action", range: "Touch", duration: "Instantaneous", description: "",
  effectKind: "heal", effectDiceCount: 1, effectDiceFaces: 8, upcastDicePerLevel: 1,
};

function makeCharacter(spells: Spell[]): Character {
  return {
    id: "char-1", name: "Tester", level: 1,
    abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 16, wisdom: 10, charisma: 10 },
    spellcasting: {
      ability: "intelligence", spellSaveDC: 14, spellAttackBonus: 5,
      slots: [{ level: 1, total: 2, used: 0 }, { level: 2, total: 1, used: 0 }],
      arcana: [], spells,
    },
  } as unknown as Character;
}

const updatedChar = makeCharacter([]);

function makeOpts(spells: Spell[], overrides: Partial<UseSpellPickerOptions> = {}): UseSpellPickerOptions {
  return {
    character: makeCharacter(spells),
    sessionId: "sess-1",
    onUpdate: vi.fn(),
    onLogChanged: vi.fn(),
    slot: "action",
    slotAvailable: true,
    onCommitSlot: vi.fn(),
    spellCastThisTurn: {},
    castingTimeFilter: "1 action",
    ...overrides,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => <RollProvider>{children}</RollProvider>;

function render(opts: UseSpellPickerOptions) {
  return renderHook(() => useSpellPicker(opts), { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApply.mockResolvedValue(updatedChar);
  mockLogRoll.mockResolvedValue(undefined);
  vi.spyOn(Math, "random").mockReturnValue(0);
});

describe("useSpellPicker", () => {
  it("sorts castable spells cantrips-first then by level/name", () => {
    const { result } = render(makeOpts([attackSpell, cantrip, healSpell]));
    expect(result.current.sortedSpells.map((s) => s.id)).toEqual(["sp-cantrip", "sp-attack", "sp-heal"]);
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.hasCastable).toBe(true);
  });

  it("reports the empty state when nothing is castable", () => {
    const { result } = render(makeOpts([attackSpell], { castingTimeFilter: "1 bonus action" }));
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.emptyMessage).toMatch(/No prepared spells/i);
  });

  it("surfaces the 5e restriction hint without an isEmpty early-out", () => {
    const { result } = render(
      makeOpts([healSpell], { slot: "bonusAction", spellCastThisTurn: { action: "leveled" } }),
    );
    expect(result.current.slotUsedHint).toMatch(/bonus-action spell casting is not allowed/i);
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.hasCastable).toBe(false);
  });

  it("derives a view: attack spell Cast is gated until the attack is rolled", () => {
    const { result } = render(makeOpts([attackSpell]));
    const view = result.current.viewFor(attackSpell);
    expect(view.isAttack).toBe(true);
    expect(view.castDisabled).toBe(true);
    expect(view.attackDisabled).toBe(false);
    expect(view.availableSlots).toEqual([1, 2]);
    expect(view.spellSlot).toBe(1);
  });

  it("patchRow updates the resolved slot in the view", () => {
    const { result } = render(makeOpts([healSpell]));
    act(() => result.current.patchRow("sp-heal", { slotLevel: 2 }));
    expect(result.current.viewFor(healSpell).spellSlot).toBe(2);
  });

  it("keeps a heal spell's target on 'self' after an upcast patch (regression)", () => {
    const { result } = render(makeOpts([healSpell]));
    expect(result.current.rowFor(healSpell).target).toBe("self");
    act(() => result.current.patchRow("sp-heal", { slotLevel: 2 }));
    expect(result.current.rowFor(healSpell).target).toBe("self");
  });

  it("still applies a heal to self when cast after an upcast (regression)", async () => {
    const opts = makeOpts([healSpell]);
    const { result } = render(opts);
    act(() => result.current.patchRow("sp-heal", { slotLevel: 2 }));
    await act(async () => {
      await result.current.handleCast(healSpell);
    });
    expect(mockApply).toHaveBeenCalledWith("char-1", [
      expect.objectContaining({
        type: "castSpell",
        entryId: "sp-heal",
        slotLevel: 2,
        apply: expect.objectContaining({ target: "self", kind: "heal" }),
      }),
    ]);
  });

  it("handleCast fires the op, commits the slot, and refreshes", async () => {
    const opts = makeOpts([cantrip]);
    const { result } = render(opts);
    await act(async () => {
      await result.current.handleCast(cantrip);
    });
    expect(mockApply).toHaveBeenCalledWith("char-1", [
      expect.objectContaining({ type: "castSpell", entryId: "sp-cantrip" }),
    ]);
    expect(opts.onCommitSlot).toHaveBeenCalledWith(0);
    await waitFor(() => expect(opts.onUpdate).toHaveBeenCalledWith(updatedChar));
  });

  it("handleAttackRoll commits the slot, logs the roll, and enables Cast", () => {
    const opts = makeOpts([attackSpell]);
    const { result } = render(opts);
    act(() => result.current.handleAttackRoll(attackSpell));
    expect(opts.onCommitSlot).toHaveBeenCalledWith(1);
    expect(mockLogRoll).toHaveBeenCalled();
    expect(result.current.viewFor(attackSpell).castDisabled).toBe(false);
  });
});
