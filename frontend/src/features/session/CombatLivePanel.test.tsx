import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CombatLivePanel from "@/features/session/CombatLivePanel";
import { useLiveSession } from "@/features/session/LiveSessionProvider";
import { useTurnStateContext } from "@/features/session/TurnStateProvider";
import { fetchSession } from "@/api/client";
import type { Character, Session } from "@/types/character";

// Mock the turn engine + session log so this targets CombatLivePanel's layout
// (the CombatColumn parity + the log overlay), not the turn machinery.
vi.mock("@/features/session/TurnHub", () => ({
  default: ({ onOpenLog }: { onOpenLog?: () => void }) => (
    <div data-testid="turn-hub">
      <button type="button" onClick={onOpenLog}>
        hub-open-log
      </button>
    </div>
  ),
}));
vi.mock("@/features/session/SessionLog", () => ({
  default: ({ refreshKey }: { refreshKey?: unknown }) => <div>session-log refresh:{String(refreshKey)}</div>,
}));
vi.mock("@/api/client", () => ({
  fetchSession: vi.fn().mockResolvedValue({ id: "sess-1", events: [] }),
  fetchSessions: vi.fn().mockResolvedValue([]),
  applyConditionTransactions: vi.fn(),
}));
vi.mock("@/features/session/LiveSessionProvider", () => ({ useLiveSession: vi.fn() }));
vi.mock("@/features/session/TurnStateProvider", () => ({ useTurnStateContext: vi.fn() }));

const mockLive = vi.mocked(useLiveSession);
const mockTurn = vi.mocked(useTurnStateContext);
const mockFetchSession = vi.mocked(fetchSession);

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    conditions: { active: [], exhaustion: 0 },
    hitPoints: { current: 34, max: 52, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 7, die: "d10", spent: 0 },
    abilityScores: {
      strength: 10, dexterity: 10, constitution: 14,
      intelligence: 10, wisdom: 10, charisma: 10,
    },
    rollModifiers: [],
    resistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    grantedAdvantages: [],
    ...overrides,
  } as unknown as Character;
}

const session = { id: "sess-1", campaignId: null, status: "active", startedAt: "x", participants: [] } as unknown as Session;

// The compact HP card is desktop-only; force md+ so it (and DesktopUtilityLine)
// render. jsdom's default matchMedia stub reports mobile.
function forceDesktop() {
  window.matchMedia = ((query: string) =>
    ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList);
}

let originalMatchMedia: typeof window.matchMedia;

beforeEach(() => {
  vi.clearAllMocks();
  originalMatchMedia = window.matchMedia;
  mockTurn.mockReturnValue({} as never);
  mockLive.mockReturnValue({
    logRefresh: 0,
    bumpLog: vi.fn(),
  } as never);
  mockFetchSession.mockResolvedValue({ id: "sess-1", events: [] } as never);
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

function renderPanel(active = true) {
  return render(
    <CombatLivePanel character={makeCharacter()} session={session} onUpdate={vi.fn()} active={active} />,
  );
}

describe("CombatLivePanel (#1086)", () => {
  it("renders the turn tracker inside the shared combat-turn slot", () => {
    renderPanel();
    const turnSlot = screen.getByTestId("combat-turn");
    expect(turnSlot).toContainElement(screen.getByTestId("turn-hub"));
  });

  it("drops the complementary abilities/skills rail", () => {
    renderPanel();
    expect(
      screen.queryByLabelText(/ability checks, saves, and skills/i),
    ).not.toBeInTheDocument();
  });

  it("has no persistent Session Log card while the overlay is closed", () => {
    renderPanel();
    expect(screen.queryByText(/^session-log/)).not.toBeInTheDocument();
  });

  it("carries one compact HP card with an accessible name on desktop", () => {
    forceDesktop();
    renderPanel();
    const hpButtons = screen.getAllByRole("button", { name: /manage hit points: 34 of 52/i });
    expect(hpButtons).toHaveLength(1);
  });

  it("opens the log overlay from the one-line log row", async () => {
    const user = userEvent.setup();
    renderPanel();
    const row = await screen.findByRole("button", { name: /open session log/i });
    await user.click(row);
    expect(await screen.findByText(/^session-log/)).toBeInTheDocument();
  });

  it("opens the same log overlay from the turn hub", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "hub-open-log" }));
    expect(await screen.findByText(/^session-log/)).toBeInTheDocument();
  });

  it("keeps the overlay closed while the Combat tab is not the active tab", async () => {
    const user = userEvent.setup();
    renderPanel(false);
    await user.click(screen.getByRole("button", { name: "hub-open-log" }));
    expect(screen.queryByText(/^session-log/)).not.toBeInTheDocument();
  });

  it("threads the shared logRefresh counter into the overlay SessionLog", async () => {
    mockLive.mockReturnValue({ logRefresh: 5, bumpLog: vi.fn() } as never);
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "hub-open-log" }));
    expect(await screen.findByText("session-log refresh:5")).toBeInTheDocument();
  });
});
