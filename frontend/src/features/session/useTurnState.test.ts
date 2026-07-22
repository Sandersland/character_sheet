/**
 * Unit tests for useTurnState.
 *
 * Establishes the first renderHook test in the repo. jsdom provides a real
 * localStorage; we clear it in beforeEach to isolate each test.
 *
 * All state-mutating calls must be wrapped in act() so React can flush updates
 * before we assert on result.current.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useTurnState } from "@/features/session/useTurnState";
import type { EconomySnapshot } from "@/features/session/useTurnState";
import type { Character, InventoryItem } from "@/types/character";

// Minimal character fixture: useTurnState reads only inventory + the server-derived attacksPerAction.
// Cast to avoid satisfying the full ~50-field Character interface.

function makeCharacter(
  overrides: Partial<Pick<Character, "attacksPerAction" | "inventory">> = {},
): Character {
  return {
    attacksPerAction: 1,
    inventory: [],
    advancements: [],
    ...overrides,
  } as unknown as Character;
}

/** Minimal InventoryItem shape for a light weapon (TWF eligible). */
function lightWeapon(id: string): InventoryItem {
  return {
    id,
    name: "Shortsword",
    category: "weapon",
    quantity: 1,
    equipped: true,
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 6,
      damageType: "piercing",
      light: true,
      finesse: true,
      proficient: false,
      attackBonus: 0,
      damageModifier: 0,
    },
  } as unknown as InventoryItem;
}

/** A non-light (not TWF-eligible without the style) equipped weapon. */
function heavyWeapon(id: string): InventoryItem {
  return {
    id,
    name: "Longsword",
    category: "weapon",
    quantity: 1,
    equipped: true,
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageType: "slashing",
      light: false,
      finesse: false,
      proficient: true,
      attackBonus: 0,
      damageModifier: 0,
    },
  } as unknown as InventoryItem;
}

const SESSION_ID = "test-session-abc";

beforeEach(() => {
  localStorage.clear();
});

describe("combat lifecycle", () => {
  it("initial state: not in combat, round 0, idle phase", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));

    expect(result.current.inCombat).toBe(false);
    expect(result.current.round).toBe(0);
    expect(result.current.phase).toBe("idle");
    expect(result.current.actionsRemaining).toBe(0);
  });

  it("startCombat → inCombat:true, round:1, phase:idle, actionsRemaining:0", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));

    act(() => { result.current.startCombat(); });

    expect(result.current.inCombat).toBe(true);
    expect(result.current.round).toBe(1);
    expect(result.current.phase).toBe("idle");
    expect(result.current.actionsRemaining).toBe(0);
    expect(result.current.bonusActionUsed).toBe(false);
    expect(result.current.reactionUsed).toBe(false);
  });

  it("startTurn → phase:active, actionsRemaining:1, resets bonus+reaction", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));

    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });

    expect(result.current.phase).toBe("active");
    expect(result.current.actionsRemaining).toBe(1);
    expect(result.current.bonusActionUsed).toBe(false);
    expect(result.current.reactionUsed).toBe(false);
  });

  it("twfAvailable is true when inventory has two light weapons", () => {
    const character = makeCharacter({ inventory: [lightWeapon("w1"), lightWeapon("w2")] });
    const { result } = renderHook(() => useTurnState(character, SESSION_ID));

    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });

    expect(result.current.twfAvailable).toBe(true);
  });

  it("twfAvailable is false with empty inventory", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));

    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });

    expect(result.current.twfAvailable).toBe(false);
  });

  it("twfAvailable updates LIVE when the loadout changes mid-turn — no new startTurn (#733)", () => {
    const oneWeapon = makeCharacter({ inventory: [lightWeapon("w1")] });
    const twoWeapons = makeCharacter({ inventory: [lightWeapon("w1"), lightWeapon("w2")] });
    const { result, rerender } = renderHook(({ c }) => useTurnState(c, SESSION_ID), {
      initialProps: { c: oneWeapon },
    });

    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    expect(result.current.twfAvailable).toBe(false); // one weapon → no off-hand

    rerender({ c: twoWeapons }); // swap a second light weapon in mid-turn
    expect(result.current.twfAvailable).toBe(true); // derived → updates without startTurn
  });

  it("twfAvailable is true for a non-light pair WITH the Two-Weapon Fighting feat (#1137)", () => {
    const heavyPair = makeCharacter({ inventory: [heavyWeapon("h1"), heavyWeapon("h2")] });
    const withStyle = {
      ...heavyPair,
      advancements: [
        { id: "fs1", slot: "fightingStyle", improvements: [{ target: "offhandAbilityDamage", amount: 1 }] },
      ],
    } as unknown as Character;
    const { result } = renderHook(() => useTurnState(withStyle, SESSION_ID));

    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });

    expect(result.current.twfAvailable).toBe(true);
  });

  it("twfAvailable is false for a non-light pair WITHOUT the style", () => {
    const character = makeCharacter({ inventory: [heavyWeapon("h1"), heavyWeapon("h2")] });
    const { result } = renderHook(() => useTurnState(character, SESSION_ID));

    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });

    expect(result.current.twfAvailable).toBe(false);
  });

  it("endTurn while in combat: phase=idle, actionsRemaining=0, round incremented, reactionUsed NOT reset", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));

    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.consumeReaction(); }); // set reaction before ending turn

    act(() => { result.current.endTurn(); });

    expect(result.current.phase).toBe("idle");
    expect(result.current.actionsRemaining).toBe(0);
    expect(result.current.round).toBe(2); // round 1 → 2
    // reactionUsed persists across turns — only resets on the NEXT startTurn.
    expect(result.current.reactionUsed).toBe(true);
  });

  it("endCombat → back to initial state (inCombat:false, round:0)", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));

    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.endCombat(); });

    expect(result.current.inCombat).toBe(false);
    expect(result.current.round).toBe(0);
    expect(result.current.phase).toBe("idle");
    expect(result.current.actionsRemaining).toBe(0);
  });
});

describe("action slot consumption", () => {
  function inActiveTurn(character = makeCharacter()) {
    const hook = renderHook(() => useTurnState(character, SESSION_ID));
    act(() => { hook.result.current.startCombat(); });
    act(() => { hook.result.current.startTurn(); });
    return hook;
  }

  it("consumeAction decrements actionsRemaining by 1", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeAction(); });
    expect(result.current.actionsRemaining).toBe(0);
  });

  it("consumeAction is a no-op at 0 (guard)", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeAction(); }); // 1 → 0
    act(() => { result.current.consumeAction(); }); // no-op at 0
    expect(result.current.actionsRemaining).toBe(0);
  });

  it("grantExtraAction (Action Surge) increments actionsRemaining", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.grantExtraAction(); });
    expect(result.current.actionsRemaining).toBe(2);
  });

  it("refundAction returns a spent action (loadout-swap refund, #733)", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeAction(); }); // spend on a swap → 0
    expect(result.current.actionsRemaining).toBe(0);
    act(() => { result.current.refundAction(); }); // refund → 1
    expect(result.current.actionsRemaining).toBe(1);
  });
});

