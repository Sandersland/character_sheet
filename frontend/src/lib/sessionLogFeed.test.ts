import { describe, it, expect } from "vitest";

import {
  buildFeedItems,
  visibleLogEvents,
  type FeedItem,
  type FeedRow,
} from "@/lib/sessionLogFeed";
import type { CharacterEvent, CharacterEventType } from "@/types/character";

function makeEvent(overrides: Partial<CharacterEvent>): CharacterEvent {
  return {
    id: "evt-1",
    category: "combat",
    type: "attackRoll",
    summary: "Longsword: 17 (1d20 + 5)",
    actor: "player",
    reverted: false,
    createdAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
}

// The API returns events newest-first; every fixture below follows that
// convention (index 0 = most recent) so ordering assertions mean something.

function rowOf(item: FeedItem): FeedRow {
  if (item.kind !== "row") throw new Error(`expected a row item, got ${item.kind}`);
  return item.row;
}

function text(row: FeedRow): string {
  return row.segments.map((s) => s.text).join("");
}

describe("visibleLogEvents (CombatLogRow count parity, #1237)", () => {
  it("drops reverted events, revert events, and round-advance markers", () => {
    const events = [
      makeEvent({ id: "a", type: "damage", category: "hitPoints", reverted: true }),
      makeEvent({ id: "b", type: "revert", category: "hitPoints" }),
      makeEvent({ id: "c", type: "combatRoundAdvanced", category: "combat" }),
      makeEvent({ id: "d", type: "damage", category: "hitPoints" }),
    ];
    expect(visibleLogEvents(events).map((e) => e.id)).toEqual(["d"]);
  });

  it("is the single source CombatLogRow and SessionLog both count against (parity)", () => {
    // A stand-in for CombatLogRow's own count: both call sites must resolve to
    // the exact same list from the exact same function, or they can drift.
    const events = [
      makeEvent({ id: "a", type: "combatRoundAdvanced", category: "combat" }),
      makeEvent({ id: "b", type: "initiativeRoll", category: "roll" }),
      makeEvent({ id: "c", type: "revert" }),
    ];
    const combatLogRowCount = visibleLogEvents(events).length;
    const sessionLogEventCount = visibleLogEvents(events).length;
    expect(combatLogRowCount).toBe(sessionLogEventCount);
    expect(combatLogRowCount).toBe(1);
  });
});

describe("buildFeedItems ordering — newest at the bottom (#1237)", () => {
  it("renders oldest-first so the newest fetched (index 0) event is the LAST row", () => {
    const events = [
      makeEvent({ id: "newest", type: "damage", category: "hitPoints", summary: "Took 3 damage", data: { amount: 3 } }),
      makeEvent({ id: "oldest", type: "damage", category: "hitPoints", summary: "Took 5 damage", data: { amount: 5 } }),
    ];
    const items = buildFeedItems(events).map(rowOf);
    expect(text(items[0])).toContain("5");
    expect(text(items[items.length - 1])).toContain("3");
  });
});

describe("buildFeedItems swingId grouping (#1235 swing pairing)", () => {
  it("merges an attackRoll + its damageRoll (same swingId) into ONE row", () => {
    const events = [
      makeEvent({
        id: "dmg",
        type: "damageRoll",
        category: "roll",
        data: { kind: "damage", source: "Shortsword", total: 8, damageType: "piercing", specLabel: "1d6 + 4", faces: [4], swingId: "s1", verdict: "hit" },
      }),
      makeEvent({
        id: "atk",
        type: "attackRoll",
        category: "roll",
        data: { kind: "attack", source: "Shortsword", total: 17, specLabel: "1d20 + 5", faces: [12], swingId: "s1", verdict: "hit" },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toBe("Shortsword — hit for 8 piercing.");
    expect(rows[0].drillIn).toBeDefined();
    expect(rows[0].drillIn!.length).toBe(2); // attack row + damage row
  });

  it("keeps a lone attack roll (miss) as its own italic, muted row", () => {
    const events = [
      makeEvent({
        id: "atk",
        type: "attackRoll",
        category: "roll",
        data: { kind: "attack", source: "Shortsword", total: 9, specLabel: "1d20 + 3", faces: [5], swingId: "s2", verdict: "miss" },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toBe("Shortsword — missed.");
    expect(rows[0].italic).toBe(true);
    expect(rows[0].tone).toBe("muted");
    // The weapon name itself stays non-italic inside the muted line (mockup spec).
    expect(rows[0].segments[0].italic).toBe(false);
  });

  it("renders a critical hit distinctly, with the crit word toned 'harm'", () => {
    const events = [
      makeEvent({
        id: "dmg",
        type: "damageRoll",
        category: "roll",
        data: { kind: "damage", source: "Shortsword", total: 13, damageType: "fire", specLabel: "2d6 + 1", faces: [2, 3], swingId: "s3", verdict: "crit", crit: true },
      }),
      makeEvent({
        id: "atk",
        type: "attackRoll",
        category: "roll",
        data: { kind: "attack", source: "Shortsword", total: 24, specLabel: "1d20 + 4", faces: [20], swingId: "s3", verdict: "crit", nat20: true, crit: true },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(text(rows[0])).toBe("Shortsword — critical hit! 13 fire damage.");
    const critSeg = rows[0].segments.find((s) => s.text === "critical hit!");
    expect(critSeg?.tone).toBe("harm");
  });

  it("renders an orphan damage roll (no swingId — e.g. a Flame Tongue rider) as its own line", () => {
    const events = [
      makeEvent({
        id: "rider",
        type: "damageRoll",
        category: "roll",
        data: { kind: "damage", source: "Flame Tongue", total: 7, damageType: "fire", specLabel: "2d6", faces: [3, 4] },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toContain("Flame Tongue");
    expect(rows[0].drillIn).toBeDefined();
  });
});

describe("damage-type tone segments (#1237 color table)", () => {
  it("tags a physical damage word with damageType but no elemental hue applies (caller resolves to neutral ink)", () => {
    const events = [
      makeEvent({
        id: "dmg",
        type: "damageRoll",
        category: "roll",
        data: { kind: "damage", source: "Shortsword", total: 8, damageType: "piercing", specLabel: "1d6 + 4", faces: [4] },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    const word = rows[0].segments.find((s) => s.damageType === "piercing");
    expect(word).toBeDefined();
  });

  it("tags an elemental damage word (fire)", () => {
    const events = [
      makeEvent({
        id: "dmg",
        type: "damageRoll",
        category: "roll",
        data: { kind: "damage", source: "Fire Bolt", total: 10, damageType: "fire", specLabel: "2d10", faces: [5, 5] },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    const word = rows[0].segments.find((s) => s.damageType === "fire");
    expect(word).toBeDefined();
  });
});

describe("buildFeedItems roll-run collapsing (#983, preserved)", () => {
  it("collapses 12 consecutive initiative rolls to one visible row plus a disclosure", () => {
    const rolls = Array.from({ length: 12 }, (_, i) =>
      makeEvent({
        id: `init-${i}`,
        category: "roll",
        type: "initiativeRoll",
        summary: `Initiative: ${20 - i}`,
        data: { kind: "initiative", source: "Initiative", total: 20 - i, specLabel: "1d20", faces: [20 - i] },
      }),
    );
    const items = buildFeedItems(rolls);
    const runs = items.filter((i) => i.kind === "rollRun");
    expect(runs).toHaveLength(1);
    if (runs[0].kind === "rollRun") {
      expect(runs[0].hidden).toHaveLength(11);
      // The visible row is the NEWEST of the run (index 0 in the newest-first fixture: total 20).
      expect(text(runs[0].visible)).toContain("20");
    }
  });

  it("breaks the run on an interleaved non-roll event, producing two independent runs", () => {
    const events = [
      makeEvent({ id: "i1", category: "roll", type: "initiativeRoll", data: { kind: "initiative", source: "Initiative", total: 18, specLabel: "1d20", faces: [18] } }),
      makeEvent({ id: "i2", category: "roll", type: "initiativeRoll", data: { kind: "initiative", source: "Initiative", total: 15, specLabel: "1d20", faces: [15] } }),
      makeEvent({ id: "d1", category: "hitPoints", type: "damage", summary: "Took 5 damage", data: { amount: 5 } }),
      makeEvent({ id: "i3", category: "roll", type: "initiativeRoll", data: { kind: "initiative", source: "Initiative", total: 12, specLabel: "1d20", faces: [12] } }),
      makeEvent({ id: "i4", category: "roll", type: "initiativeRoll", data: { kind: "initiative", source: "Initiative", total: 10, specLabel: "1d20", faces: [10] } }),
    ];
    const items = buildFeedItems(events);
    const runs = items.filter((i) => i.kind === "rollRun");
    expect(runs).toHaveLength(2);
  });

  it("does not collapse consecutive non-roll events", () => {
    const events = [
      makeEvent({ id: "d1", category: "hitPoints", type: "damage", data: { amount: 5 } }),
      makeEvent({ id: "d2", category: "hitPoints", type: "damage", data: { amount: 3 } }),
    ];
    const items = buildFeedItems(events);
    expect(items.filter((i) => i.kind === "rollRun")).toHaveLength(0);
    expect(items.filter((i) => i.kind === "row")).toHaveLength(2);
  });
});

describe("buildFeedItems round separators", () => {
  it("inserts a separator when the round changes, and resets across a second combat", () => {
    const events = [
      // Newest-first: combat 2 round 1, then a gap, then combat 1 rounds 2 and 1.
      makeEvent({ id: "c2-r1", category: "hitPoints", type: "damage", data: { amount: 1 } }),
      makeEvent({ id: "c2-start", category: "combat", type: "combatStarted" }),
      makeEvent({ id: "gap", category: "session", type: "sessionStarted" }),
      makeEvent({ id: "c1-round2", category: "hitPoints", type: "damage", data: { amount: 2 } }),
      makeEvent({ id: "c1-adv", category: "combat", type: "combatRoundAdvanced", data: { round: 2 } }),
      makeEvent({ id: "c1-r1", category: "hitPoints", type: "damage", data: { amount: 3 } }),
      makeEvent({ id: "c1-start", category: "combat", type: "combatStarted" }),
    ];
    const items = buildFeedItems(events);
    const separators = items.filter((i) => i.kind === "separator");
    // Round 1 (combat 1), round 2 (combat 1), round 1 again (combat 2) — three transitions.
    expect(separators.map((s) => (s.kind === "separator" ? s.round : null))).toEqual([1, 2, 1]);
  });

  it("inserts a SECOND round-1 separator for a second combat, even though the round number repeats", () => {
    // Two single-round combats with nothing but a round-1 event in each — if the
    // separator logic doesn't reset across the gap, the second combat's round 1
    // silently merges into the first (same number, so a naive "did it change?"
    // check misses it).
    const events = [
      makeEvent({ id: "c2-r1", category: "hitPoints", type: "damage", data: { amount: 1 } }),
      makeEvent({ id: "c2-start", category: "combat", type: "combatStarted" }),
      makeEvent({ id: "gap", category: "session", type: "sessionStarted" }),
      makeEvent({ id: "c1-r1", category: "hitPoints", type: "damage", data: { amount: 2 } }),
      makeEvent({ id: "c1-start", category: "combat", type: "combatStarted" }),
    ];
    const items = buildFeedItems(events);
    const separators = items.filter((i) => i.kind === "separator");
    expect(separators).toHaveLength(2);
    expect(separators.map((s) => (s.kind === "separator" ? s.round : null))).toEqual([1, 1]);
  });
});

describe("buildFeedItems session/combat lifecycle phrasing", () => {
  it("renders exact mockup copy for session/combat lifecycle events", () => {
    const events = [
      makeEvent({ id: "a", category: "combat", type: "combatEnded" }),
      makeEvent({ id: "b", category: "combat", type: "combatStarted" }),
      makeEvent({ id: "c", category: "session", type: "sessionEnded" }),
      makeEvent({ id: "d", category: "session", type: "sessionStarted" }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows.map(text)).toEqual([
      "Session started.",
      "Session ended.",
      "Combat began.",
      "Combat ended.",
    ]);
    expect(rows.every((r) => r.tone === "muted")).toBe(true);
  });
});

describe("buildFeedItems check/save/initiative DC rendering", () => {
  // #1237 regression: the backend normalizes every UNSET optional
  // RollEventData field to `null` (a JSON column can't store `undefined`),
  // not just omitting the key — a strict `dc !== undefined` check rendered a
  // literal "(DC null)" for initiative rolls in the real app.
  it("omits the DC suffix when dc is null (backend's actual shape for 'not set'), not just when absent", () => {
    const rows = buildFeedItems([
      makeEvent({
        id: "init",
        category: "roll",
        type: "initiativeRoll",
        data: { kind: "initiative", source: "Initiative", total: 9, specLabel: "1d20", faces: [9], dc: null },
      }),
    ]).map(rowOf);
    expect(text(rows[0])).toBe("Rolled Initiative — 9.");
    expect(text(rows[0])).not.toContain("null");
  });

  it("renders the DC suffix when dc is a real number", () => {
    const rows = buildFeedItems([
      makeEvent({
        id: "chk",
        category: "roll",
        type: "checkRoll",
        data: { kind: "check", source: "Perception check", total: 16, specLabel: "1d20 + 2", faces: [14], dc: 15 },
      }),
    ]).map(rowOf);
    expect(text(rows[0])).toBe("Rolled Perception check — 16 (DC 15).");
  });
});

describe("buildFeedItems heal/damage-taken/resource/condition tone (color table)", () => {
  it("tones a heal event vitality and builds the sentence from data.amount", () => {
    const rows = buildFeedItems([
      makeEvent({ id: "h", category: "hitPoints", type: "heal", summary: "ignored raw summary", data: { amount: 6 } }),
    ]).map(rowOf);
    expect(rows[0].tone).toBe("heal");
    expect(text(rows[0])).toBe("Healed 6 HP.");
  });

  it("tones a self-damage event harm and includes the damage type from data", () => {
    const rows = buildFeedItems([
      makeEvent({ id: "d", category: "hitPoints", type: "damage", data: { amount: 8, damageType: "slashing" } }),
    ]).map(rowOf);
    expect(rows[0].tone).toBe("harm");
    expect(text(rows[0])).toBe("Took 8 slashing damage.");
  });

  it("tones a condition event harm", () => {
    const rows = buildFeedItems([
      makeEvent({ id: "c", category: "conditions", type: "conditionApplied", summary: "Applied condition: Prone (fell)" }),
    ]).map(rowOf);
    expect(rows[0].tone).toBe("harm");
  });

  it("tones a resource spend/restore gold", () => {
    const rows = buildFeedItems([
      makeEvent({ id: "r", category: "resources", type: "spendResource", summary: "Spent 1 Ki — 3/4 remaining" }),
    ]).map(rowOf);
    expect(rows[0].tone).toBe("resource");
  });
});

describe("buildFeedItems loot summary (#382, preserved)", () => {
  it("names the recipient on a DM loot award event", () => {
    const rows = buildFeedItems([
      makeEvent({
        id: "loot",
        category: "inventory",
        type: "awarded",
        summary: "Awarded Flametongue ×2",
        data: { itemName: "Flametongue", quantityDelta: 2, recipientName: "Bruenor" },
      }),
    ]).map(rowOf);
    expect(text(rows[0])).toBe("Awarded Flametongue ×2 → Bruenor");
  });
});

// Every event type in the frontend union renders SOMETHING sane (falls back to
// event.summary at worst) — a coverage guard so a new type never throws.
const ALL_EVENT_TYPES = [
  "acquired", "consumed", "sold", "bought", "removed",
  "awarded", "revoked",
  "damage", "heal", "setTemp", "shortRest", "longRest",
  "levelUp", "levelDown", "deathSave", "stabilize",
  "xpAward", "xpSet",
  "currencyAdjust",
  "castSpell", "expendSlot", "restoreSlot",
  "learnSpell", "forgetSpell", "prepareSpell", "unprepareSpell",
  "concentrationDropped",
  "subclassChosen", "subclassRemoved",
  "fightingStyleChosen", "fightingStyleRemoved",
  "spendResource", "restoreResource",
  "learnManeuver", "forgetManeuver", "maneuversReconciled",
  "learnToolProficiency", "forgetToolProficiency", "toolProficienciesReconciled",
  "abilityScoreImprovement", "featTaken",
  "advancementRemoved", "advancementsReconciled",
  "equipped", "unequipped",
  "sessionStarted", "sessionEnded",
  "combatStarted", "combatEnded", "combatRoundAdvanced",
  "conditionApplied", "conditionRemoved", "exhaustionSet",
  "attackRoll", "damageRoll",
  "checkRoll", "saveRoll", "initiativeRoll",
  "revert",
] as const satisfies readonly CharacterEventType[];

type _Complete =
  Exclude<CharacterEventType, (typeof ALL_EVENT_TYPES)[number]> extends never ? true : never;

describe("buildFeedItems exhaustive type coverage", () => {
  it("never throws for any known event type", () => {
    const complete: _Complete = true;
    expect(complete).toBe(true);
    for (const type of ALL_EVENT_TYPES) {
      expect(() => buildFeedItems([makeEvent({ type, summary: `summary for ${type}` })])).not.toThrow();
    }
  });
});
