import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import SessionLog, { TYPE_LABEL } from "@/features/session/SessionLog";
import { fetchSession } from "@/api/client";
import type { CharacterEvent, CharacterEventType } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchSession: vi.fn(),
}));

const mockFetchSession = vi.mocked(fetchSession);

beforeEach(() => {
  vi.clearAllMocks();
});

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

function renderWith(events: CharacterEvent[]) {
  mockFetchSession.mockResolvedValue({ events } as never);
  return render(<SessionLog characterId="char-1" sessionId="sess-1" refreshKey={0} />);
}

describe("SessionLog roll breakdown", () => {
  it("shows the raw die breakdown for a roll event with faces", async () => {
    renderWith([
      makeEvent({
        type: "attackRoll",
        summary: "Longsword: 17 (1d20 + 5)",
        data: { source: "Longsword", total: 17, specLabel: "1d20 + 5", faces: [12] },
      }),
    ]);

    expect(await screen.findByText("Longsword: 17 (1d20 (12) + 5)")).toBeInTheDocument();
  });

  it("includes damage type and multi-die faces", async () => {
    renderWith([
      makeEvent({
        id: "evt-dmg",
        type: "damageRoll",
        summary: "Longsword: 8 slashing (2d6)",
        data: {
          source: "Longsword",
          total: 8,
          specLabel: "2d6",
          damageType: "slashing",
          faces: [3, 5],
        },
      }),
    ]);

    expect(await screen.findByText("Longsword: 8 slashing (2d6 (3, 5))")).toBeInTheDocument();
  });

  it("names the recipient on a DM loot award event (#382)", async () => {
    renderWith([
      makeEvent({
        id: "evt-loot",
        category: "inventory",
        type: "awarded",
        summary: "Awarded Flametongue ×2",
        data: { itemName: "Flametongue", quantityDelta: 2, recipientName: "Bruenor" },
      }),
    ]);

    expect(await screen.findByText("Awarded Flametongue ×2 → Bruenor")).toBeInTheDocument();
    expect(screen.getByText("loot")).toBeInTheDocument();
  });

  // #962: the Combat Turn/Log sub-nav mounts the log on demand, so it renders
  // without a refreshKey — each mount refetches on its own.
  it("fetches and renders with no refreshKey prop", async () => {
    mockFetchSession.mockResolvedValue({
      events: [makeEvent({ summary: "Longsword: 17 (1d20 + 5)" })],
    } as never);

    render(<SessionLog characterId="char-1" sessionId="sess-1" />);

    expect(await screen.findByText(/Longsword: 17/)).toBeInTheDocument();
    expect(mockFetchSession).toHaveBeenCalledWith("char-1", "sess-1");
  });

  // #964: both live-Combat call sites stay mounted and pass the shared
  // logRefresh counter, so bumping refreshKey must re-fetch (a stale mounted log
  // was the review regression this guards).
  it("re-fetches when refreshKey changes", async () => {
    mockFetchSession.mockResolvedValue({ events: [] } as never);

    const { rerender } = render(
      <SessionLog characterId="char-1" sessionId="sess-1" refreshKey={0} />,
    );
    await waitFor(() => expect(mockFetchSession).toHaveBeenCalledTimes(1));

    rerender(<SessionLog characterId="char-1" sessionId="sess-1" refreshKey={1} />);
    await waitFor(() => expect(mockFetchSession).toHaveBeenCalledTimes(2));
  });

  it("falls back to the stored summary for old events without faces", async () => {
    renderWith([
      makeEvent({
        type: "attackRoll",
        summary: "Longsword: 17 (1d20 + 5)",
        data: { source: "Longsword", total: 17, specLabel: "1d20 + 5", faces: null },
      }),
    ]);

    expect(await screen.findByText("Longsword: 17 (1d20 + 5)")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/\(1d20 \(/)).not.toBeInTheDocument(),
    );
  });
});

// Every event type in the frontend union, kept exhaustive by the compile-time
// guard below — omit one and typecheck fails, forcing this list (and the
// coverage assertion) current. (#983)
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

// Fails typecheck if ALL_EVENT_TYPES omits any CharacterEventType member.
type _Complete =
  Exclude<CharacterEventType, (typeof ALL_EVENT_TYPES)[number]> extends never ? true : never;