describe("interaction budget (#1165)", () => {
  function inActiveTurn(character = makeCharacter({ attacksPerAction: 2 })) {
    const hook = renderHook(() => useTurnState(character, SESSION_ID));
    act(() => { hook.result.current.startCombat(); });
    act(() => { hook.result.current.startTurn(); });
    return hook;
  }

  it("starts a turn with no earned credits and the free interaction unspent", () => {
    const { result } = inActiveTurn();
    expect(result.current.attackEquipCredits).toBe(0);
    expect(result.current.freeInteractionUsed).toBe(false);
  });

  it("recordAttack earns one equip/unequip credit per genuine new attack", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.enterAttackMode(); });
    act(() => { result.current.recordAttack(); });
    expect(result.current.attackEquipCredits).toBe(1);
    act(() => { result.current.recordAttack(); });
    expect(result.current.attackEquipCredits).toBe(2);
    // Clamped over-click records no new attack → no extra credit.
    act(() => { result.current.recordAttack(); });
    expect(result.current.attackEquipCredits).toBe(2);
  });

  it("spendInteractionBudget consumes attack credits and/or the free interaction", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.enterAttackMode(); });
    act(() => { result.current.recordAttack(); });
    expect(result.current.attackEquipCredits).toBe(1);

    act(() => {
      result.current.spendInteractionBudget({ fromAttackCredits: 1, usedFreeInteraction: true });
    });
    expect(result.current.attackEquipCredits).toBe(0);
    expect(result.current.freeInteractionUsed).toBe(true);
  });

  it("refundInteractionBudget reverses a spend", () => {
    const { result } = inActiveTurn();
    act(() => {
      result.current.spendInteractionBudget({ fromAttackCredits: 0, usedFreeInteraction: true });
    });
    expect(result.current.freeInteractionUsed).toBe(true);

    act(() => {
      result.current.refundInteractionBudget({ fromAttackCredits: 0, usedFreeInteraction: true });
    });
    expect(result.current.freeInteractionUsed).toBe(false);
  });

  it("resets both fields at startTurn and at endTurn", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.enterAttackMode(); });
    act(() => { result.current.recordAttack(); });
    act(() => {
      result.current.spendInteractionBudget({ fromAttackCredits: 0, usedFreeInteraction: true });
    });
    expect(result.current.freeInteractionUsed).toBe(true);
    expect(result.current.attackEquipCredits).toBe(1);

    act(() => { result.current.endTurn(); });
    expect(result.current.freeInteractionUsed).toBe(false);
    expect(result.current.attackEquipCredits).toBe(0);

    act(() => { result.current.startTurn(); });
    expect(result.current.freeInteractionUsed).toBe(false);
    expect(result.current.attackEquipCredits).toBe(0);
  });
});

describe("attack mode flow", () => {
  it("enterAttackMode spends an action and sets attack state (attacksPerAction 2 → total 2)", () => {
    const character = makeCharacter({ attacksPerAction: 2 });
    const { result } = renderHook(() => useTurnState(character, SESSION_ID));

    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.enterAttackMode(); });

    expect(result.current.actionsRemaining).toBe(0);
    expect(result.current.attack).toEqual({ total: 2, used: 0 });
  });

  it("attack-sheet cantrip cast (grantExtraAction + commitActionSpell) nets to no double-spend (#734)", () => {
    // Action Surge: 2 actions. Enter attack mode (spends 1 → 1 remaining), then
    // cast a cantrip from the sheet — the grant-then-commit combo must NOT burn
    // the second action.
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.grantExtraAction(); }); // Action Surge → 2
    act(() => { result.current.enterAttackMode(); });   // → 1, attack set
    expect(result.current.actionsRemaining).toBe(1);

    act(() => { result.current.grantExtraAction(); result.current.commitActionSpell(0); });
    expect(result.current.actionsRemaining).toBe(1); // +1 then −1 → unchanged
    expect(result.current.attack).toBeNull();
    expect(result.current.spellCastThisTurn.action).toBe("cantrip");
  });

  it("enterAttackMode is a no-op when actionsRemaining is 0", () => {
    const character = makeCharacter({ attacksPerAction: 2 });
    const { result } = renderHook(() => useTurnState(character, SESSION_ID));

    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.consumeAction(); }); // spend the action first

    act(() => { result.current.enterAttackMode(); }); // should be no-op
    expect(result.current.attack).toBeNull();
  });

  it("recordAttack increments used, clamps at total", () => {
    const character = makeCharacter({ attacksPerAction: 2 }); // total 2
    const { result } = renderHook(() => useTurnState(character, SESSION_ID));

    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.enterAttackMode(); });

    act(() => { result.current.recordAttack(); });
    expect(result.current.attack?.used).toBe(1);

    act(() => { result.current.recordAttack(); });
    expect(result.current.attack?.used).toBe(2);

    // Clamped at total (2).
    act(() => { result.current.recordAttack(); });
    expect(result.current.attack?.used).toBe(2);
  });

  it("cancelAttack refunds the action when no attacks rolled yet", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));

    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.enterAttackMode(); });
    expect(result.current.actionsRemaining).toBe(0);

    act(() => { result.current.cancelAttack(); });
    expect(result.current.actionsRemaining).toBe(1); // refunded
    expect(result.current.attack).toBeNull();
  });

  it("cancelAttack does NOT refund if any attacks were rolled", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));

    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.enterAttackMode(); });
    act(() => { result.current.recordAttack(); });

    act(() => { result.current.cancelAttack(); }); // used=1 → no refund
    expect(result.current.actionsRemaining).toBe(0);
    expect(result.current.attack?.used).toBe(1); // state unchanged
  });

  it("finishAttack clears attack state without refunding the action", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));

    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.enterAttackMode(); });

    act(() => { result.current.finishAttack(); });
    expect(result.current.attack).toBeNull();
    expect(result.current.actionsRemaining).toBe(0); // action stays spent
  });
});

