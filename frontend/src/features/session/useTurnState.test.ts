/**
 * Unit tests for features/session/useTurnState.ts.
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
import type { Character, InventoryItem } from "@/types/character";

// ── Minimal character fixture ─────────────────────────────────────────────────
// useTurnState reads only inventory + the server-derived attacksPerAction.
// Cast to avoid satisfying the full ~50-field Character interface.

function makeCharacter(
  overrides: Partial<Pick<Character, "attacksPerAction" | "inventory">> = {},
): Character {
  return {
    attacksPerAction: 1,
    inventory: [],
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

// ── Combat / turn lifecycle ───────────────────────────────────────────────────

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

  it("twfAvailable is true for a non-light pair WITH the Two-Weapon Fighting style (#732)", () => {
    const heavyPair = makeCharacter({ inventory: [heavyWeapon("h1"), heavyWeapon("h2")] });
    const withStyle = {
      ...heavyPair,
      resources: { pools: [], fightingStyle: "twoWeaponFighting" },
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

// ── Action slot consumption ───────────────────────────────────────────────────

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

// ── Attack flow ───────────────────────────────────────────────────────────────

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

// ── Bonus action / TWF ────────────────────────────────────────────────────────

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

// ── Reaction ──────────────────────────────────────────────────────────────────

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

// ── Undo (#730) ───────────────────────────────────────────────────────────────

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

// ── Spell commits ─────────────────────────────────────────────────────────────

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

// ── Persistence ───────────────────────────────────────────────────────────────

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
});

// ── Durable-buff turn-hook window (#457) ──────────────────────────────────────

/** Character with a current-HP value, for the damage watcher. */
function withHp(current: number): Character {
  return { attacksPerAction: 1, inventory: [], hitPoints: { current, max: 20, temp: 0 } } as unknown as Character;
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
