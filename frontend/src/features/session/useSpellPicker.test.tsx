import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { useSpellPicker, type UseSpellPickerOptions } from "@/features/session/useSpellPicker";
import { RollProvider } from "@/features/dice/RollContext";
import { applySpellcastingTransactions, logRoll } from "@/api/client";
import { saveDcLabel } from "@/lib/spellMeta";
import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import { CurrentCharacterProvider } from "@/hooks/CurrentCharacterProvider";
import type { Character, Spell } from "@/types/character";

vi.mock("@/api/client", () => ({
  applySpellcastingTransactions: vi.fn(),
  logRoll: vi.fn().mockResolvedValue(undefined),
}));

const mockApply = vi.mocked(applySpellcastingTransactions);
const mockLogRoll = vi.mocked(logRoll);

// #1381: effectRolls carries the served rolls the picker now looks up (rules
// resolve backend-side) — one entry per slot level a test actually casts at.
const cantrip: Spell = {
  id: "sp-cantrip", name: "Sacred Flame", level: 0, school: "evocation",
  castingTime: "1 action", range: "60 feet", duration: "Instantaneous", description: "",
  effectKind: "damage", attackType: "save", saveAbility: "dexterity",
  effectRolls: [{ slotLevel: 0, roll: { count: 1, faces: 8, modifier: 0 } }],
};
const attackSpell: Spell = {
  id: "sp-attack", name: "Chromatic Orb", level: 1, prepared: true, school: "conjuration",
  castingTime: "1 action", range: "90 feet", duration: "Instantaneous", description: "",
  effectKind: "damage", damageType: "fire", attackType: "attack",
  effectRolls: [{ slotLevel: 1, roll: { count: 3, faces: 8, modifier: 0 } }],
};
const healSpell: Spell = {
  id: "sp-heal", name: "Cure Wounds", level: 1, prepared: true, school: "evocation",
  castingTime: "1 action", range: "Touch", duration: "Instantaneous", description: "",
  effectKind: "heal",
  effectRolls: [
    { slotLevel: 1, roll: { count: 1, faces: 8, modifier: 0 } },
    { slotLevel: 2, roll: { count: 2, faces: 8, modifier: 0 } },
  ],
};
const buffSpell: Spell = {
  id: "sp-buff", name: "Mage Armor", level: 1, prepared: true, school: "abjuration",
  castingTime: "1 action", range: "Touch", duration: "8 hours", description: "",
  effectKind: "buff", buffTarget: "acUnarmoredBase", buffModifier: 13,
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
    onLogChanged: vi.fn(),
    slot: "action",
    slotAvailable: true,
    onCommitSlot: vi.fn(),
    spellCastThisTurn: {},
    castingTimeFilter: "1 action",
    onCastSettled: vi.fn(),
    ...overrides,
  };
}

// useSpellPicker needs both RollProvider (useRoll) and CurrentCharacterProvider
// (useCurrentCharacter, #1284) — renderHookWithCharacter's wrapper option can't
// compose with an extra provider, so this seeds the cache and nests both by hand.
function makeWrapper(character: Character) {
  getQueryClient().setQueryData(characterKeys.detail(character.id), character);
  return ({ children }: { children: ReactNode }) => (
    <CurrentCharacterProvider id={character.id}>
      <RollProvider>{children}</RollProvider>
    </CurrentCharacterProvider>
  );
}

