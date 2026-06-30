/**
 * Pure unit tests for computeSessionSummary — no DB. Feeds synthetic event
 * rows (matching the real CharacterEvent JSON shapes produced by the domain
 * libs) and asserts the aggregated summary.
 */

import { describe, expect, it } from "vitest";

import {
  computeCampaignRecap,
  computeSessionSummary,
  type ParticipantSummary,
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
      // A real slot restore: slotsUsed drops from 2 → 1 in the snapshot.
      {
        type: "restoreSlot",
        data: { level: 2 },
        before: { spellcasting: { slotsUsed: { "2": 2 }, arcanumUsed: {} } },
        after: { spellcasting: { slotsUsed: { "2": 1 }, arcanumUsed: {} } },
      },
    ]);
    expect(s.slotsSpent).toEqual({ "2": 1 });
  });

  it("does not count a Mystic Arcanum cast toward slotsSpent (charge, not slot)", () => {
    // Warlock 11+: a level-6 Arcanum cast goes through castSpell with a non-null
    // slotLevel, but it bumps arcanumUsed — not slotsUsed — in the snapshot. The
    // spell still counts as cast, but no 6th-level slot was spent.
    const s = summarize([
      {
        type: "castSpell",
        data: { spellName: "Eyebite", roll: 18, slotLevel: 6 },
        before: { spellcasting: { slotsUsed: {}, arcanumUsed: { "6": 0 } } },
        after: { spellcasting: { slotsUsed: {}, arcanumUsed: { "6": 1 } } },
      },
    ]);
    expect(s.slotsSpent).toEqual({});
    expect(s.spellsCast).toBe(1);
  });

  it("counts a real 6th-level slot cast toward slotsSpent", () => {
    // A genuine 6th-level slot cast bumps slotsUsed in the snapshot, so it is
    // NOT mistaken for an Arcanum charge and tallies a slot.
    const s = summarize([
      {
        type: "castSpell",
        data: { spellName: "Chain Lightning", roll: 21, slotLevel: 6 },
        before: { spellcasting: { slotsUsed: { "6": 0 }, arcanumUsed: {} } },
        after: { spellcasting: { slotsUsed: { "6": 1 }, arcanumUsed: {} } },
      },
    ]);
    expect(s.slotsSpent).toEqual({ "6": 1 });
    expect(s.spellsCast).toBe(1);
  });

  it("tallies only the real slot cast when mixed with an Arcanum cast at another level", () => {
    const s = summarize([
      // Real 3rd-level slot cast: slotsUsed bumps.
      {
        type: "castSpell",
        data: { spellName: "Fireball", roll: 24, slotLevel: 3 },
        before: { spellcasting: { slotsUsed: { "3": 0 }, arcanumUsed: {} } },
        after: { spellcasting: { slotsUsed: { "3": 1 }, arcanumUsed: {} } },
      },
      // 6th-level Arcanum cast: arcanumUsed bumps, slotsUsed unchanged.
      {
        type: "castSpell",
        data: { spellName: "Eyebite", roll: 18, slotLevel: 6 },
        before: { spellcasting: { slotsUsed: { "3": 1 }, arcanumUsed: { "6": 0 } } },
        after: { spellcasting: { slotsUsed: { "3": 1 }, arcanumUsed: { "6": 1 } } },
      },
    ]);
    expect(s.slotsSpent).toEqual({ "3": 1 });
    expect(s.spellsCast).toBe(2);
  });

  it("does not let a Mystic Arcanum restore decrement slotsSpent", () => {
    // Warlock 11+: a level-6 Arcanum charge is spent (logged as castSpell at
    // slotLevel 6), then restored. The restore touches arcanumUsed, not
    // slotsUsed, so it must NOT net against the slot-spent tally — which here is
    // already empty because the Arcanum cast itself spends no slot.
    const s = summarize([
      {
        type: "castSpell",
        data: { spellName: "Eyebite", roll: 18, slotLevel: 6 },
        before: { spellcasting: { slotsUsed: {}, arcanumUsed: { "6": 0 } } },
        after: { spellcasting: { slotsUsed: {}, arcanumUsed: { "6": 1 } } },
      },
      {
        type: "restoreSlot",
        data: { level: 6 },
        before: { spellcasting: { slotsUsed: {}, arcanumUsed: { "6": 1 } } },
        after: { spellcasting: { slotsUsed: {}, arcanumUsed: { "6": 0 } } },
      },
    ]);
    expect(s.slotsSpent).toEqual({});
  });

  it("does not push slotsSpent below zero for an unmatched cross-session restore", () => {
    // The matching expendSlot happened in a prior session, so there is nothing
    // to net against in this window. The restore is floored at 0 deliberately
    // rather than producing a negative/wrong count.
    const s = summarize([
      {
        type: "restoreSlot",
        data: { level: 1 },
        before: { spellcasting: { slotsUsed: { "1": 1 }, arcanumUsed: {} } },
        after: { spellcasting: { slotsUsed: { "1": 0 }, arcanumUsed: {} } },
      },
    ]);
    expect(s.slotsSpent).toEqual({});
  });

  it("an unmatched restore cancels at most the in-session expends, flooring at 0", () => {
    const s = summarize([
      { type: "expendSlot", data: { level: 1 } }, // one spent this session
      // Two restores: first cancels the in-session expend, second is a
      // cross-session restore with no in-window match → floored, not negative.
      {
        type: "restoreSlot",
        data: { level: 1 },
        before: { spellcasting: { slotsUsed: { "1": 2 }, arcanumUsed: {} } },
        after: { spellcasting: { slotsUsed: { "1": 1 }, arcanumUsed: {} } },
      },
      {
        type: "restoreSlot",
        data: { level: 1 },
        before: { spellcasting: { slotsUsed: { "1": 1 }, arcanumUsed: {} } },
        after: { spellcasting: { slotsUsed: { "1": 0 }, arcanumUsed: {} } },
      },
    ]);
    expect(s.slotsSpent).toEqual({});
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

// ── computeCampaignRecap (#245) ───────────────────────────────────────────────

function participant(overrides: Partial<ParticipantSummary>): ParticipantSummary {
  return {
    startedAt: "2026-06-22T18:00:00.000Z",
    endedAt: "2026-06-22T21:00:00.000Z",
    durationMs: 0,
    xpGained: 0,
    levelsGained: 0,
    itemsAcquired: [],
    slotsSpent: {},
    spellsCast: 0,
    combatRounds: 0,
    attackRolls: 0,
    damageRolls: 0,
    featsOrAsis: [],
    characterId: "c1",
    characterName: "Hero",
    joinedAt: "2026-06-22T18:00:00.000Z",
    leftAt: null,
    presentMs: 0,
    ...overrides,
  };
}

describe("computeCampaignRecap", () => {
  it("returns a zeroed recap with null bounds for no participants", () => {
    const recap = computeCampaignRecap([]);
    expect(recap.participantCount).toBe(0);
    expect(recap.startedAt).toBeNull();
    expect(recap.endedAt).toBeNull();
    expect(recap.durationMs).toBe(0);
    expect(recap.xpGained).toBe(0);
    expect(recap.totalPresentMs).toBe(0);
    expect(recap.itemsAcquired).toEqual([]);
  });

  it("mirrors a single participant's stats", () => {
    const recap = computeCampaignRecap([
      participant({
        xpGained: 450,
        spellsCast: 3,
        combatRounds: 4,
        attackRolls: 5,
        presentMs: 90 * 60 * 1000,
        joinedAt: "2026-06-22T18:00:00.000Z",
        leftAt: "2026-06-22T19:30:00.000Z",
        itemsAcquired: [{ name: "Potion", qty: 2 }],
      }),
    ]);
    expect(recap.participantCount).toBe(1);
    expect(recap.xpGained).toBe(450);
    expect(recap.spellsCast).toBe(3);
    expect(recap.combatRounds).toBe(4);
    expect(recap.totalPresentMs).toBe(90 * 60 * 1000);
    expect(recap.itemsAcquired).toEqual([{ name: "Potion", qty: 2 }]);
    expect(recap.startedAt).toBe("2026-06-22T18:00:00.000Z");
    expect(recap.endedAt).toBe("2026-06-22T19:30:00.000Z");
  });

  it("sums stats, unions items by name, and spans the widest present window", () => {
    const recap = computeCampaignRecap([
      participant({
        characterId: "a",
        xpGained: 300,
        spellsCast: 2,
        combatRounds: 3,
        attackRolls: 4,
        damageRolls: 3,
        levelsGained: 1,
        presentMs: 60 * 60 * 1000,
        joinedAt: "2026-06-22T18:00:00.000Z",
        leftAt: "2026-06-22T19:00:00.000Z",
        itemsAcquired: [{ name: "Rope", qty: 1 }, { name: "Torch", qty: 2 }],
      }),
      participant({
        characterId: "b",
        xpGained: 200,
        spellsCast: 1,
        combatRounds: 2,
        attackRolls: 1,
        damageRolls: 1,
        presentMs: 120 * 60 * 1000,
        joinedAt: "2026-06-22T18:30:00.000Z",
        leftAt: null,
        endedAt: "2026-06-22T20:30:00.000Z",
        itemsAcquired: [{ name: "Torch", qty: 3 }],
      }),
    ]);
    expect(recap.participantCount).toBe(2);
    expect(recap.xpGained).toBe(500);
    expect(recap.spellsCast).toBe(3);
    expect(recap.combatRounds).toBe(5);
    expect(recap.attackRolls).toBe(5);
    expect(recap.damageRolls).toBe(4);
    expect(recap.levelsGained).toBe(1);
    expect(recap.totalPresentMs).toBe(180 * 60 * 1000);
    expect(recap.itemsAcquired).toEqual([
      { name: "Rope", qty: 1 },
      { name: "Torch", qty: 5 },
    ]);
    expect(recap.startedAt).toBe("2026-06-22T18:00:00.000Z");
    // b never left → falls back to its endedAt for the window's upper bound.
    expect(recap.endedAt).toBe("2026-06-22T20:30:00.000Z");
  });
});