// Attack tally (#802).
describe("attack tally", () => {
  function inAttack(attacksPerAction = 2) {
    const hook = renderHook(() => useTurnState(makeCharacter({ attacksPerAction }), SESSION_ID));
    act(() => { hook.result.current.startCombat(); });
    act(() => { hook.result.current.startTurn(); });
    act(() => { hook.result.current.enterAttackMode(); });
    return hook;
  }

  function recorded(overrides: Partial<{ formId: string; formName: string; total: number; keptFace: number; nat20: boolean; nat1: boolean }> = {}) {
    const { formId = "w1", formName = "Longsword", total = 17, keptFace = 14, nat20 = false, nat1 = false } = overrides;
    return { formId, formName, attack: { total, keptFace, nat20, nat1 } };
  }

  it("recordAttack with a payload appends a tally row", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded()); });
    expect(result.current.attackTally).toHaveLength(1);
    expect(result.current.attackTally[0]).toMatchObject({ formId: "w1", formName: "Longsword" });
    expect(result.current.attack?.used).toBe(1);
  });

  it("recordAttack without a payload increments the counter but appends no row", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(); });
    expect(result.current.attack?.used).toBe(1);
    expect(result.current.attackTally).toHaveLength(0);
  });

  it("a clamped over-click (used already at total) does not append a phantom row", () => {
    const { result } = inAttack(1); // single attack
    act(() => { result.current.recordAttack(recorded()); });
    act(() => { result.current.recordAttack(recorded()); }); // over-click
    expect(result.current.attack?.used).toBe(1);
    expect(result.current.attackTally).toHaveLength(1);
  });

  it("auto-verdict: nat 20 → crit, nat 1 → miss, else unset", () => {
    const { result } = inAttack(3);
    act(() => { result.current.recordAttack(recorded({ nat20: true })); });
    act(() => { result.current.recordAttack(recorded({ nat1: true })); });
    act(() => { result.current.recordAttack(recorded()); });
    expect(result.current.attackTally[0].verdict).toBe("crit");
    expect(result.current.attackTally[1].verdict).toBe("miss");
    expect(result.current.attackTally[2].verdict).toBeUndefined();
  });

  it("setTallyDamage replaces a row's damage by id — never double-counts on re-roll", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded()); });
    const id = result.current.attackTally[0].id;
    act(() => { result.current.setTallyDamage(id, 9); });
    expect(result.current.attackTally[0].damage).toBe(9);
    act(() => { result.current.setTallyDamage(id, 13); }); // re-roll
    expect(result.current.attackTally[0].damage).toBe(13);
  });

  it("setTallyDamage targets the row named by id, not 'the last row' (#813)", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded({ formId: "a" })); });
    const idA = result.current.attackTally[0].id;
    act(() => { result.current.recordAttack(recorded({ formId: "b" })); });
    const idB = result.current.attackTally[1].id;
    // Write the EARLIER row after the later one exists — the id keeps it correct.
    act(() => { result.current.setTallyDamage(idB, 8); });
    act(() => { result.current.setTallyDamage(idA, 5); });
    expect(result.current.attackTally.map((r) => r.damage)).toEqual([5, 8]);
  });

  it("setTallyDamage no-ops on an unknown row id", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded()); });
    act(() => { result.current.setTallyDamage("nope", 9); });
    expect(result.current.attackTally[0].damage).toBeUndefined();
  });

  it("a tally refinement (setTallyDamage) pushes no new undo snapshot (#967)", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded()); });
    const historyLen = result.current.history.length;
    const id = result.current.attackTally[0].id;
    // The refinement writes directly — undoing the parent recordAttack drops the
    // whole row, so the damage write is never independently undoable.
    act(() => { result.current.setTallyDamage(id, 9); });
    expect(result.current.history).toHaveLength(historyLen);
  });

  it("setTallyAttackTotal overrides a row's to-hit total by id, preserving nat flags + verdict", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded({ total: 14, keptFace: 12 })); });
    const id = result.current.attackTally[0].id;
    act(() => { result.current.setTallyAttackTotal(id, 19); }); // +5 superiority die
    expect(result.current.attackTally[0].attack.total).toBe(19);
    // The kept-d20 face + nat flags decide the verdict — they must not move.
    expect(result.current.attackTally[0].attack.keptFace).toBe(12);
    expect(result.current.attackTally[0].attack.nat20).toBe(false);
    expect(result.current.attackTally[0].attack.nat1).toBe(false);
  });

  it("setTallyAttackTotal does not convert a nat-1 miss (verdict reads the face, not the total)", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded({ total: 1, keptFace: 1, nat1: true })); });
    const id = result.current.attackTally[0].id;
    expect(result.current.attackTally[0].verdict).toBe("miss");
    act(() => { result.current.setTallyAttackTotal(id, 6); }); // die added to a nat-1
    expect(result.current.attackTally[0].attack.total).toBe(6);
    expect(result.current.attackTally[0].attack.nat1).toBe(true);
    expect(result.current.attackTally[0].verdict).toBe("miss"); // still a miss
  });

  it("setTallyAttackTotal targets the named row and no-ops on an empty tally", () => {
    const { result } = inAttack();
    act(() => { result.current.setTallyAttackTotal("x", 19); }); // empty → no-op
    expect(result.current.attackTally).toHaveLength(0);
    act(() => { result.current.recordAttack(recorded({ formId: "a", total: 10 })); });
    act(() => { result.current.recordAttack(recorded({ formId: "b", total: 12 })); });
    const idB = result.current.attackTally[1].id;
    act(() => { result.current.setTallyAttackTotal(idB, 17); });
    expect(result.current.attackTally.map((r) => r.attack.total)).toEqual([10, 17]);
  });

  it("addTallyDamageRider folds into the named row's slot", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded()); });
    const id = result.current.attackTally[0].id;
    act(() => { result.current.setTallyDamage(id, 9); });
    act(() => { result.current.addTallyDamageRider(id, 4); });
    expect(result.current.attackTally[0].damage).toBe(13);
  });

  it("setTallyVerdict writes a manual row's verdict directly (#811)", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded()); });
    act(() => { result.current.setTallyVerdict(0, "hit"); });
    expect(result.current.attackTally[0].verdict).toBe("hit");
    act(() => { result.current.setTallyVerdict(0, "crit"); });
    expect(result.current.attackTally[0].verdict).toBe("crit");
    act(() => { result.current.setTallyVerdict(0, undefined); });
    expect(result.current.attackTally[0].verdict).toBeUndefined();
  });

  it("setTallyVerdict is refused on a nat-locked row", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded({ nat20: true })); });
    act(() => { result.current.setTallyVerdict(0, "miss"); });
    expect(result.current.attackTally[0].verdict).toBe("crit"); // unchanged
  });

  it("switching a row to miss drops its damage (#811)", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded()); });
    const id = result.current.attackTally[0].id;
    act(() => { result.current.setTallyDamage(id, 9); });
    act(() => { result.current.setTallyVerdict(0, "miss"); });
    expect(result.current.attackTally[0].verdict).toBe("miss");
    expect(result.current.attackTally[0].damage).toBeUndefined();
  });

  it("rolling damage auto-resolves an unset verdict to hit — implicit hit (#811)", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded()); });
    const id = result.current.attackTally[0].id;
    expect(result.current.attackTally[0].verdict).toBeUndefined();
    act(() => { result.current.setTallyDamage(id, 9); });
    expect(result.current.attackTally[0].verdict).toBe("hit");
  });

  it("a rider roll also auto-resolves an unset verdict to hit", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded()); });
    const id = result.current.attackTally[0].id;
    act(() => { result.current.addTallyDamageRider(id, 4); });
    expect(result.current.attackTally[0].verdict).toBe("hit");
    expect(result.current.attackTally[0].damage).toBe(4);
  });

  it("damage writes never overwrite an explicit crit verdict", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded()); });
    const id = result.current.attackTally[0].id;
    act(() => { result.current.setTallyVerdict(0, "crit"); });
    act(() => { result.current.setTallyDamage(id, 22); });
    expect(result.current.attackTally[0].verdict).toBe("crit");
  });

  it("setTallyDamageAt writes an arbitrary row's damage — banner inline resolve (#811)", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded({ formId: "a" })); });
    act(() => { result.current.recordAttack(recorded({ formId: "b" })); });
    act(() => { result.current.setTallyDamageAt(0, 7); });
    expect(result.current.attackTally[0].damage).toBe(7);
    expect(result.current.attackTally[0].verdict).toBe("hit"); // implicit hit
    expect(result.current.attackTally[1].damage).toBeUndefined();
    act(() => { result.current.setTallyDamageAt(5, 9); }); // out of range → no-op
    expect(result.current.attackTally).toHaveLength(2);
  });

  it("entering a NEW attack action clears the previous tally", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter({ attacksPerAction: 1 }), SESSION_ID));
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.grantExtraAction(); }); // two actions
    act(() => { result.current.enterAttackMode(); });
    act(() => { result.current.recordAttack(recorded()); });
    act(() => { result.current.finishAttack(); });
    expect(result.current.attackTally).toHaveLength(1); // survives finish (for the banner)
    act(() => { result.current.enterAttackMode(); }); // new Attack action
    expect(result.current.attackTally).toHaveLength(0);
  });

  it("finishAttack keeps the tally (Resume + DM banner rely on it)", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded()); });
    act(() => { result.current.finishAttack(); });
    expect(result.current.attack).toBeNull();
    expect(result.current.attackTally).toHaveLength(1);
  });

  it("endTurn clears the tally", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded()); });
    act(() => { result.current.endTurn(); });
    expect(result.current.attackTally).toHaveLength(0);
  });

  it("clearAttackTally empties the tally (banner dismiss)", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded()); });
    act(() => { result.current.clearAttackTally(); });
    expect(result.current.attackTally).toHaveLength(0);
  });

  it("undo of recordAttack also removes its tally row", () => {
    const { result } = inAttack();
    act(() => { result.current.recordAttack(recorded({ formId: "a" })); });
    act(() => { result.current.recordAttack(recorded({ formId: "b" })); });
    expect(result.current.attackTally).toHaveLength(2);
    act(() => { result.current.undo(); }); // undo attack 2
    expect(result.current.attackTally).toHaveLength(1);
    expect(result.current.attackTally[0].formId).toBe("a");
    expect(result.current.attack?.used).toBe(1); // counter restored
  });

  it("cancelAttack (pre-roll) leaves the tally empty", () => {
    const { result } = inAttack();
    act(() => { result.current.cancelAttack(); });
    expect(result.current.attackTally).toHaveLength(0);
    expect(result.current.attack).toBeNull();
  });
});