function render(opts: UseSpellPickerOptions) {
  return renderHook(() => useSpellPicker(opts), { wrapper: makeWrapper(opts.character) });
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

  it("applies a heal to a picked ally's sheet via apply.target.characterId (#462)", async () => {
    const opts = makeOpts([healSpell], { allies: [{ characterId: "ally-9", name: "Grog" }] });
    const { result } = render(opts);
    act(() => result.current.patchRow("sp-heal", { target: { characterId: "ally-9", name: "Grog" } }));
    await act(async () => {
      await result.current.handleCast(healSpell);
    });
    expect(mockApply).toHaveBeenCalledWith("char-1", [
      expect.objectContaining({
        type: "castSpell",
        entryId: "sp-heal",
        apply: expect.objectContaining({ target: { characterId: "ally-9" }, kind: "heal" }),
      }),
    ]);
  });

  it("exposes opted-in allies + isHeal on a heal spell's view, and none on a damage spell", () => {
    const allies = [{ characterId: "ally-9", name: "Grog" }];
    const { result } = render(makeOpts([healSpell, attackSpell], { allies }));
    const healView = result.current.viewFor(healSpell);
    expect(healView.isHeal).toBe(true);
    expect(healView.allies).toEqual(allies);
    expect(result.current.viewFor(attackSpell).isHeal).toBe(false);
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
    await waitFor(() =>
      expect(getQueryClient().getQueryData(characterKeys.detail("char-1"))).toEqual(updatedChar),
    );
  });

  it("guards a leveled cast when all matching slots are exhausted", async () => {
    const exhausted = {
      ...makeCharacter([healSpell]),
      spellcasting: {
        ability: "intelligence", spellSaveDC: 14, spellAttackBonus: 5,
        slots: [{ level: 1, total: 2, used: 2 }], arcana: [], spells: [healSpell],
      },
    } as unknown as Character;
    const opts = makeOpts([healSpell], { character: exhausted });
    const { result } = render(opts);
    await act(async () => {
      await result.current.handleCast(healSpell);
    });
    expect(mockApply).not.toHaveBeenCalled();
    expect(opts.onCommitSlot).not.toHaveBeenCalled();
    expect(result.current.rowFor(healSpell).error).toMatch(/no spell slot available/i);
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

// #1360: a spell attack's d20 and the cast's damage roll must group as one
// swing in the combat log, mirroring useAttackRolls' swingId/verdict pattern.
describe("useSpellPicker — spell attacks carry swingId (#1360)", () => {
  it("shares one swingId between the attack roll and the cast's damage roll, verdict='crit' on a nat-20", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.95); // d20 → 20 (nat20)
    const opts = makeOpts([attackSpell]);
    const { result } = render(opts);

    act(() => result.current.handleAttackRoll(attackSpell));
    await act(async () => {
      await result.current.handleCast(attackSpell);
    });

    const calls = mockLogRoll.mock.calls.map((c) => c[2]);
    const attackEvent = calls.find((e) => e.kind === "attack")!;
    const damageEvent = calls.find((e) => e.kind === "damage")!;
    expect(attackEvent).toMatchObject({ nat20: true, nat1: false, crit: true, verdict: "crit" });
    expect(typeof attackEvent.swingId).toBe("string");
    expect(damageEvent).toMatchObject({ swingId: attackEvent.swingId, verdict: "crit", crit: true });
  });

  it("leaves verdict undefined on the attack event for a middling roll (not nat20/nat1)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d20 → 11
    const opts = makeOpts([attackSpell]);
    const { result } = render(opts);

    act(() => result.current.handleAttackRoll(attackSpell));

    const attackEvent = mockLogRoll.mock.calls.map((c) => c[2]).find((e) => e.kind === "attack")!;
    expect(attackEvent.nat20).toBe(false);
    expect(attackEvent.nat1).toBe(false);
    expect(attackEvent.verdict).toBeUndefined();
  });

  it("logs a save/no-attack cast's damage with no swingId and no verdict (unaffected path)", async () => {
    const opts = makeOpts([cantrip]);
    const { result } = render(opts);

    await act(async () => {
      await result.current.handleCast(cantrip);
    });

    const damageEvent = mockLogRoll.mock.calls.map((c) => c[2]).find((e) => e.kind === "damage")!;
    expect(damageEvent.swingId).toBeUndefined();
    expect(damageEvent.verdict).toBeUndefined();
  });

  it("mints a fresh swingId per attack+cast cycle — a second cycle never reuses the first's id", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d20 → 11 (neither nat20 nor nat1)
    const opts = makeOpts([attackSpell]);
    const { result } = render(opts);

    act(() => result.current.handleAttackRoll(attackSpell));
    await act(async () => {
      await result.current.handleCast(attackSpell);
    });
    const firstAttackId = mockLogRoll.mock.calls
      .map((c) => c[2])
      .find((e) => e.kind === "attack")!.swingId;

    mockLogRoll.mockClear();
    act(() => result.current.handleAttackRoll(attackSpell));
    await act(async () => {
      await result.current.handleCast(attackSpell);
    });
    const calls = mockLogRoll.mock.calls.map((c) => c[2]);
    const secondAttackId = calls.find((e) => e.kind === "attack")!.swingId;
    const secondDamageId = calls.find((e) => e.kind === "damage")!.swingId;

    expect(secondAttackId).not.toBe(firstAttackId);
    expect(secondDamageId).toBe(secondAttackId);
  });

  it("keeps the swingId available for a retry after a failed cast (no re-roll)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d20 → 11
    const opts = makeOpts([attackSpell]);
    const { result } = render(opts);

    act(() => result.current.handleAttackRoll(attackSpell));
    const attackId = mockLogRoll.mock.calls.map((c) => c[2]).find((e) => e.kind === "attack")!.swingId;

    mockApply.mockRejectedValueOnce(new Error("network blip"));
    await act(async () => {
      await result.current.handleCast(attackSpell);
    });
    expect(result.current.rowFor(attackSpell).error).toBeTruthy();

    mockLogRoll.mockClear();
    mockApply.mockResolvedValueOnce(updatedChar);
    await act(async () => {
      await result.current.handleCast(attackSpell);
    });

    const retryDamage = mockLogRoll.mock.calls.map((c) => c[2]).find((e) => e.kind === "damage")!;
    expect(retryDamage.swingId).toBe(attackId);
    expect(retryDamage.verdict).toBe("hit");
  });
});

