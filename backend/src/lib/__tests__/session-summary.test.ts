/**
 * Pure unit tests for computeSessionSummary — no DB. Feeds synthetic event
 * rows (matching the real CharacterEvent JSON shapes produced by the domain
 * libs) and asserts the aggregated summary.
 */

import { describe, expect, it } from "vitest";

import {
  computeSessionSummary,
  type SummaryEventInput,
} from "../session-summary.js";

const WINDOW = {
  startedAt: new Date("2026-06-22T18:00:00.000Z"),
  endedAt: new Date("2026-06-22T21:30:00.000Z"),
};

function summarize(events: SummaryEventInput[]) {
  return computeSessionSummary(events, WINDOW);
}

describe("computeSessionSummary", () => {
  it("returns an empty-but-typed summary for no events", () => {
    const s = summarize([]);
    expect(s.startedAt).toBe("2026-06-22T18:00:00.000Z");
    expect(s.endedAt).toBe("2026-06-22T21:30:00.000Z");
    expect(s.durationMs).toBe(3.5 * 60 * 60 * 1000);
    expect(s.xpGained).toBe(0);
    expect(s.levelsGained).toBe(0);
    expect(s.itemsAcquired).toEqual([]);
    expect(s.slotsSpent).toEqual({});
    expect(s.spellsCast).toBe(0);
    expect(s.combatRounds).toBe(0);
    expect(s.attackRolls).toBe(0);
    expect(s.damageRolls).toBe(0);
    expect(s.featsOrAsis).toEqual([]);
  });

  it("nets XP across award and set events via before/after", () => {
    const s = summarize([
      { type: "xpAward", before: { experiencePoints: 900 }, after: { experiencePoints: 1350 } },
      { type: "xpSet", before: { experiencePoints: 1350 }, after: { experiencePoints: 1400 } },
    ]);
    expect(s.xpGained).toBe(500); // +450 then +50
  });

  it("handles negative XP deltas (deductions)", () => {
    const s = summarize([
      { type: "xpAward", before: { experiencePoints: 1000 }, after: { experiencePoints: 700 } },
    ]);
    expect(s.xpGained).toBe(-300);
  });

  it("counts levelUp events", () => {
    const s = summarize([{ type: "levelUp" }, { type: "levelUp" }]);
    expect(s.levelsGained).toBe(2);
  });

  it("nets item quantities by name and drops zero-net items, sorted", () => {
    const s = summarize([
      { type: "acquired", data: { itemName: "Torch", quantityDelta: 5 } },
      { type: "consumed", data: { itemName: "Torch", quantityDelta: -2 } },
      { type: "bought", data: { itemName: "Healing Potion", quantityDelta: 2 } },
      { type: "acquired", data: { itemName: "Rope", quantityDelta: 1 } },
      { type: "removed", data: { itemName: "Rope", quantityDelta: -1 } }, // nets to 0 → dropped
    ]);
    expect(s.itemsAcquired).toEqual([
      { name: "Healing Potion", qty: 2 },
      { name: "Torch", qty: 3 },
    ]);
  });

  it("counts spell slots spent from castSpell (slotLevel) and expendSlot (level)", () => {
    const s = summarize([
      { type: "castSpell", data: { spellName: "Fireball", roll: 24, slotLevel: 3 } },
      { type: "expendSlot", data: { level: 1 } },
      { type: "expendSlot", data: { level: 1 } },
    ]);
    expect(s.slotsSpent).toEqual({ "1": 2, "3": 1 });
    expect(s.spellsCast).toBe(1);
  });

  it("does not count a cantrip cast as a slot spent (slotLevel null)", () => {
    const s = summarize([
      { type: "castSpell", data: { spellName: "Fire Bolt", roll: 7, slotLevel: null } },
    ]);
    expect(s.slotsSpent).toEqual({});
    expect(s.spellsCast).toBe(1);
  });

  it("nets restoreSlot against slots spent at that level", () => {
    const s = summarize([
      { type: "expendSlot", data: { level: 2 } },
      { type: "expendSlot", data: { level: 2 } },
      { type: "restoreSlot", data: { level: 2 } },
    ]);
    expect(s.slotsSpent).toEqual({ "2": 1 });
  });

  it("takes the max combat round and counts attack/damage rolls", () => {
    const s = summarize([
      { type: "combatRoundAdvanced", data: { round: 2 } },
      { type: "combatRoundAdvanced", data: { round: 4 } },
      { type: "combatRoundAdvanced", data: { round: 3 } },
      { type: "attackRoll", data: { total: 17 } },
      { type: "attackRoll", data: { total: 12 } },
      { type: "damageRoll", data: { total: 9 } },
    ]);
    expect(s.combatRounds).toBe(4);
    expect(s.attackRolls).toBe(2);
    expect(s.damageRolls).toBe(1);
  });

  it("collects feats and ASIs with readable labels", () => {
    const s = summarize([
      { type: "featTaken", data: { featName: "Sharpshooter" } },
      { type: "abilityScoreImprovement", data: { abilityDeltas: { strength: 2 } } },
    ]);
    expect(s.featsOrAsis).toEqual([
      { type: "featTaken", label: "Feat: Sharpshooter" },
      { type: "abilityScoreImprovement", label: "Ability Score Improvement" },
    ]);
  });

  it("skips reverted events", () => {
    const s = summarize([
      { type: "xpAward", reverted: true, before: { experiencePoints: 0 }, after: { experiencePoints: 500 } },
      { type: "attackRoll", reverted: true, data: { total: 10 } },
      { type: "attackRoll", data: { total: 15 } },
    ]);
    expect(s.xpGained).toBe(0);
    expect(s.attackRolls).toBe(1);
  });

  it("clamps duration to zero if endedAt precedes startedAt", () => {
    const s = computeSessionSummary([], {
      startedAt: new Date("2026-06-22T21:00:00.000Z"),
      endedAt: new Date("2026-06-22T20:00:00.000Z"),
    });
    expect(s.durationMs).toBe(0);
  });
});
