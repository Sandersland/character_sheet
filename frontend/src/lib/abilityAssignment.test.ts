import { describe, it, expect } from "vitest";

import {
  abilityRows,
  adjustPointBuy,
  assignSlot,
  canDecrement,
  canIncrement,
  clearSlot,
  remainingPoints,
  setPlusOne,
  setPlusTwo,
  spreadMode,
  toOneOneOne,
  toTwoOne,
  usedSlotIndices,
} from "@/lib/abilityAssignment";
import type { AbilityName, AbilityScores } from "@/types/character";

const ALL_EIGHT: AbilityScores = {
  strength: 8,
  dexterity: 8,
  constitution: 8,
  intelligence: 8,
  wisdom: 8,
  charisma: 8,
};

// Spends exactly the 27-point budget: three 15s (cost 9 each). Remaining 0.
const SPENT: AbilityScores = {
  strength: 15,
  dexterity: 15,
  constitution: 15,
  intelligence: 8,
  wisdom: 8,
  charisma: 8,
};

const EMPTY_ASSIGNMENTS: Record<AbilityName, number | null> = {
  strength: null,
  dexterity: null,
  constitution: null,
  intelligence: null,
  wisdom: null,
  charisma: null,
};

describe("point buy", () => {
  it("starts with the full 27-point budget for an all-8 spread", () => {
    expect(remainingPoints(ALL_EIGHT)).toBe(27);
  });

  it("cannot increment at the 15 ceiling", () => {
    expect(canIncrement(SPENT, "strength")).toBe(false);
  });

  it("cannot increment when the next step's cost exceeds the remaining budget", () => {
    // Budget fully spent (remaining 0), so even the 1-point 8→9 step is blocked.
    expect(canIncrement(SPENT, "intelligence")).toBe(false);
  });

  it("cannot decrement at the 8 floor", () => {
    expect(canDecrement(ALL_EIGHT, "strength")).toBe(false);
    expect(canDecrement(SPENT, "intelligence")).toBe(false);
  });

  it("adjustPointBuy bumps a legal step and refuses an illegal one", () => {
    expect(adjustPointBuy(ALL_EIGHT, "strength", 1).strength).toBe(9);
    // At the floor a decrement is a no-op.
    expect(adjustPointBuy(ALL_EIGHT, "strength", -1)).toEqual(ALL_EIGHT);
    // Over budget is a no-op.
    expect(adjustPointBuy(SPENT, "intelligence", 1)).toEqual(SPENT);
  });
});

describe("pool assignment", () => {
  const pool = [15, 14, 13, 12, 12, 8];
  const scores: AbilityScores = { ...ALL_EIGHT };

  it("assigns a slot and writes the pool value into scores", () => {
    const { assignments, scores: next } = assignSlot(EMPTY_ASSIGNMENTS, scores, pool, "strength", 0);
    expect(assignments.strength).toBe(0);
    expect(next.strength).toBe(15);
  });

  it("steals an index from its previous owner", () => {
    const first = assignSlot(EMPTY_ASSIGNMENTS, scores, pool, "strength", 0);
    const second = assignSlot(first.assignments, first.scores, pool, "dexterity", 0);
    expect(second.assignments.dexterity).toBe(0);
    expect(second.assignments.strength).toBeNull();
  });

  it("lets duplicate pool values back two abilities via distinct indices", () => {
    const a = assignSlot(EMPTY_ASSIGNMENTS, scores, pool, "strength", 3);
    const b = assignSlot(a.assignments, a.scores, pool, "dexterity", 4);
    expect(b.scores.strength).toBe(12);
    expect(b.scores.dexterity).toBe(12);
    expect(b.assignments.strength).toBe(3);
    expect(b.assignments.dexterity).toBe(4);
  });

  it("clearSlot nulls only the named ability", () => {
    const a = assignSlot(EMPTY_ASSIGNMENTS, scores, pool, "strength", 0);
    const b = assignSlot(a.assignments, a.scores, pool, "dexterity", 1);
    const cleared = clearSlot(b.assignments, "strength");
    expect(cleared.strength).toBeNull();
    expect(cleared.dexterity).toBe(1);
  });

  it("usedSlotIndices reflects the current assignments", () => {
    const a = assignSlot(EMPTY_ASSIGNMENTS, scores, pool, "strength", 0);
    const b = assignSlot(a.assignments, a.scores, pool, "dexterity", 3);
    const used = usedSlotIndices(b.assignments);
    expect(used.has(0)).toBe(true);
    expect(used.has(3)).toBe(true);
    expect(used.has(1)).toBe(false);
  });
});

describe("background spread", () => {
  const abilities: AbilityName[] = ["dexterity", "constitution", "intelligence"];

  it("derives the spread mode from the assignment", () => {
    expect(spreadMode({})).toBe("twoOne");
    expect(spreadMode({ dexterity: 1, constitution: 1, intelligence: 1 })).toBe("oneOneOne");
    expect(spreadMode({ dexterity: 2, constitution: 1 })).toBe("twoOne");
    // A three-entry assignment that isn't all +1s is still a +2/+1 spread.
    expect(spreadMode({ dexterity: 2, constitution: 1, intelligence: 1 })).toBe("twoOne");
  });

  it("setPlusTwo preserves an existing +1 and evicts a prior +2", () => {
    const next = setPlusTwo({ dexterity: 2, constitution: 1 }, abilities, "intelligence");
    expect(next).toEqual({ intelligence: 2, constitution: 1 });
  });

  it("setPlusOne preserves an existing +2 and evicts a prior +1", () => {
    const next = setPlusOne({ dexterity: 2, constitution: 1 }, abilities, "intelligence");
    expect(next).toEqual({ dexterity: 2, intelligence: 1 });
  });

  it("toOneOneOne writes +1 to all three, toTwoOne clears", () => {
    expect(toOneOneOne(abilities)).toEqual({ dexterity: 1, constitution: 1, intelligence: 1 });
    expect(toTwoOne()).toEqual({});
  });
});

describe("abilityRows", () => {
  const primaryAbility: AbilityName[] = ["strength", "dexterity"];

  it("sums base + bonus and derives the modifier (manual mode)", () => {
    const scores: AbilityScores = { ...ALL_EIGHT, strength: 15, dexterity: 13 };
    const rows = abilityRows({
      method: "manual",
      scores,
      pool: null,
      assignments: EMPTY_ASSIGNMENTS,
      bonus: { strength: 2, dexterity: 1 },
      primaryAbility,
    });
    const str = rows.find((r) => r.ability === "strength")!;
    expect(str.base).toBe(15);
    expect(str.bonus).toBe(2);
    expect(str.total).toBe(17);
    expect(str.mod).toBe(3);
    expect(str.recommended).toBe(true);
    const con = rows.find((r) => r.ability === "constitution")!;
    expect(con.recommended).toBe(false);
  });

  it("leaves base/total null for an unassigned pool row", () => {
    const rows = abilityRows({
      method: "standardArray",
      scores: ALL_EIGHT,
      pool: [15, 14, 13, 12, 10, 8],
      assignments: { ...EMPTY_ASSIGNMENTS, strength: 0 },
      bonus: {},
      primaryAbility,
    });
    const str = rows.find((r) => r.ability === "strength")!;
    expect(str.base).toBe(15);
    const dex = rows.find((r) => r.ability === "dexterity")!;
    expect(dex.base).toBeNull();
    expect(dex.total).toBeNull();
    expect(dex.mod).toBeNull();
  });
});