// Per-source tally clearing (#813): action + bonusAction rows coexist in one
// tally; entering each mode clears only its own rows, endTurn clears both.

describe("per-source tally clearing (#813)", () => {
  const OFF = { formId: "off", formName: "Dagger (off-hand)", attack: { total: 14, keptFace: 9, nat20: false, nat1: false } };
  const MAIN = { formId: "w1", formName: "Longsword", attack: { total: 17, keptFace: 14, nat20: false, nat1: false } };

  function turnWithBoth() {
    const hook = renderHook(() => useTurnState(makeCharacter({ attacksPerAction: 1 }), SESSION_ID));
    act(() => { hook.result.current.startCombat(); });
    act(() => { hook.result.current.startTurn(); });
    // Off-hand bonus swing first, then an Attack action swing.
    act(() => { hook.result.current.enterTwfMode(); });
    act(() => { hook.result.current.recordTwfAttack(OFF); });
    act(() => { hook.result.current.enterAttackMode(); });
    act(() => { hook.result.current.recordAttack(MAIN); });
    return hook;
  }

  it("both rows coexist, tagged by source", () => {
    const { result } = turnWithBoth();
    expect(result.current.attackTally.map((r) => r.source)).toEqual(["bonusAction", "action"]);
  });

  it("entering a NEW Attack action clears only action rows — the off-hand row stays", () => {
    const { result } = turnWithBoth();
    act(() => { result.current.grantExtraAction(); });
    act(() => { result.current.enterAttackMode(); }); // second Attack action
    expect(result.current.attackTally.map((r) => r.source)).toEqual(["bonusAction"]);
  });

  it("endTurn clears BOTH sources", () => {
    const { result } = turnWithBoth();
    act(() => { result.current.endTurn(); });
    expect(result.current.attackTally).toHaveLength(0);
  });

  it("enterTwfMode drops a prior bonusAction row while keeping action rows", () => {
    const hook = renderHook(() => useTurnState(makeCharacter({ attacksPerAction: 1 }), SESSION_ID));
    act(() => { hook.result.current.startCombat(); });
    act(() => { hook.result.current.startTurn(); });
    act(() => { hook.result.current.enterAttackMode(); });
    act(() => { hook.result.current.recordAttack(MAIN); });
    act(() => { hook.result.current.enterTwfMode(); }); // opens the bonus swing
    expect(hook.result.current.attackTally.map((r) => r.source)).toEqual(["action"]);
  });
});

describe("bonus action and TWF", () => {
  function inActiveTurn() {
    const hook = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { hook.result.current.startCombat(); });
    act(() => { hook.result.current.startTurn(); });
    return hook;
  }

  it("consumeBonusAction sets bonusActionUsed and clears bonusAttack", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeBonusAction(); });
    expect(result.current.bonusActionUsed).toBe(true);
    expect(result.current.bonusAttack).toBeNull();
  });

  it("enterTwfMode sets bonusActionUsed + bonusAttack", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.enterTwfMode(); });
    expect(result.current.bonusActionUsed).toBe(true);
    expect(result.current.bonusAttack).toEqual({ total: 1, used: 0 });
  });

  it("enterTwfMode is a no-op when bonus action already used", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeBonusAction(); });
    act(() => { result.current.enterTwfMode(); }); // already used → no-op
    expect(result.current.bonusAttack).toBeNull();
  });

  it("recordTwfAttack clears bonusAttack", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.enterTwfMode(); });
    act(() => { result.current.recordTwfAttack(); });
    expect(result.current.bonusAttack).toBeNull();
  });

  it("recordTwfAttack with a payload appends a bonusAction-source tally row (#813)", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.enterTwfMode(); });
    act(() => {
      result.current.recordTwfAttack({
        formId: "off",
        formName: "Dagger (off-hand)",
        attack: { total: 14, keptFace: 9, nat20: false, nat1: false },
      });
    });
    expect(result.current.attackTally).toHaveLength(1);
    expect(result.current.attackTally[0]).toMatchObject({
      source: "bonusAction",
      formName: "Dagger (off-hand)",
    });
    expect(result.current.bonusAttack).toBeNull();
  });

  it("recordTwfAttack without a payload appends no row (guarded like recordAttack)", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.enterTwfMode(); });
    act(() => { result.current.recordTwfAttack(); });
    expect(result.current.attackTally).toHaveLength(0);
  });

  it("undo of the off-hand swing removes its tally row and restores bonusAttack (#813)", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.enterTwfMode(); });
    act(() => {
      result.current.recordTwfAttack({
        formId: "off",
        formName: "Dagger (off-hand)",
        attack: { total: 14, keptFace: 9, nat20: false, nat1: false },
      });
    });
    expect(result.current.attackTally).toHaveLength(1);
    act(() => { result.current.undo(); });
    expect(result.current.attackTally).toHaveLength(0);
    expect(result.current.bonusAttack).toEqual({ total: 1, used: 0 });
  });

  it("cancelTwf refunds the bonus action when the swing hasn't been rolled (#732)", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.enterTwfMode(); });
    expect(result.current.bonusActionUsed).toBe(true);
    act(() => { result.current.cancelTwf(); });
    expect(result.current.bonusActionUsed).toBe(false);
    expect(result.current.bonusAttack).toBeNull();
  });

  it("cancelTwf is a no-op once the off-hand swing was rolled (bonusAttack cleared)", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.enterTwfMode(); });
    act(() => { result.current.recordTwfAttack(); }); // bonusAttack → null, action committed
    act(() => { result.current.cancelTwf(); });
    expect(result.current.bonusActionUsed).toBe(true); // stays spent
  });
});