// #1164: durable post-cast feedback — the result well, the log-symmetry fix
// (spell damage rolls now log like weapon rolls), and the turn-card tally hook.
describe("useSpellPicker — post-cast feedback (#1164)", () => {
  it("has no result well before any cast this sheet-open", () => {
    const { result } = render(makeOpts([cantrip]));
    expect(result.current.lastCast).toBeNull();
  });

  it("logs the cast's damage roll to the session, closing the weapon/spell asymmetry", async () => {
    const opts = makeOpts([attackSpell]);
    const { result } = render(opts);
    await act(async () => {
      await result.current.handleCast(attackSpell);
    });
    expect(mockLogRoll).toHaveBeenCalledWith(
      "char-1",
      "sess-1",
      expect.objectContaining({ kind: "damage", source: "Chromatic Orb", damageType: "fire" }),
    );
  });

  it("settles the result well with kept dice + total after a damage cast", async () => {
    const opts = makeOpts([attackSpell]);
    const { result } = render(opts);
    await act(async () => {
      await result.current.handleCast(attackSpell);
    });
    expect(result.current.lastCast).toMatchObject({
      spellId: "sp-attack",
      spellName: "Chromatic Orb",
      level: 1,
      damageType: "fire",
    });
    expect(result.current.lastCast?.total).toEqual(expect.any(Number));
    expect(result.current.lastCast?.dice.length).toBeGreaterThan(0);
  });

  it("settles a no-roll cast (buff/utility) with a null total and no dice", async () => {
    const opts = makeOpts([buffSpell]);
    const { result } = render(opts);
    await act(async () => {
      await result.current.handleCast(buffSpell);
    });
    expect(result.current.lastCast).toMatchObject({ spellId: "sp-buff", total: null, dice: [] });
  });

  it("carries the save DC to announce on a save-type cast's settle + onCastSettled", async () => {
    const opts = makeOpts([cantrip]);
    const { result } = render(opts);
    await act(async () => {
      await result.current.handleCast(cantrip);
    });
    const expectedDc = saveDcLabel(cantrip, 14);
    expect(result.current.lastCast?.announce).toBe(expectedDc);
    expect(opts.onCastSettled).toHaveBeenCalledWith(
      expect.objectContaining({ spellName: "Sacred Flame", level: 0, announce: expectedDc }),
    );
  });

  it("carries no announce on a non-save cast", async () => {
    const opts = makeOpts([healSpell]);
    const { result } = render(opts);
    await act(async () => {
      await result.current.handleCast(healSpell);
    });
    expect(result.current.lastCast?.announce).toBeNull();
    expect(opts.onCastSettled).toHaveBeenCalledWith(expect.objectContaining({ announce: undefined }));
  });
});
