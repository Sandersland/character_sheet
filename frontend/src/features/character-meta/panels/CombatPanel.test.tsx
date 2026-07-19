import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CombatPanel from "@/features/character-meta/panels/CombatPanel";
import { RollProvider } from "@/features/dice/RollContext";
import { fetchSessions } from "@/api/client";
import { useSessionDoorway } from "@/features/session/useSessionDoorway";
import type { SessionDoorwaySummary } from "@/features/session/sessionDoorwaySummary";
import type { RollResult } from "@/lib/dice";
import type { Character, Session } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyHitPointOperations: vi.fn(),
  applyConditionTransactions: vi.fn(),
  logRoll: vi.fn().mockResolvedValue(undefined),
  fetchSessions: vi.fn().mockResolvedValue([]),
  fetchSession: vi.fn().mockResolvedValue({ id: "s-old", events: [] }),
}));

// The doorway card reads useSessionDoorway directly; drive it to a "start" summary.
vi.mock("@/features/session/useSessionDoorway", () => ({ useSessionDoorway: vi.fn() }));

// Stub the 3D DiceRoller: the real one mounts a Three.js Canvas jsdom can't render.
vi.mock("@/features/dice/DiceRoller", () => ({
  default: function MockDiceRoller({
    onResult,
    spec,
  }: {
    onResult?: (r: RollResult) => void;
    spec?: { count: number; faces: number; modifier?: number };
  }) {
    useEffect(() => {
      const modifier = spec?.modifier ?? 0;
      onResult?.({
        dice: [{ value: 11, dropped: false }],
        modifier,
        total: 11 + modifier,
        spec: { count: 1, faces: 20, modifier },
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mock fires onResult once on mount; empty deps intentional
    }, []);
    return <div data-testid="dice-roller" />;
  },
}));

const START_SUMMARY: SessionDoorwaySummary = {
  visible: true,
  tone: "invite",
  label: "Start session",
  sub: null,
  action: "start",
};

const mockDoorway = vi.mocked(useSessionDoorway);
const mockFetchSessions = vi.mocked(fetchSessions);

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    conditions: { active: [], exhaustion: 0 },
    hitPoints: { current: 20, max: 22, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 2, die: "d10", spent: 0 },
    abilityScores: {
      strength: 10, dexterity: 10, constitution: 14,
      intelligence: 10, wisdom: 10, charisma: 10,
    },
    pendingLevelUps: 0,
    advancementSlots: { total: 0, used: 0 },
    rollModifiers: [],
    resistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    grantedAdvantages: [],
    ...overrides,
  } as unknown as Character;
}

function endedSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s-old",
    campaignId: null,
    status: "ended",
    startedAt: "2026-06-20T18:00:00.000Z",
    title: "The Sunless Citadel",
    ...overrides,
  } as Session;
}

function renderPanel(character: Character) {
  return rtlRender(
    <RollProvider characterId="char-1">
      <CombatPanel character={character} reference={null} onUpdate={() => {}} />
    </RollProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDoorway.mockReturnValue({
    ready: true,
    summary: START_SUMMARY,
    pending: false,
    error: null,
    onAction: vi.fn(),
    inActiveSession: false,
    activeSessionId: undefined,
    activeSession: null,
  });
  mockFetchSessions.mockResolvedValue([]);
});

describe("CombatPanel (idle #1086)", () => {
  it("renders the doorway card copy and a Start session button", () => {
    renderPanel(makeCharacter());
    expect(screen.getByText("No session live")).toBeInTheDocument();
    expect(
      screen.getByText(/Start a session to track turns, actions, and rolls/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start session" })).toBeInTheDocument();
  });

  it("renders Hit Points and Conditions", () => {
    renderPanel(makeCharacter());
    expect(screen.getByRole("heading", { name: "Hit Points" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Conditions" })).toBeInTheDocument();
  });

  it("renders the item-grants card when the character has granted defenses", () => {
    renderPanel(
      makeCharacter({
        conditionImmunities: [{ condition: "poisoned", source: "Amulet" }],
      } as Partial<Character>),
    );
    expect(screen.getByRole("heading", { name: "Resistances & Traits" })).toBeInTheDocument();
  });

  it("shows a one-line last-session log row and opens the log overlay on click", async () => {
    mockFetchSessions.mockResolvedValue([endedSession()]);
    const user = userEvent.setup();
    renderPanel(makeCharacter());

    const row = await screen.findByRole("button", { name: /open last session log/i });
    expect(row).toHaveTextContent("Last session · The Sunless Citadel");

    await user.click(row);
    // The overlay (BottomSheet on jsdom's default mobile) carries the log title.
    expect(await screen.findByRole("heading", { name: "Session Log" })).toBeInTheDocument();
  });

  it("hides the log row when there is no past session", async () => {
    mockFetchSessions.mockResolvedValue([]);
    renderPanel(makeCharacter());
    await waitFor(() => expect(mockFetchSessions).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /last session log/i })).toBeNull();
  });
});