describe("SessionLog TYPE_LABEL coverage", () => {
  it("has an explicit label for every event type (no silent humanizer reliance)", () => {
    const complete: _Complete = true;
    expect(complete).toBe(true);
    for (const type of ALL_EVENT_TYPES) {
      expect(TYPE_LABEL[type], `TYPE_LABEL is missing an explicit entry for "${type}"`).toBeDefined();
    }
  });
});

describe("SessionLog event labels", () => {
  it("labels initiativeRoll and conditionApplied without leaking the raw key", async () => {
    renderWith([
      makeEvent({ id: "i", category: "roll", type: "initiativeRoll", summary: "Initiative: 14" }),
      makeEvent({ id: "c", category: "conditions", type: "conditionApplied", summary: "Poisoned" }),
    ]);

    expect(await screen.findByText("initiative")).toBeInTheDocument();
    expect(screen.getByText("condition")).toBeInTheDocument();
    expect(screen.queryByText("initiativeRoll")).not.toBeInTheDocument();
    expect(screen.queryByText("conditionApplied")).not.toBeInTheDocument();
  });

  it("humanizes an unmapped event type instead of leaking the camelCase key", async () => {
    renderWith([
      makeEvent({ id: "x", category: "class", type: "someFutureType" as CharacterEventType, summary: "A future thing" }),
    ]);

    expect(await screen.findByText("some future type")).toBeInTheDocument();
    expect(screen.queryByText("someFutureType")).not.toBeInTheDocument();
  });
});

describe("SessionLog roll-run collapsing", () => {
  it("collapses 12 consecutive initiative rolls to one row plus an expandable disclosure", async () => {
    const rolls = Array.from({ length: 12 }, (_, i) =>
      makeEvent({
        id: `init-${i}`,
        category: "roll",
        type: "initiativeRoll",
        summary: `Initiative: ${20 - i}`,
      }),
    );
    renderWith(rolls);

    // Only the newest initiative row is visible; the rest hide behind a disclosure.
    expect(await screen.findByText("Initiative: 20")).toBeInTheDocument();
    expect(screen.queryByText("Initiative: 19")).not.toBeInTheDocument();
    expect(screen.queryByText("Initiative: 9")).not.toBeInTheDocument();

    const disclosure = screen.getByText(/11 earlier initiative rolls/);
    fireEvent.click(disclosure);

    // Expanding reveals every hidden row.
    expect(await screen.findByText("Initiative: 19")).toBeInTheDocument();
    expect(screen.getByText("Initiative: 9")).toBeInTheDocument();
  });

  it("breaks the run on an interleaved non-roll event and leaves other types untouched", async () => {
    renderWith([
      makeEvent({ id: "i1", category: "roll", type: "initiativeRoll", summary: "Initiative: 18" }),
      makeEvent({ id: "i2", category: "roll", type: "initiativeRoll", summary: "Initiative: 15" }),
      makeEvent({ id: "d1", category: "hitPoints", type: "damage", summary: "Took 5 damage" }),
      makeEvent({ id: "i3", category: "roll", type: "initiativeRoll", summary: "Initiative: 12" }),
      makeEvent({ id: "i4", category: "roll", type: "initiativeRoll", summary: "Initiative: 10" }),
    ]);

    // Two separate 2-long runs, each collapsed independently around the damage row.
    expect(await screen.findByText("Initiative: 18")).toBeInTheDocument();
    expect(screen.getByText("Took 5 damage")).toBeInTheDocument();
    expect(screen.getByText("Initiative: 12")).toBeInTheDocument();
    expect(screen.queryByText("Initiative: 15")).not.toBeInTheDocument();
    expect(screen.queryByText("Initiative: 10")).not.toBeInTheDocument();
    expect(screen.getAllByText(/1 earlier initiative rolls/)).toHaveLength(2);
  });

  it("does not collapse consecutive non-roll events", async () => {
    renderWith([
      makeEvent({ id: "d1", category: "hitPoints", type: "damage", summary: "Took 5 damage" }),
      makeEvent({ id: "d2", category: "hitPoints", type: "damage", summary: "Took 3 damage" }),
    ]);

    expect(await screen.findByText("Took 5 damage")).toBeInTheDocument();
    expect(screen.getByText("Took 3 damage")).toBeInTheDocument();
    expect(screen.queryByText(/earlier/)).not.toBeInTheDocument();
  });
});