// Flurry of Blows (#1217): 2 Unarmed Strikes for 1 Focus, resolved via its own
// bonusAttack counter — shares the field with TWF (mutually exclusive, both
// spend the single bonus-action slot) but increments across strikes like
// recordAttackState rather than TWF's always-1 single-swing shape. The bonus
// action itself is consumed by consumeBonusAction (the generic click path)
// BEFORE enterFlurryMode arms the counter — mirroring how handleFlurryAction
// dispatches in production.
describe("Flurry of Blows (#1217)", () => {
  function inActiveTurn() {
    const hook = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { hook.result.current.startCombat(); });
    act(() => { hook.result.current.startTurn(); });
    return hook;
  }

  it("enterFlurryMode arms the strike counter after the bonus action is consumed", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeBonusAction(); });
    act(() => { result.current.enterFlurryMode(2); });
    expect(result.current.bonusActionUsed).toBe(true);
    expect(result.current.bonusAttack).toEqual({ total: 2, used: 0 });
  });

  it("enterFlurryMode is a no-op when a bonus-attack resolution is already live", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.enterTwfMode(); }); // bonusAttack: {1, 0}
    act(() => { result.current.enterFlurryMode(2); }); // guarded — never resets progress
    expect(result.current.bonusAttack).toEqual({ total: 1, used: 0 });
  });

  it("recordFlurryAttack increments used and stays live until the total is reached", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeBonusAction(); });
    act(() => { result.current.enterFlurryMode(2); });
    act(() => { result.current.recordFlurryAttack(); });
    expect(result.current.bonusAttack).toEqual({ total: 2, used: 1 });
    act(() => { result.current.recordFlurryAttack(); });
    expect(result.current.bonusAttack).toEqual({ total: 2, used: 2 });
  });

  it("recordFlurryAttack with a payload appends one bonusAction-source tally row per strike", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeBonusAction(); });
    act(() => { result.current.enterFlurryMode(2); });
    act(() => {
      result.current.recordFlurryAttack({
        formId: "unarmed",
        formName: "Unarmed Strike",
        attack: { total: 14, keptFace: 9, nat20: false, nat1: false },
      });
    });
    act(() => {
      result.current.recordFlurryAttack({
        formId: "unarmed",
        formName: "Unarmed Strike",
        attack: { total: 11, keptFace: 6, nat20: false, nat1: false },
      });
    });
    expect(result.current.attackTally).toHaveLength(2);
    expect(result.current.attackTally.every((r) => r.source === "bonusAction")).toBe(true);
  });

  it("recordFlurryAttack clamps at total — an over-click adds no new row", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeBonusAction(); });
    act(() => { result.current.enterFlurryMode(2); });
    const strike = {
      formId: "unarmed",
      formName: "Unarmed Strike",
      attack: { total: 14, keptFace: 9, nat20: false, nat1: false },
    };
    act(() => { result.current.recordFlurryAttack(strike); });
    act(() => { result.current.recordFlurryAttack(strike); });
    act(() => { result.current.recordFlurryAttack(strike); }); // over-click
    expect(result.current.bonusAttack).toEqual({ total: 2, used: 2 });
    expect(result.current.attackTally).toHaveLength(2);
  });

  it("recordFlurryAttack does not grant an Attack-action equip credit (#1217 — that credit is tied to the Attack action only)", () => {
    const { result } = inActiveTurn();
    const before = result.current.attackEquipCredits;
    act(() => { result.current.consumeBonusAction(); });
    act(() => { result.current.enterFlurryMode(2); });
    act(() => { result.current.recordFlurryAttack(); });
    expect(result.current.attackEquipCredits).toBe(before);
  });

  it("finishFlurry clears the counter once both strikes are done; the bonus action stays spent", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeBonusAction(); });
    act(() => { result.current.enterFlurryMode(2); });
    act(() => { result.current.recordFlurryAttack(); });
    act(() => { result.current.recordFlurryAttack(); });
    act(() => { result.current.finishFlurry(); });
    expect(result.current.bonusAttack).toBeNull();
    expect(result.current.bonusActionUsed).toBe(true);
  });

  it("cancelFlurry refunds the bonus action when no strike has landed yet", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeBonusAction(); });
    act(() => { result.current.enterFlurryMode(2); });
    act(() => { result.current.cancelFlurry(); });
    expect(result.current.bonusActionUsed).toBe(false);
    expect(result.current.bonusAttack).toBeNull();
  });

  it("cancelFlurry is a no-op once a strike has landed — stays live mid-flurry", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeBonusAction(); });
    act(() => { result.current.enterFlurryMode(2); });
    act(() => { result.current.recordFlurryAttack(); });
    act(() => { result.current.cancelFlurry(); });
    expect(result.current.bonusActionUsed).toBe(true);
    expect(result.current.bonusAttack).toEqual({ total: 2, used: 1 });
  });

  it("undo of the second strike removes its tally row and restores the 1-of-2 counter", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeBonusAction(); });
    act(() => { result.current.enterFlurryMode(2); });
    act(() => {
      result.current.recordFlurryAttack({
        formId: "unarmed",
        formName: "Unarmed Strike",
        attack: { total: 14, keptFace: 9, nat20: false, nat1: false },
      });
    });
    act(() => {
      result.current.recordFlurryAttack({
        formId: "unarmed",
        formName: "Unarmed Strike",
        attack: { total: 11, keptFace: 6, nat20: false, nat1: false },
      });
    });
    expect(result.current.attackTally).toHaveLength(2);
    act(() => { result.current.undo(); });
    expect(result.current.attackTally).toHaveLength(1);
    expect(result.current.bonusAttack).toEqual({ total: 2, used: 1 });
  });
});

describe("reaction", () => {
  it("consumeReaction → reactionUsed:true", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });

    act(() => { result.current.consumeReaction(); });
    expect(result.current.reactionUsed).toBe(true);
  });

  it("startTurn resets reactionUsed even if it was set last turn", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.consumeReaction(); });
    act(() => { result.current.endTurn(); });

    // Reaction persists across endTurn — only resets on next startTurn.
    act(() => { result.current.startTurn(); });
    expect(result.current.reactionUsed).toBe(false);
  });

  // #738 — RAW regression guard (PHB p.190): a reaction spent OFF your turn
  // (an opportunity attack during another creature's turn) persists through the
  // waiting states between your turns, then refreshes at the START of your turn.
  it("an off-turn reaction persists through waiting, then refreshes on your startTurn", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.endTurn(); }); // now idle — others' turns

    act(() => { result.current.consumeReaction(); }); // opportunity attack off-turn
    expect(result.current.reactionUsed).toBe(true);
    expect(result.current.phase).toBe("idle"); // still waiting — carries here

    act(() => { result.current.startTurn(); }); // your turn begins
    expect(result.current.reactionUsed).toBe(false); // refreshed
  });
});

