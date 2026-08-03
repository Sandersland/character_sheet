import { describe, it, expect } from "vitest";

import {
  buildFeedItems,
  feedItemRowCount,
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

// Concatenates a row's sentence AND its drill-in text, so a swing's PARTNER
// event (visible only inside the drill-in, e.g. the attack roll behind a
// merged "hit for N" line) still counts toward "did this event's data survive
// rendering" assertions (#1237 §6).
function allText(row: FeedRow): string {
  const drill = (row.drillIn ?? [])
    .map((d) => [d.label, d.formula, d.total, d.note].filter(Boolean).join(" "))
    .join(" ");
  return `${text(row)} ${drill}`;
}

function miss(id: string, total: number, extra: Partial<CharacterEvent> = {}): CharacterEvent {
  return makeEvent({
    id,
    type: "attackRoll",
    category: "roll",
    data: { kind: "attack", source: "Dagger", total, specLabel: "1d20 + 2", faces: [total - 2], swingId: id, verdict: "miss" },
    ...extra,
  });
}

describe("visibleLogEvents (dropped/reverted/round-marker filter)", () => {
  it("drops reverted events, revert events, and round-advance markers", () => {
    const events = [
      makeEvent({ id: "a", type: "damage", category: "hitPoints", reverted: true }),
      makeEvent({ id: "b", type: "revert", category: "hitPoints" }),
      makeEvent({ id: "c", type: "combatRoundAdvanced", category: "combat" }),
      makeEvent({ id: "d", type: "damage", category: "hitPoints" }),
    ];
    expect(visibleLogEvents(events).map((e) => e.id)).toEqual(["d"]);
  });
});

describe("feedItemRowCount (#1237 §4 — the CombatLogRow/SessionLog count parity guard)", () => {
  it("counts a merged attack+damage swing as ONE row, not two events", () => {
    const events = [
      makeEvent({
        id: "dmg", type: "damageRoll", category: "roll",
        data: { kind: "damage", source: "Shortsword", total: 8, damageType: "piercing", specLabel: "1d6 + 4", faces: [4], swingId: "s1", verdict: "hit" },
      }),
      makeEvent({
        id: "atk", type: "attackRoll", category: "roll",
        data: { kind: "attack", source: "Shortsword", total: 17, specLabel: "1d20 + 5", faces: [12], swingId: "s1", verdict: "hit" },
      }),
    ];
    expect(feedItemRowCount(buildFeedItems(events))).toBe(1);
  });

  it("counts rows hidden inside a collapsed run — a collapse must not shrink the badge", () => {
    const misses = Array.from({ length: 5 }, (_, i) => miss(`m${i}`, 20 - i));
    const items = buildFeedItems(misses);
    expect(items.filter((i) => i.kind === "rollRun")).toHaveLength(1); // sanity: it did collapse
    expect(feedItemRowCount(items)).toBe(5);
  });

  it("never counts a round separator", () => {
    const events = [
      makeEvent({ id: "d2", category: "hitPoints", type: "damage", data: { amount: 1 } }),
      makeEvent({ id: "adv", category: "combat", type: "combatRoundAdvanced", data: { round: 2 } }),
      makeEvent({ id: "d1", category: "hitPoints", type: "damage", data: { amount: 2 } }),
      makeEvent({ id: "start", category: "combat", type: "combatStarted" }),
    ];
    const items = buildFeedItems(events);
    expect(items.filter((i) => i.kind === "separator")).toHaveLength(2); // sanity: separators DID render
    // 3 rows (2 damage + "Combat began.") — the 2 separators must not add to that.
    expect(feedItemRowCount(items)).toBe(3);
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

describe("buildFeedItems swingId multiplicity (#1237 §6 — no event may vanish)", () => {
  it("pairs the FIRST attack with the FIRST damage when one attack gets two damage rolls (duplicate handleDamage call)", () => {
    // Newest-first fixture; chronologically: atk -> dmg1 -> dmg2 (a second,
    // buggy damage roll reusing the same swingId — useAttackRolls' swingIdRef
    // is never cleared between calls).
    const events = [
      makeEvent({ id: "dmg2", type: "damageRoll", category: "roll", data: { kind: "damage", source: "Shortsword", total: 5, damageType: "piercing", specLabel: "1d6", faces: [3], swingId: "s1", verdict: "hit" } }),
      makeEvent({ id: "dmg1", type: "damageRoll", category: "roll", data: { kind: "damage", source: "Shortsword", total: 8, damageType: "piercing", specLabel: "1d6 + 4", faces: [4], swingId: "s1", verdict: "hit" } }),
      makeEvent({ id: "atk", type: "attackRoll", category: "roll", data: { kind: "attack", source: "Shortsword", total: 17, specLabel: "1d20 + 5", faces: [12], swingId: "s1", verdict: "hit" } }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    // Nothing dropped: the attack's total, both damage totals are all present.
    const combined = rows.map(allText).join(" | ");
    expect(combined).toContain("17"); // atk, only recoverable via the merged row's drill-in
    expect(combined).toContain("8"); // dmg1, merged sentence
    expect(combined).toContain("5"); // dmg2, its own standalone row
    // dmg1 merges with the attack (gets its drill-in); dmg2 stands alone.
    const dmg1Row = rows.find((r) => allText(r).includes("8"));
    const dmg2Row = rows.find((r) => allText(r).includes("hit for 5"));
    expect(dmg1Row?.drillIn?.length).toBe(2); // attack + damage
    expect(dmg2Row?.drillIn?.length).toBe(1); // damage only — its attack was already consumed
  });

  it("pairs the FIRST damage with the FIRST attack when two attacks share a swingId with one damage", () => {
    // Chronologically: atk1 -> atk2 (a second, buggy attack roll) -> dmg.
    const events = [
      makeEvent({ id: "dmg", type: "damageRoll", category: "roll", data: { kind: "damage", source: "Shortsword", total: 8, damageType: "piercing", specLabel: "1d6 + 4", faces: [4], swingId: "s2", verdict: "hit" } }),
      makeEvent({ id: "atk2", type: "attackRoll", category: "roll", data: { kind: "attack", source: "Shortsword", total: 19, specLabel: "1d20 + 5", faces: [14], swingId: "s2", verdict: "hit" } }),
      makeEvent({ id: "atk1", type: "attackRoll", category: "roll", data: { kind: "attack", source: "Shortsword", total: 17, specLabel: "1d20 + 5", faces: [12], swingId: "s2", verdict: "hit" } }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    const combined = rows.map(allText).join(" | ");
    expect(combined).toContain("8"); // dmg, merged sentence
    expect(combined).toContain("17"); // atk1, merged row's drill-in
    expect(combined).toContain("19"); // atk2, its own standalone row (never dropped)
    const standalone = rows.find((r) => r.id === "atk2");
    expect(standalone).toBeDefined();
    expect(standalone!.drillIn?.length).toBe(1);
  });
});

describe("buildFeedItems attack rolls with no swing partner (#1237 §3 — spell attacks)", () => {
  it("renders the full sentence + drill-in (with the actual rolled die face) for an attack with no swingId", () => {
    // useSpellPicker.handleAttackRoll logs an attack with no swingId and no verdict.
    const events = [
      makeEvent({
        id: "spell-atk",
        type: "attackRoll",
        category: "roll",
        summary: "Fire Bolt: 18 (1d20 + 7)",
        data: { kind: "attack", source: "Fire Bolt", total: 18, specLabel: "1d20 + 7", faces: [11], attackComponents: { abilityMod: 4, proficiencyBonus: 3, rangedBonus: 0, attackRollBonus: 0 } },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toBe("Rolled Fire Bolt — 18.");
    expect(rows[0].drillIn).toBeDefined();
    const drillText = allText(rows[0]);
    expect(drillText).toContain("11"); // the actual rolled face, not just the flat total
    expect(drillText).not.toBe(text(rows[0])); // never degrades to the raw event.summary
  });
});

describe("buildFeedItems attack drill-in dropped d20 face (#1359)", () => {
  function attackEvent(data: Record<string, unknown>) {
    return makeEvent({
      id: "atk",
      type: "attackRoll",
      category: "roll",
      data: { kind: "attack", source: "Longsword", specLabel: "1d20 + 5", ...data },
    });
  }

  it("renders both faces + 'lower kept' when the kept face is below the dropped one (disadvantage)", () => {
    const rows = buildFeedItems([attackEvent({ total: 10, faces: [5], droppedFaces: [9] })]).map(rowOf);
    expect(rows[0].drillIn?.[0].formula).toContain("1d20 (5, 9 — lower kept)");
  });

  it("renders both faces + 'higher kept' when the kept face is above the dropped one (advantage)", () => {
    const rows = buildFeedItems([attackEvent({ total: 20, faces: [15], droppedFaces: [5] })]).map(rowOf);
    expect(rows[0].drillIn?.[0].formula).toContain("1d20 (15, 5 — higher kept)");
  });

  it("renders the neutral 'kept' when both dice landed on the same face", () => {
    const rows = buildFeedItems([attackEvent({ total: 17, faces: [12], droppedFaces: [12] })]).map(rowOf);
    expect(rows[0].drillIn?.[0].formula).toContain("1d20 (12, 12 — kept)");
  });

  it("keeps the nat-20 special case, showing the dropped face alongside it", () => {
    const rows = buildFeedItems([attackEvent({ total: 25, faces: [20], droppedFaces: [9], nat20: true })]).map(rowOf);
    expect(rows[0].drillIn?.[0].formula).toContain("1d20 (nat 20, 9 — higher kept)");
  });

  it("renders the old single-face form unchanged when droppedFaces is absent (pre-existing event)", () => {
    const rows = buildFeedItems([attackEvent({ total: 17, faces: [12] })]).map(rowOf);
    const formula = rows[0].drillIn?.[0].formula;
    expect(formula).toContain("1d20 (12)");
    expect(formula).not.toContain("kept");
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

describe("buildFeedItems roll-run collapsing (#983, raised threshold #1237 §2)", () => {
  it("does NOT collapse 3 consecutive swings (Flurry of Blows) — all three stay visible", () => {
    const swings = [miss("s3", 13), miss("s2", 12), miss("s1", 11)];
    const items = buildFeedItems(swings);
    expect(items.filter((i) => i.kind === "rollRun")).toHaveLength(0);
    expect(items.filter((i) => i.kind === "row")).toHaveLength(3);
  });

  it("collapses a run of 5 consecutive swings, keeping the most recent 3 visible", () => {
    // Newest-first fixture: s5 is newest, s1 is oldest.
    const swings = [miss("s5", 15), miss("s4", 14), miss("s3", 13), miss("s2", 12), miss("s1", 11)];
    const items = buildFeedItems(swings);
    const runs = items.filter((i) => i.kind === "rollRun");
    expect(runs).toHaveLength(1);
    if (runs[0].kind === "rollRun") {
      expect(runs[0].hidden).toHaveLength(2);
      expect(runs[0].visible).toHaveLength(3);
      // The 3 visible are the most recent (chronologically last) three: s3, s4, s5.
      expect(runs[0].hidden.map((r) => r.id)).toEqual(["s1", "s2"]);
      expect(runs[0].visible.map((r) => r.id)).toEqual(["s3", "s4", "s5"]);
    }
  });

  it("labels the minimum collapse in the singular — exactly one row is hidden at the threshold", () => {
    const swings = [miss("s4", 14), miss("s3", 13), miss("s2", 12), miss("s1", 11)];
    const runs = buildFeedItems(swings).filter((i) => i.kind === "rollRun");
    expect(runs).toHaveLength(1);
    if (runs[0].kind === "rollRun") {
      expect(runs[0].hidden).toHaveLength(1);
      expect(runs[0].label).toBe("1 earlier weapon swing");
    }
  });

  it("collapses 12 consecutive initiative rolls to a 3-visible disclosure of the remaining 9", () => {
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
      expect(runs[0].hidden).toHaveLength(9);
      expect(runs[0].visible).toHaveLength(3);
      // The visible rows are the NEWEST three of the run (fixture index 0 = total 20).
      expect(runs[0].visible.map((r) => text(r)).join(" ")).toContain("20");
    }
  });

  it("breaks the run on an interleaved non-roll event, producing two independent runs", () => {
    const events = [
      makeEvent({ id: "i1", category: "roll", type: "initiativeRoll", data: { kind: "initiative", source: "Initiative", total: 18, specLabel: "1d20", faces: [18] } }),
      makeEvent({ id: "i2", category: "roll", type: "initiativeRoll", data: { kind: "initiative", source: "Initiative", total: 15, specLabel: "1d20", faces: [15] } }),
      makeEvent({ id: "i2b", category: "roll", type: "initiativeRoll", data: { kind: "initiative", source: "Initiative", total: 14, specLabel: "1d20", faces: [14] } }),
      makeEvent({ id: "i2c", category: "roll", type: "initiativeRoll", data: { kind: "initiative", source: "Initiative", total: 13, specLabel: "1d20", faces: [13] } }),
      makeEvent({ id: "d1", category: "hitPoints", type: "damage", summary: "Took 5 damage", data: { amount: 5 } }),
      makeEvent({ id: "i3", category: "roll", type: "initiativeRoll", data: { kind: "initiative", source: "Initiative", total: 12, specLabel: "1d20", faces: [12] } }),
      makeEvent({ id: "i4", category: "roll", type: "initiativeRoll", data: { kind: "initiative", source: "Initiative", total: 11, specLabel: "1d20", faces: [11] } }),
      makeEvent({ id: "i5", category: "roll", type: "initiativeRoll", data: { kind: "initiative", source: "Initiative", total: 10, specLabel: "1d20", faces: [10] } }),
      makeEvent({ id: "i6", category: "roll", type: "initiativeRoll", data: { kind: "initiative", source: "Initiative", total: 9, specLabel: "1d20", faces: [9] } }),
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

describe("buildFeedItems round separators (#1237 §1 — a run must never span a round change)", () => {
  it("keeps both separators correct for a small run spanning a round change (attack, attack, round change, attack)", () => {
    const events = [
      miss("a3", 9),
      makeEvent({ id: "adv", category: "combat", type: "combatRoundAdvanced", data: { round: 2 } }),
      miss("a2", 8),
      miss("a1", 7),
      makeEvent({ id: "start", category: "combat", type: "combatStarted" }),
    ];
    const items = buildFeedItems(events);
    const separators = items.filter((i) => i.kind === "separator").map((s) => (s.kind === "separator" ? s.round : null));
    expect(separators).toEqual([1, 2]);
    const rows = items.filter((i): i is Extract<FeedItem, { kind: "row" }> => i.kind === "row");
    expect(rows).toHaveLength(4); // 3 swings (below the collapse threshold) + "Combat began."
    const roundById = new Map(rows.map((r) => [r.row.id, r.row.round]));
    expect(roundById.get("a1")).toBe(1);
    expect(roundById.get("a2")).toBe(1);
    expect(roundById.get("a3")).toBe(2);
  });

  it("splits a collapsing run at the round boundary — the newer round's separator is never swallowed", () => {
    const round2 = [miss("r2-5", 25), miss("r2-4", 24), miss("r2-3", 23), miss("r2-2", 22), miss("r2-1", 21)];
    const round1 = [miss("r1-5", 15), miss("r1-4", 14), miss("r1-3", 13), miss("r1-2", 12), miss("r1-1", 11)];
    const events = [
      ...round2,
      makeEvent({ id: "adv", category: "combat", type: "combatRoundAdvanced", data: { round: 2 } }),
      ...round1,
      makeEvent({ id: "start", category: "combat", type: "combatStarted" }),
    ];
    const items = buildFeedItems(events);
    const separators = items.filter((i) => i.kind === "separator").map((s) => (s.kind === "separator" ? s.round : null));
    expect(separators).toEqual([1, 2]);
    // Each round's run collapses on its own — never merged across the boundary.
    const runs = items.filter((i) => i.kind === "rollRun");
    expect(runs).toHaveLength(2);
  });

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

describe("buildFeedItems HP transition + pre-resistance tag (#1237 §7)", () => {
  it("keeps the HP transition as a muted trailing tag on a heal line", () => {
    const rows = buildFeedItems([
      makeEvent({ id: "h", category: "hitPoints", type: "heal", summary: "Healed 6 HP (12 → 18 HP)", data: { amount: 6 } }),
    ]).map(rowOf);
    expect(text(rows[0])).toBe("Healed 6 HP. (12 → 18 HP)");
    const tag = rows[0].segments.find((s) => s.text.includes("→"));
    expect(tag?.tone).toBe("muted");
  });

  it("keeps the pre-resistance amount AND the HP transition as a muted trailing tag on a resisted damage line", () => {
    const rows = buildFeedItems([
      makeEvent({
        id: "d",
        category: "hitPoints",
        type: "damage",
        summary: "Took 8 slashing damage (resisted from 16) (22 → 14 HP)",
        data: { amount: 8, damageType: "slashing", resisted: true, rawAmount: 16 },
      }),
    ]).map(rowOf);
    expect(text(rows[0])).toBe("Took 8 slashing damage (resisted). (resisted from 16) (22 → 14 HP)");
    const tag = rows[0].segments.find((s) => s.text.includes("→"));
    expect(tag?.tone).toBe("muted");
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

describe("buildFeedItems undefined-total guard (#1237 §5 — never render the literal 'undefined')", () => {
  it("falls back to the stored summary when an attack roll's total is missing (old/incomplete data)", () => {
    const rows = buildFeedItems([
      makeEvent({
        id: "old-atk",
        type: "attackRoll",
        category: "roll",
        summary: "Longsword: 17 (1d20 + 5)",
        data: { kind: "attack", source: "Longsword", specLabel: "1d20 + 5", faces: [12] },
      }),
    ]).map(rowOf);
    expect(text(rows[0])).toBe("Longsword: 17 (1d20 + 5)");
    expect(text(rows[0])).not.toContain("undefined");
  });

  it("falls back to the stored summary when a damage roll's total is missing", () => {
    const rows = buildFeedItems([
      makeEvent({
        id: "old-dmg",
        type: "damageRoll",
        category: "roll",
        summary: "Longsword: 8 slashing",
        data: { kind: "damage", source: "Longsword", specLabel: "2d6", faces: [3, 5] },
      }),
    ]).map(rowOf);
    expect(text(rows[0])).toBe("Longsword: 8 slashing");
    expect(text(rows[0])).not.toContain("undefined");
  });

  it("falls back to the stored summary for a swing whose damage partner has no total", () => {
    const rows = buildFeedItems([
      makeEvent({ id: "dmg", type: "damageRoll", category: "roll", summary: "Shortsword: 8 piercing", data: { kind: "damage", source: "Shortsword", specLabel: "1d6", faces: [4], swingId: "s1" } }),
      makeEvent({ id: "atk", type: "attackRoll", category: "roll", data: { kind: "attack", source: "Shortsword", total: 17, specLabel: "1d20 + 5", faces: [12], swingId: "s1", verdict: "hit" } }),
    ]).map(rowOf);
    expect(text(rows[0])).toBe("Shortsword: 8 piercing");
    expect(text(rows[0])).not.toContain("undefined");
  });

  it("falls back to the stored summary when a check/save/initiative roll's total is missing", () => {
    const rows = buildFeedItems([
      makeEvent({
        id: "old-chk",
        type: "checkRoll",
        category: "roll",
        summary: "Perception: 14 (1d20 + 2)",
        data: { kind: "check", source: "Perception check", specLabel: "1d20 + 2", faces: [12] },
      }),
    ]).map(rowOf);
    expect(text(rows[0])).toBe("Perception: 14 (1d20 + 2)");
    expect(text(rows[0])).not.toContain("undefined");
  });
});

// Every event type in the frontend union renders SOMETHING sane (falls back to
// event.summary at worst), and NEVER leaks "undefined"/"NaN" into the rendered
// text (#1237 §5) — a coverage guard so a new type is never silently broken.
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

// Compile-time forcing function (#1237 §8): if a new member is added to
// CharacterEventType without adding it to ALL_EVENT_TYPES above, `_Complete`
// resolves to `never` and `const complete: _Complete = true` fails to compile.
type _Complete =
  Exclude<CharacterEventType, (typeof ALL_EVENT_TYPES)[number]> extends never ? true : never;

describe("buildFeedItems exhaustive type coverage", () => {
  it("never throws, and never renders 'undefined'/'NaN', for any known event type", () => {
    const complete: _Complete = true;
    expect(complete).toBe(true);
    for (const type of ALL_EVENT_TYPES) {
      const items = buildFeedItems([makeEvent({ type, summary: `summary for ${type}`, category: "combat" })]);
      const rendered = items
        .flatMap((item) => (item.kind === "row" ? [item.row] : item.kind === "rollRun" ? [...item.hidden, ...item.visible] : []))
        .map(allText)
        .join(" ");
      expect(rendered).not.toContain("undefined");
      expect(rendered).not.toContain("NaN");
    }
  });
});
