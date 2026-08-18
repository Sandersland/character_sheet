import { describe, it, expect } from "vitest";

import {
  buildFeedItems,
  feedItemRowCount,
  visibleLogEvents,
  type FeedItem,
  type FeedRow,
} from "@/lib/sessionLogFeed";
import type { CharacterEvent, CharacterEventType } from "@/types/character";
import type { ResolveActionEventData, ResolveActionEventToHit } from "@character-sheet/shared-types";

function makeEvent(overrides: Partial<CharacterEvent>): CharacterEvent {
  return {
    id: "evt-1",
    category: "combat",
    type: "resolveAction",
    summary: "Resolved Longsword (action)",
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

function allText(row: FeedRow): string {
  const drill = (row.drillIn ?? [])
    .map((d) => [d.label, d.formula, d.total, d.note].filter(Boolean).join(" "))
    .join(" ");
  return `${text(row)} ${drill}`;
}

// Builds a `resolveAction` event — the single consolidated event a resolution
// writes (#1827 model B, #1829). `data` mirrors the backend's persisted
// shape exactly (backend/src/lib/combat/resolve-action-ops.ts).
function resolveEvent(
  id: string,
  data: Partial<ResolveActionEventData> & { source: string },
  extra: Partial<CharacterEvent> = {},
): CharacterEvent {
  return makeEvent({
    id,
    type: "resolveAction",
    category: "combat",
    data: { actionId: id, cost: { kind: "action" }, ...data },
    ...extra,
  });
}

// A missed weapon swing — the run-collapse/round-separator fixtures below
// need many of these, varying only id/total.
function miss(id: string, total: number, extra: Partial<CharacterEvent> = {}): CharacterEvent {
  return resolveEvent(
    id,
    { source: "Dagger", toHit: { faces: [total - 2], kept: total - 2, nat20: false, bonus: 2, total, verdict: "miss" } },
    extra,
  );
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
  it("counts a resolution as ONE row (a resolveAction event was always one event, #1827 model B)", () => {
    const events = [
      resolveEvent("swing", {
        source: "Shortsword",
        toHit: { faces: [12], kept: 12, nat20: false, bonus: 5, total: 17, verdict: "hit" },
        effect: { spec: "1d6 + 4", faces: [4], total: 8, type: "piercing", kind: "damage", crit: false },
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

describe("buildFeedItems resolveAction attack-roll shape (weapon swing / Fire Bolt)", () => {
  it("renders a hit as one row: sentence + Attack/Damage drill-in", () => {
    const events = [
      resolveEvent("swing", {
        source: "Shortsword",
        toHit: { faces: [12], kept: 12, nat20: false, bonus: 5, total: 17, verdict: "hit" },
        effect: { spec: "1d6 + 4", faces: [4], total: 8, type: "piercing", kind: "damage", crit: false },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toBe("Shortsword — hit for 8 piercing.");
    expect(rows[0].drillIn).toHaveLength(2);
    expect(rows[0].drillIn![0]).toMatchObject({ label: "Attack", total: "17" });
    expect(rows[0].drillIn![1]).toMatchObject({ label: "Damage", total: "8 piercing" });
  });

  it("keeps a miss as its own italic, muted row with no damage rolled", () => {
    const events = [
      resolveEvent("swing", {
        source: "Shortsword",
        toHit: { faces: [5], kept: 5, nat20: false, bonus: 3, total: 9, verdict: "miss" },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toBe("Shortsword — missed.");
    expect(rows[0].italic).toBe(true);
    expect(rows[0].tone).toBe("muted");
    // The weapon name itself stays non-italic inside the muted line (mockup spec).
    expect(rows[0].segments[0].italic).toBe(false);
    expect(rows[0].drillIn?.[1].note).toBe("Called a miss — no damage rolled.");
  });

  it("renders a critical hit distinctly, with the crit word toned 'harm'", () => {
    const events = [
      resolveEvent("swing", {
        source: "Shortsword",
        toHit: { faces: [20], kept: 20, nat20: true, bonus: 4, total: 24, verdict: "crit" },
        effect: { spec: "2d6 + 1", faces: [2, 3], total: 13, type: "fire", kind: "damage", crit: true },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(text(rows[0])).toBe("Shortsword — critical hit! 13 fire damage.");
    const critSeg = rows[0].segments.find((s) => s.text === "critical hit!");
    expect(critSeg?.tone).toBe("harm");
  });

  it("threads the row's computed isCrit into the primary effect drill so a DM-ruled crit (verdict:'crit', effect.crit:false) still shows 'dice doubled'", () => {
    const events = [
      resolveEvent("swing", {
        source: "Shortsword",
        toHit: { faces: [15], kept: 15, nat20: false, bonus: 4, total: 19, verdict: "crit" },
        effect: { spec: "2d6 + 1", faces: [2, 3], total: 6, type: "slashing", kind: "damage", crit: false },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(text(rows[0])).toContain("critical hit!");
    expect(rows[0].drillIn![1].formula).toContain("— dice doubled");
  });

  it("renders a heal-shaped attack-roll resolution (e.g. a healing weapon rune) as a healed sentence", () => {
    const events = [
      resolveEvent("swing", {
        source: "Life Drinker",
        toHit: { faces: [15], kept: 15, nat20: false, bonus: 6, total: 21, verdict: "hit" },
        effect: { spec: "1d4", faces: [3], total: 3, type: "necrotic", kind: "heal", crit: false },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(text(rows[0])).toBe("Life Drinker — healed 3 HP.");
  });
});

describe("buildFeedItems resolveAction save shape (Sacred Flame)", () => {
  it("renders the DC/ability/damage sentence and Save+Damage drill-in", () => {
    const events = [
      resolveEvent("cast", {
        source: "Sacred Flame",
        save: { dc: 13, ability: "dexterity" },
        effect: { spec: "1d8", faces: [6], total: 6, type: "radiant", kind: "damage", crit: false },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toBe("Sacred Flame — DC 13 Dexterity save, 6 radiant.");
    expect(rows[0].drillIn).toHaveLength(2);
    expect(rows[0].drillIn![0]).toMatchObject({ label: "Save", total: "DC 13 Dexterity" });
    expect(rows[0].drillIn![1]).toMatchObject({ label: "Damage", total: "6 radiant" });
  });

  it("renders a save with no effect (a control spell) as just the DC sentence", () => {
    const events = [resolveEvent("cast", { source: "Hold Person", save: { dc: 14, ability: "wisdom" } })];
    const rows = buildFeedItems(events).map(rowOf);
    expect(text(rows[0])).toBe("Hold Person — DC 14 Wisdom save.");
    expect(rows[0].drillIn).toHaveLength(1);
  });

  it("tones a save-shaped heal effect 'heal', consistent with the attack/effect-only builders", () => {
    const events = [
      resolveEvent("cast", {
        source: "Life Transference",
        save: { dc: 15, ability: "constitution" },
        effect: { spec: "1d8 + 3", faces: [5], total: 8, type: "healing", kind: "heal", crit: false },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows[0].tone).toBe("heal");
  });
});

describe("buildFeedItems resolveAction auto-hit / multi-die shape (Magic Missile)", () => {
  it("renders one row; the effect's faces[] give the per-dart breakdown in the drill-in, no instances array", () => {
    const events = [
      resolveEvent("cast", {
        source: "Magic Missile",
        effect: { spec: "3d4+3", faces: [2, 3, 4], total: 12, type: "force", kind: "damage", crit: false },
        slotLevel: 1,
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toBe("Magic Missile — 12 force damage.");
    expect(rows[0].drillIn).toHaveLength(1);
    // The dice + the floored spec modifier (+3) must reconcile to the total (12).
    expect(rows[0].drillIn![0].formula).toBe("3d4 (2, 3, 4) + 3");
  });
});

// A drill-in that doesn't sum to its own total reads as a live bug to a
// player — every effect/to-hit formula below must reconcile.
function sumFormula(formula: string | undefined): number {
  if (!formula) return NaN;
  const faceGroups = [...formula.matchAll(/\(([\d,\s]+)(?: — dice doubled)?\)/g)].map((m) =>
    m[1].split(",").reduce((sum, n) => sum + Number(n.trim()), 0),
  );
  const addends = [...formula.matchAll(/([+−])\s*(\d+)(?:\s*\([^)]*\))?/g)].map(
    (m) => (m[1] === "−" ? -1 : 1) * Number(m[2]),
  );
  return [...faceGroups, ...addends].reduce((sum, n) => sum + n, 0);
}

describe("buildFeedItems resolveAction effect drill-in reconciliation (MUST-fix review finding)", () => {
  it("floors to the spec's own trailing modifier when effect.components is absent (weapon hit)", () => {
    const events = [
      resolveEvent("swing", {
        source: "Shortsword",
        toHit: { faces: [12], kept: 12, nat20: false, bonus: 5, total: 17, verdict: "hit" },
        effect: { spec: "1d6 + 4", faces: [4], total: 8, type: "piercing", kind: "damage", crit: false },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    const damageDrill = rows[0].drillIn![1];
    expect(damageDrill.formula).toBe("1d6 (4) + 4");
    expect(sumFormula(damageDrill.formula)).toBe(8);
    expect(damageDrill.total).toBe("8 piercing");
  });

  it("floors to the spec's own trailing modifier for a multi-die effect (Magic Missile)", () => {
    const events = [
      resolveEvent("cast", {
        source: "Magic Missile",
        effect: { spec: "3d4+3", faces: [2, 3, 4], total: 12, type: "force", kind: "damage", crit: false },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    const drill = rows[0].drillIn![0];
    expect(sumFormula(drill.formula)).toBe(12);
  });

  it("renders labeled addends (and skips the spec-modifier floor) when effect.components is present", () => {
    const events = [
      resolveEvent("swing", {
        source: "Shortsword",
        toHit: { faces: [12], kept: 12, nat20: false, bonus: 5, total: 17, verdict: "hit" },
        effect: {
          spec: "1d6 + 4",
          faces: [4],
          total: 8,
          type: "piercing",
          kind: "damage",
          crit: false,
          components: { abilityMod: 4, meleeDamageBonus: 0, ability: "strength" },
        },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    const damageDrill = rows[0].drillIn![1];
    expect(damageDrill.formula).toBe("1d6 (4) + 4 (Strength)");
    expect(sumFormula(damageDrill.formula)).toBe(8);
  });

  it("renders labeled to-hit addends when toHit.components is present, instead of the flat Bonus line", () => {
    const events = [
      resolveEvent("swing", {
        source: "Shortsword",
        toHit: {
          faces: [12],
          kept: 12,
          nat20: false,
          bonus: 5,
          total: 17,
          verdict: "hit",
          components: { abilityMod: 3, proficiencyBonus: 2, rangedBonus: 0, attackRollBonus: 0, ability: "dexterity" },
        },
        effect: { spec: "1d6 + 4", faces: [4], total: 8, type: "piercing", kind: "damage", crit: false },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    const attackDrill = rows[0].drillIn![0];
    expect(attackDrill.formula).toBe("1d20 (12) + 3 (Dexterity) + 2 (Proficiency)");
    expect(attackDrill.formula).not.toContain("Bonus)");
    expect(sumFormula(attackDrill.formula)).toBe(17);
  });
});

describe("buildFeedItems resolveAction typed damage riders (#1843 — additive riders[] sibling to effect)", () => {
  it("sums the primary effect + one rider into ONE row: 'hit for 8 slashing + 5 fire.'", () => {
    const events = [
      resolveEvent("swing", {
        source: "Flame Tongue",
        toHit: { faces: [12], kept: 12, nat20: false, bonus: 5, total: 17, verdict: "hit" },
        effect: { spec: "1d6 + 4", faces: [4], total: 8, type: "slashing", kind: "damage", crit: false },
        riders: [{ spec: "2d6", faces: [2, 3], total: 5, type: "fire", kind: "damage", crit: false }],
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toBe("Flame Tongue — hit for 8 slashing + 5 fire.");
  });

  it("gives each term its own drill-in line: Attack, then Damage (primary), then the rider's own type-labeled line", () => {
    const events = [
      resolveEvent("swing", {
        source: "Flame Tongue",
        toHit: { faces: [12], kept: 12, nat20: false, bonus: 5, total: 17, verdict: "hit" },
        effect: { spec: "1d6 + 4", faces: [4], total: 8, type: "slashing", kind: "damage", crit: false },
        riders: [{ spec: "2d6", faces: [2, 3], total: 5, type: "fire", kind: "damage", crit: false }],
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows[0].drillIn).toHaveLength(3);
    expect(rows[0].drillIn![0]).toMatchObject({ label: "Attack", total: "17" });
    expect(rows[0].drillIn![1]).toMatchObject({ label: "Damage", total: "8 slashing" });
    expect(rows[0].drillIn![2]).toMatchObject({ label: "Fire", total: "5 fire" });
    expect(sumFormula(rows[0].drillIn![2].formula)).toBe(5);
  });

  it("sums multiple typed riders in swing order", () => {
    const events = [
      resolveEvent("swing", {
        source: "Frost Brand",
        toHit: { faces: [12], kept: 12, nat20: false, bonus: 5, total: 17, verdict: "hit" },
        effect: { spec: "1d8", faces: [6], total: 6, type: "slashing", kind: "damage", crit: false },
        riders: [
          { spec: "1d6", faces: [4], total: 4, type: "cold", kind: "damage", crit: false },
          { spec: "1d4", faces: [3], total: 3, type: "force", kind: "damage", crit: false },
        ],
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(text(rows[0])).toBe("Frost Brand — hit for 6 slashing + 4 cold + 3 force.");
    expect(rows[0].drillIn).toHaveLength(4);
    expect(rows[0].drillIn![2]).toMatchObject({ label: "Cold" });
    expect(rows[0].drillIn![3]).toMatchObject({ label: "Force" });
  });

  it("labels a rider's drill-in line by its source when the wire carries one", () => {
    const events = [
      resolveEvent("swing", {
        source: "Rapier",
        toHit: { faces: [12], kept: 12, nat20: false, bonus: 5, total: 17, verdict: "hit" },
        effect: { spec: "1d8 + 3", faces: [2], total: 5, type: "piercing", kind: "damage", crit: false },
        riders: [
          { spec: "1d6", faces: [1], total: 1, type: "piercing", kind: "damage", crit: false, source: "Sneak Attack" },
        ],
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows[0].drillIn![2]).toMatchObject({ label: "Sneak Attack", total: "1 piercing" });
  });

  it("appends ' damage.' once, after the LAST term, on a critical hit with a rider", () => {
    const events = [
      resolveEvent("swing", {
        source: "Flame Tongue",
        toHit: { faces: [20], kept: 20, nat20: true, bonus: 5, total: 25, verdict: "crit" },
        effect: { spec: "2d6 + 4", faces: [4, 5], total: 13, type: "slashing", kind: "damage", crit: true },
        riders: [{ spec: "4d6", faces: [2, 3, 4, 5], total: 14, type: "fire", kind: "damage", crit: true }],
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(text(rows[0])).toBe("Flame Tongue — critical hit! 13 slashing + 14 fire damage.");
  });

  it("sums a rider into a save-shaped resolution's sentence and drill-in too", () => {
    const events = [
      resolveEvent("cast", {
        source: "Green-Flame Blade",
        save: { dc: 13, ability: "dexterity" },
        effect: { spec: "1d8", faces: [6], total: 6, type: "slashing", kind: "damage", crit: false },
        riders: [{ spec: "1d8", faces: [5], total: 5, type: "fire", kind: "damage", crit: false }],
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(text(rows[0])).toBe("Green-Flame Blade — DC 13 Dexterity save, 6 slashing + 5 fire.");
    expect(rows[0].drillIn).toHaveLength(3);
    expect(rows[0].drillIn![2]).toMatchObject({ label: "Fire" });
  });

  it("still counts as ONE feed row, not two (#1822 regression guard)", () => {
    const events = [
      resolveEvent("swing", {
        source: "Flame Tongue",
        toHit: { faces: [12], kept: 12, nat20: false, bonus: 5, total: 17, verdict: "hit" },
        effect: { spec: "1d6 + 4", faces: [4], total: 8, type: "slashing", kind: "damage", crit: false },
        riders: [{ spec: "2d6", faces: [2, 3], total: 5, type: "fire", kind: "damage", crit: false }],
      }),
    ];
    expect(feedItemRowCount(buildFeedItems(events))).toBe(1);
  });

  it("Magic Missile (same-type count>=1 effect, no riders) still renders unaffected", () => {
    const events = [
      resolveEvent("cast", {
        source: "Magic Missile",
        effect: { spec: "3d4+3", faces: [2, 3, 4], total: 12, type: "force", kind: "damage", crit: false },
        slotLevel: 1,
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toBe("Magic Missile — 12 force damage.");
    expect(rows[0].drillIn).toHaveLength(1);
  });
});

describe("buildFeedItems resolveAction heal shape", () => {
  it("renders a healing sentence toned 'heal'", () => {
    const events = [
      resolveEvent("cast", {
        source: "Cure Wounds",
        effect: { spec: "1d8 + 3", faces: [5], total: 8, type: "healing", kind: "heal", crit: false },
        slotLevel: 1,
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    expect(text(rows[0])).toBe("Cure Wounds — healed 8 HP.");
    expect(rows[0].tone).toBe("heal");
  });
});

describe("buildFeedItems resolveAction no-roll shape (Druidcraft)", () => {
  it("renders a plain 'Cast X' row with no drill-in", () => {
    const events = [resolveEvent("cast", { source: "Druidcraft" })];
    const rows = buildFeedItems(events).map(rowOf);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toBe("Cast Druidcraft.");
    expect(rows[0].drillIn).toBeUndefined();
  });
});

describe("buildFeedItems resolveAction to-hit drill-in (dropped d20 face)", () => {
  function attackEvent(toHit: Partial<ResolveActionEventToHit>) {
    return resolveEvent("atk", {
      source: "Longsword",
      toHit: { faces: [12], kept: 12, nat20: false, bonus: 5, total: 17, verdict: "hit", ...toHit },
      effect: { spec: "1d8 + 3", faces: [5], total: 8, type: "slashing", kind: "damage", crit: false },
    });
  }

  it("renders both faces + 'lower kept' when the kept face is below the dropped one (disadvantage)", () => {
    const rows = buildFeedItems([attackEvent({ kept: 5, faces: [5, 9], total: 10 })]).map(rowOf);
    expect(rows[0].drillIn?.[0].formula).toContain("1d20 (5, 9 — lower kept)");
  });

  it("renders both faces + 'higher kept' when the kept face is above the dropped one (advantage)", () => {
    const rows = buildFeedItems([attackEvent({ kept: 15, faces: [15, 5], total: 20 })]).map(rowOf);
    expect(rows[0].drillIn?.[0].formula).toContain("1d20 (15, 5 — higher kept)");
  });

  it("renders the neutral 'kept' when both dice landed on the same face", () => {
    const rows = buildFeedItems([attackEvent({ kept: 12, faces: [12, 12], total: 17 })]).map(rowOf);
    expect(rows[0].drillIn?.[0].formula).toContain("1d20 (12, 12 — kept)");
  });

  it("keeps the nat-20 special case, showing the dropped face alongside it", () => {
    const rows = buildFeedItems([attackEvent({ kept: 20, faces: [20, 9], nat20: true, total: 25 })]).map(rowOf);
    expect(rows[0].drillIn?.[0].formula).toContain("1d20 (nat 20, 9 — higher kept)");
  });

  it("renders the single-face form when only one die was rolled (no advantage/disadvantage)", () => {
    const rows = buildFeedItems([attackEvent({ kept: 12, faces: [12], total: 17 })]).map(rowOf);
    const formula = rows[0].drillIn?.[0].formula;
    expect(formula).toContain("1d20 (12)");
    expect(formula).not.toContain("kept");
  });

  it("omits the Bonus addend when toHit.bonus is 0, includes it otherwise", () => {
    const zero = buildFeedItems([attackEvent({ bonus: 0 })]).map(rowOf);
    expect(zero[0].drillIn?.[0].formula).not.toContain("Bonus");
    const nonzero = buildFeedItems([attackEvent({ bonus: 5 })]).map(rowOf);
    expect(nonzero[0].drillIn?.[0].formula).toContain("+ 5 (Bonus)");
  });
});

describe("damage-type tone segments (#1237 color table)", () => {
  it("tags a physical damage word with damageType but no elemental hue applies (caller resolves to neutral ink)", () => {
    const events = [
      resolveEvent("swing", {
        source: "Shortsword",
        toHit: { faces: [12], kept: 12, nat20: false, bonus: 5, total: 17, verdict: "hit" },
        effect: { spec: "1d6 + 4", faces: [4], total: 8, type: "piercing", kind: "damage", crit: false },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    const word = rows[0].segments.find((s) => s.damageType === "piercing");
    expect(word).toBeDefined();
  });

  it("tags an elemental damage word (fire)", () => {
    const events = [
      resolveEvent("cast", {
        source: "Fire Bolt",
        toHit: { faces: [11], kept: 11, nat20: false, bonus: 7, total: 18, verdict: "hit" },
        effect: { spec: "2d10", faces: [5, 5], total: 10, type: "fire", kind: "damage", crit: false },
      }),
    ];
    const rows = buildFeedItems(events).map(rowOf);
    const word = rows[0].segments.find((s) => s.damageType === "fire");
    expect(word).toBeDefined();
  });
});

describe("buildFeedItems roll-run collapsing (#983, raised threshold #1237 §2)", () => {
  it("does NOT collapse 3 consecutive resolutions (Flurry of Blows) — all three stay visible", () => {
    const swings = [miss("s3", 13), miss("s2", 12), miss("s1", 11)];
    const items = buildFeedItems(swings);
    expect(items.filter((i) => i.kind === "rollRun")).toHaveLength(0);
    expect(items.filter((i) => i.kind === "row")).toHaveLength(3);
  });

  it("collapses a run of 5 consecutive resolutions, keeping the most recent 3 visible", () => {
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
      expect(runs[0].label).toBe("1 earlier resolution");
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
    expect(rows).toHaveLength(4); // 3 misses (below the collapse threshold) + "Combat began."
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

describe("buildFeedItems legacy roll events (#1830 — rendering retired, no dual-read)", () => {
  // Historical fixture only: useBonusAttackSheet's off-hand/flurry path
  // (#1845, out of #1827's scope) is the sole remaining attackRoll/damageRoll
  // writer now that the weapon (#1832) and spell (#1833) adapters both moved
  // onto resolveAction — this slice removed the feed's special-cased
  // rendering for the old events, so any that still exist fall back to the
  // plain summary row like any other unhandled event type. No merged-swing
  // behavior survives.
  it("falls back to the stored summary for a legacy attackRoll/damageRoll event", () => {
    const rows = buildFeedItems([
      makeEvent({
        id: "old-atk",
        type: "attackRoll",
        category: "roll",
        summary: "Longsword: 17 (1d20 + 5)",
        data: { kind: "attack", source: "Longsword", specLabel: "1d20 + 5", faces: [12], total: 17 },
      }),
      makeEvent({
        id: "old-dmg",
        type: "damageRoll",
        category: "roll",
        summary: "Longsword: 8 slashing",
        data: { kind: "damage", source: "Longsword", specLabel: "2d6", faces: [3, 5], total: 8 },
      }),
    ]).map(rowOf);
    expect(rows).toHaveLength(2); // no swingId pairing — each renders as its own plain row
    expect(text(rows[0])).toBe("Longsword: 8 slashing");
    expect(text(rows[1])).toBe("Longsword: 17 (1d20 + 5)");
  });
});

describe("buildFeedItems undefined-total guard (#1237 §5 — never render the literal 'undefined')", () => {
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

  it("falls back to 'Cast <summary>' rather than 'Cast undefined' when a resolveAction event carries no data at all", () => {
    const rows = buildFeedItems([
      makeEvent({ id: "bare", type: "resolveAction", category: "combat", summary: "Resolved Druidcraft (action)" }),
    ]).map(rowOf);
    expect(text(rows[0])).toBe("Cast Resolved Druidcraft (action).");
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
  "castSpell", "castAbilitySlot", "expendSlot", "restoreSlot",
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
  "resolveAction",
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