// Turn-scoped undo (#730).
describe("turn-scoped undo", () => {
  function inActiveTurn(character = makeCharacter()) {
    const hook = renderHook(() => useTurnState(character, SESSION_ID));
    act(() => { hook.result.current.startCombat(); });
    act(() => { hook.result.current.startTurn(); });
    return hook;
  }

  it("undo restores the economy after a consuming mutation", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeAction(); });
    expect(result.current.actionsRemaining).toBe(0);

    act(() => { result.current.undo(); });
    expect(result.current.actionsRemaining).toBe(1);
    expect(result.current.history).toHaveLength(0);
  });

  it("undo reverses enterAttackMode (refunds the action, clears the counter)", () => {
    const { result } = inActiveTurn(makeCharacter({ attacksPerAction: 2 }));
    act(() => { result.current.enterAttackMode(); });
    expect(result.current.attack).toEqual({ total: 2, used: 0 });

    act(() => { result.current.undo(); });
    expect(result.current.attack).toBeNull();
    expect(result.current.actionsRemaining).toBe(1);
  });

  it("undo pops LIFO across multiple mutations", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.grantExtraAction(); }); // 1 → 2
    act(() => { result.current.consumeAction(); });    // 2 → 1
    expect(result.current.actionsRemaining).toBe(1);

    act(() => { result.current.undo(); }); // undo consumeAction → 2
    expect(result.current.actionsRemaining).toBe(2);
    act(() => { result.current.undo(); }); // undo grantExtraAction → 1
    expect(result.current.actionsRemaining).toBe(1);
  });

  it("undo is a no-op with an empty history", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.undo(); });
    expect(result.current.actionsRemaining).toBe(1);
    expect(result.current.history).toHaveLength(0);
  });

  it("no-op guards push nothing onto the history (consumeAction at 0)", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeAction(); }); // 1 → 0, one snapshot
    act(() => { result.current.consumeAction(); }); // guard: no change, no snapshot
    expect(result.current.history).toHaveLength(1);
  });

  it("consumeBonusAction pushes nothing when the bonus action is already used", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeBonusAction(); }); // used → one snapshot
    act(() => { result.current.consumeBonusAction(); }); // guard: no snapshot
    expect(result.current.history).toHaveLength(1);
  });

  it("consumeReaction pushes nothing when the reaction is already used", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeReaction(); }); // used → one snapshot
    act(() => { result.current.consumeReaction(); }); // guard: no snapshot
    expect(result.current.history).toHaveLength(1);
  });

  it("startTurn clears the history — undo never reaches across turns", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeAction(); });
    expect(result.current.history).toHaveLength(1);
    act(() => { result.current.endTurn(); });
    act(() => { result.current.startTurn(); });
    expect(result.current.history).toHaveLength(0);
  });

  it("attachBatchId tags the top history entry; undo strips it back off (#758)", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.consumeBonusAction(); });
    act(() => { result.current.attachBatchId("batch-1"); });
    expect(result.current.history[0].batchId).toBe("batch-1");

    act(() => { result.current.undo(); });
    // Slot restored and no stray batchId leaked onto the live state.
    expect(result.current.bonusActionUsed).toBe(false);
    expect((result.current as unknown as { batchId?: string }).batchId).toBeUndefined();
  });

  it("attachBatchId is a no-op against an empty history (#758)", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.attachBatchId("batch-1"); });
    expect(result.current.history).toHaveLength(0);
  });

  it("undo does NOT revert tookDamageThisTurn (leaves the HP-watcher flag alone)", () => {
    const { result, rerender } = renderHook((c: Character) => useTurnState(c, SESSION_ID), {
      initialProps: withHp(20),
    });
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    rerender(withHp(14)); // took damage → flag set
    act(() => { result.current.consumeAction(); });
    act(() => { result.current.undo(); });

    expect(result.current.actionsRemaining).toBe(1); // economy restored
    expect(result.current.tookDamageThisTurn).toBe(true); // flag untouched
  });
});

describe("spell commits", () => {
  function inActiveTurn() {
    const hook = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { hook.result.current.startCombat(); });
    act(() => { hook.result.current.startTurn(); });
    return hook;
  }

  it("commitActionSpell(0) → spellCastThisTurn.action='cantrip' and action decremented", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.commitActionSpell(0); });
    expect(result.current.spellCastThisTurn.action).toBe("cantrip");
    expect(result.current.actionsRemaining).toBe(0);
  });

  it("commitActionSpell(3) → spellCastThisTurn.action='leveled'", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.commitActionSpell(3); });
    expect(result.current.spellCastThisTurn.action).toBe("leveled");
  });

  it("commitBonusActionSpell(0) → spellCastThisTurn.bonus='cantrip' and bonusActionUsed", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.commitBonusActionSpell(0); });
    expect(result.current.spellCastThisTurn.bonus).toBe("cantrip");
    expect(result.current.bonusActionUsed).toBe(true);
  });

  it("commitBonusActionSpell(2) → spellCastThisTurn.bonus='leveled'", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.commitBonusActionSpell(2); });
    expect(result.current.spellCastThisTurn.bonus).toBe("leveled");
  });

  it("commitReactionSpell → reactionUsed:true", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.commitReactionSpell(); });
    expect(result.current.reactionUsed).toBe(true);
  });
});

// #1164: the turn card's "Spells cast" tally — a cast's receipt, appended by
// useSpellPicker's onCastSettled once a cast resolves.
describe("cast tally", () => {
  function inActiveTurn() {
    const hook = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { hook.result.current.startCombat(); });
    act(() => { hook.result.current.startTurn(); });
    return hook;
  }

  it("recordSpellCast appends a row with a minted id", () => {
    const { result } = inActiveTurn();
    act(() => {
      result.current.recordSpellCast({ spellName: "Burning Hands", level: 1, total: 14, damageType: "fire" });
    });
    expect(result.current.castTally).toHaveLength(1);
    expect(result.current.castTally[0]).toMatchObject({ spellName: "Burning Hands", level: 1, total: 14 });
    expect(result.current.castTally[0].id).toEqual(expect.any(String));
  });

  it("clearCastTally empties the tally", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.recordSpellCast({ spellName: "Fire Bolt", level: 0 }); });
    act(() => { result.current.clearCastTally(); });
    expect(result.current.castTally).toHaveLength(0);
  });

  it("startTurn clears the previous turn's cast tally", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.recordSpellCast({ spellName: "Fire Bolt", level: 0 }); });
    act(() => { result.current.endTurn(); });
    act(() => { result.current.startTurn(); });
    expect(result.current.castTally).toHaveLength(0);
  });

  it("does not push an undo snapshot — undo leaves the cast receipt in place", () => {
    const { result } = inActiveTurn();
    act(() => { result.current.commitActionSpell(1); });
    act(() => { result.current.recordSpellCast({ spellName: "Burning Hands", level: 1, total: 14 }); });
    expect(result.current.actionsRemaining).toBe(0);
    act(() => { result.current.undo(); });
    // Undo restores the pre-commitActionSpell economy snapshot (the last CONSUMING
    // action)...
    expect(result.current.actionsRemaining).toBe(1);
    // ...but the cast tally isn't part of that snapshot, so the receipt survives.
    expect(result.current.castTally).toHaveLength(1);
  });
});

describe("localStorage persistence", () => {
  const STORAGE_KEY = `cs:turn:${SESSION_ID}`;

  it("persists state to localStorage after a mutation", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));

    act(() => { result.current.startCombat(); });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    expect(stored).not.toBeNull();
    expect(stored.inCombat).toBe(true);
    expect(stored.round).toBe(1);
  });

  it("a fresh hook hydrates from localStorage for the same sessionId", () => {
    // First render: start combat and begin a turn.
    const first = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { first.result.current.startCombat(); });
    act(() => { first.result.current.startTurn(); });
    first.unmount();

    // Second render: should pick up the persisted state.
    const second = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    expect(second.result.current.inCombat).toBe(true);
    expect(second.result.current.round).toBe(1);
    expect(second.result.current.phase).toBe("active");
  });

  it("a fresh hook with a different sessionId starts from initialState", () => {
    const first = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { first.result.current.startCombat(); });
    first.unmount();

    const second = renderHook(() => useTurnState(makeCharacter(), "different-session"));
    expect(second.result.current.inCombat).toBe(false);
    expect(second.result.current.round).toBe(0);
  });

  it("backfills history on a stale pre-#730 snapshot without crashing (#750)", () => {
    // Old-schema entry: mid-combat economy state with no `history` field.
    const stale = {
      inCombat: true,
      round: 2,
      phase: "active",
      actionsRemaining: 1,
      bonusActionUsed: true,
      reactionUsed: false,
      attack: null,
      bonusAttack: null,
      spellCastThisTurn: {},
      attackedThisTurn: false,
      tookDamageThisTurn: false,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stale));

    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    // Persisted economy survives, and the missing field defaults to [].
    expect(result.current.inCombat).toBe(true);
    expect(result.current.round).toBe(2);
    expect(result.current.bonusActionUsed).toBe(true);
    expect(result.current.history).toEqual([]);
    // undo is a safe no-op against the defaulted empty history.
    act(() => { result.current.undo(); });
    expect(result.current.bonusActionUsed).toBe(true);
  });

  it("backfills attackTally on a stale pre-#802 snapshot (top-level + undo entries)", () => {
    // Pre-tally schema: mid-attack economy plus an undo entry with no attackTally.
    const stale = {
      inCombat: true,
      round: 2,
      phase: "active",
      actionsRemaining: 0,
      bonusActionUsed: false,
      reactionUsed: false,
      attack: { total: 2, used: 1 },
      bonusAttack: null,
      spellCastThisTurn: {},
      attackedThisTurn: true,
      tookDamageThisTurn: false,
      history: [
        {
          actionsRemaining: 1,
          bonusActionUsed: false,
          reactionUsed: false,
          attack: null,
          bonusAttack: null,
          spellCastThisTurn: {},
        },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stale));

    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    expect(result.current.attackTally).toEqual([]);
    // Undo must not restore `undefined` over the tally — the entry was backfilled.
    act(() => { result.current.undo(); });
    expect(result.current.attackTally).toEqual([]);
    expect(result.current.actionsRemaining).toBe(1);
  });

  it("backfills attackEquipCredits/freeInteractionUsed on a stale pre-#1165 snapshot (top-level + undo entries)", () => {
    // Pre-interaction-budget schema: neither field existed yet.
    const stale = {
      inCombat: true,
      round: 2,
      phase: "active",
      actionsRemaining: 1,
      bonusActionUsed: false,
      reactionUsed: false,
      attack: null,
      bonusAttack: null,
      spellCastThisTurn: {},
      attackedThisTurn: false,
      tookDamageThisTurn: false,
      history: [
        {
          actionsRemaining: 1,
          bonusActionUsed: false,
          reactionUsed: false,
          attack: null,
          bonusAttack: null,
          spellCastThisTurn: {},
        },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stale));

    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    expect(result.current.attackEquipCredits).toBe(0);
    expect(result.current.freeInteractionUsed).toBe(false);
    // Undo must not restore `undefined` over the budget fields — the entry was backfilled.
    act(() => { result.current.undo(); });
    expect(result.current.attackEquipCredits).toBe(0);
    expect(result.current.freeInteractionUsed).toBe(false);
  });

  it("backfills id + source on a pre-#813 tally row (top-level + undo entries)", () => {
    // Pre-#813 rows carry no `id`/`source` (only `action` existed then).
    const legacyRow = { formId: "w1", formName: "Longsword", attack: { total: 17, keptFace: 14, nat20: false, nat1: false }, verdict: "hit", damage: 9 };
    const stale = {
      inCombat: true,
      round: 2,
      phase: "active",
      actionsRemaining: 0,
      bonusActionUsed: false,
      reactionUsed: false,
      attack: { total: 1, used: 1 },
      bonusAttack: null,
      attackTally: [legacyRow],
      spellCastThisTurn: {},
      attackedThisTurn: true,
      tookDamageThisTurn: false,
      history: [
        {
          actionsRemaining: 1,
          bonusActionUsed: false,
          reactionUsed: false,
          attack: null,
          bonusAttack: null,
          spellCastThisTurn: {},
          attackTally: [legacyRow],
        },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stale));

    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    expect(result.current.attackTally[0].source).toBe("action");
    expect(typeof result.current.attackTally[0].id).toBe("string");
    expect(result.current.attackTally[0].id).toBeTruthy();
    // The backfilled row still targets by id (writer resolves it).
    const id = result.current.attackTally[0].id;
    act(() => { result.current.setTallyDamage(id, 12); });
    expect(result.current.attackTally[0].damage).toBe(12);
  });

  it("rehydrates a well-formed current-schema entry unchanged (#750)", () => {
    const snapshot: EconomySnapshot = {
      actionsRemaining: 1,
      bonusActionUsed: false,
      reactionUsed: false,
      attack: null,
      bonusAttack: null,
      spellCastThisTurn: {},
      attackTally: [],
      attackEquipCredits: 0,
      freeInteractionUsed: false,
    };
    const current = {
      inCombat: true,
      round: 3,
      phase: "active",
      actionsRemaining: 0,
      bonusActionUsed: true,
      reactionUsed: true,
      attack: null,
      bonusAttack: null,
      spellCastThisTurn: { action: "leveled" as const },
      attackedThisTurn: true,
      tookDamageThisTurn: false,
      attackEquipCredits: 0,
      freeInteractionUsed: false,
      history: [snapshot],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));

    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    expect(result.current.round).toBe(3);
    expect(result.current.reactionUsed).toBe(true);
    expect(result.current.spellCastThisTurn).toEqual({ action: "leveled" });
    expect(result.current.history).toEqual([snapshot]);
  });

  it("falls back to initialState on a corrupted entry (#750)", () => {
    localStorage.setItem(STORAGE_KEY, "{ not valid json");

    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    expect(result.current.inCombat).toBe(false);
    expect(result.current.round).toBe(0);
    expect(result.current.history).toEqual([]);
  });
});

// Durable-buff turn-hook window (#457).

/** Character with a current-HP value, for the damage watcher. */
function withHp(current: number): Character {
  return { attacksPerAction: 1, inventory: [], advancements: [], hitPoints: { current, max: 20, temp: 0 } } as unknown as Character;
}

describe("turn-hook activity window (#457)", () => {
  it("starts a turn with attackedThisTurn/tookDamageThisTurn false", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    expect(result.current.attackedThisTurn).toBe(false);
    expect(result.current.tookDamageThisTurn).toBe(false);
  });

  it("recordAttack marks attackedThisTurn", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.enterAttackMode(); });
    act(() => { result.current.recordAttack(); });
    expect(result.current.attackedThisTurn).toBe(true);
  });

  it("a current-HP drop during an active turn marks tookDamageThisTurn", () => {
    const { result, rerender } = renderHook((c: Character) => useTurnState(c, SESSION_ID), {
      initialProps: withHp(20),
    });
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    rerender(withHp(14)); // took 6 damage
    expect(result.current.tookDamageThisTurn).toBe(true);
  });

  it("a heal (HP rise) does NOT mark tookDamageThisTurn", () => {
    const { result, rerender } = renderHook((c: Character) => useTurnState(c, SESSION_ID), {
      initialProps: withHp(10),
    });
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    rerender(withHp(18)); // healed
    expect(result.current.tookDamageThisTurn).toBe(false);
  });

  it("endTurn resets the window: a resolved turn's damage does not leak forward", () => {
    const { result, rerender } = renderHook((c: Character) => useTurnState(c, SESSION_ID), {
      initialProps: withHp(20),
    });
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    rerender(withHp(14)); // damage this turn
    expect(result.current.tookDamageThisTurn).toBe(true);
    act(() => { result.current.endTurn(); }); // window resolved + reset here
    act(() => { result.current.startTurn(); });
    expect(result.current.tookDamageThisTurn).toBe(false);
    expect(result.current.attackedThisTurn).toBe(false);
  });

  it("marks tookDamageThisTurn for damage taken out of turn (since your last turn)", () => {
    // 5e: Rage stays if you took damage "since your last turn" — including an
    // opportunity attack / reaction damage during another creature's turn, when
    // the barbarian's own phase is idle.
    const { result, rerender } = renderHook((c: Character) => useTurnState(c, SESSION_ID), {
      initialProps: withHp(20),
    });
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.endTurn(); }); // phase now idle (others' turns)
    expect(result.current.phase).toBe("idle");
    rerender(withHp(15)); // took 5 out-of-turn damage
    expect(result.current.tookDamageThisTurn).toBe(true);
  });

  it("out-of-turn damage survives the next startTurn (rage stays through an idle turn)", () => {
    // Reviewer scenario: Barbarian is hit by an opportunity attack during the
    // enemy's turn, then does nothing on their own next turn. tookDamageThisTurn
    // must still be true when that turn ends, so Rage does not auto-end. The flag
    // is reset in endTurn (after the auto-end check), NOT in startTurn.
    const { result, rerender } = renderHook((c: Character) => useTurnState(c, SESSION_ID), {
      initialProps: withHp(20),
    });
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    act(() => { result.current.endTurn(); });     // my turn ends, window reset
    rerender(withHp(15));                          // enemy turn: opportunity attack
    expect(result.current.tookDamageThisTurn).toBe(true);
    act(() => { result.current.startTurn(); });    // my next turn begins
    expect(result.current.tookDamageThisTurn).toBe(true); // ← survives (was the bug)
  });
});

describe("nullable sessionId (workspace provider, #959)", () => {
  it("returns null when there is no live joined session", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), null));
    expect(result.current).toBeNull();
  });

  it("re-hydrates on null → id (session goes live) and tears down on id → null", () => {
    // Seed a persisted in-combat snapshot for the session about to go live.
    localStorage.setItem("cs:turn:s-live", JSON.stringify({ inCombat: true, round: 2 }));
    const { result, rerender } = renderHook(
      ({ sid }: { sid: string | null }) => useTurnState(makeCharacter(), sid),
      { initialProps: { sid: null as string | null } },
    );
    expect(result.current).toBeNull();

    // Session goes live: the re-hydration effect loads the snapshot (the lazy
    // initializer only ran on mount, when sessionId was null).
    rerender({ sid: "s-live" });
    expect(result.current).not.toBeNull();
    expect(result.current?.inCombat).toBe(true);
    expect(result.current?.round).toBe(2);

    // Session ends: back to null.
    rerender({ sid: null });
    expect(result.current).toBeNull();
  });
});

describe("Sneak Attack once-per-turn guard (#902)", () => {
  it("markSneakAttackUsed sets the flag; idempotent within a turn", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    expect(result.current.sneakAttackUsedThisTurn).toBe(false);

    act(() => { result.current.markSneakAttackUsed(); });
    expect(result.current.sneakAttackUsedThisTurn).toBe(true);
    act(() => { result.current.markSneakAttackUsed(); });
    expect(result.current.sneakAttackUsedThisTurn).toBe(true);
  });

  it("resets on endTurn, the next startTurn, and endCombat (create/cleanup symmetry)", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });

    act(() => { result.current.markSneakAttackUsed(); });
    act(() => { result.current.endTurn(); });
    expect(result.current.sneakAttackUsedThisTurn).toBe(false);

    // A fresh turn, set again, then cleared by the next startTurn.
    act(() => { result.current.startTurn(); });
    act(() => { result.current.markSneakAttackUsed(); });
    act(() => { result.current.startTurn(); });
    expect(result.current.sneakAttackUsedThisTurn).toBe(false);

    // endCombat wipes it too.
    act(() => { result.current.markSneakAttackUsed(); });
    act(() => { result.current.endCombat(); });
    expect(result.current.sneakAttackUsedThisTurn).toBe(false);
  });
});

describe("Stunning Strike once-per-turn guard (#1242)", () => {
  it("markStunningStrikeUsed sets the flag; idempotent within a turn", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });
    expect(result.current.stunningStrikeUsedThisTurn).toBe(false);

    act(() => { result.current.markStunningStrikeUsed(); });
    expect(result.current.stunningStrikeUsedThisTurn).toBe(true);
    act(() => { result.current.markStunningStrikeUsed(); });
    expect(result.current.stunningStrikeUsedThisTurn).toBe(true);
  });

  it("resets on endTurn, the next startTurn, and endCombat (create/cleanup symmetry)", () => {
    const { result } = renderHook(() => useTurnState(makeCharacter(), SESSION_ID));
    act(() => { result.current.startCombat(); });
    act(() => { result.current.startTurn(); });

    act(() => { result.current.markStunningStrikeUsed(); });
    act(() => { result.current.endTurn(); });
    expect(result.current.stunningStrikeUsedThisTurn).toBe(false);

    // A fresh turn, set again, then cleared by the next startTurn.
    act(() => { result.current.startTurn(); });
    act(() => { result.current.markStunningStrikeUsed(); });
    act(() => { result.current.startTurn(); });
    expect(result.current.stunningStrikeUsedThisTurn).toBe(false);

    // endCombat wipes it too.
    act(() => { result.current.markStunningStrikeUsed(); });
    act(() => { result.current.endCombat(); });
    expect(result.current.stunningStrikeUsedThisTurn).toBe(false);
  });
});
