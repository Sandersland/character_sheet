import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import CharacterSheetPage from "@/pages/CharacterSheetPage";
import { fetchSessionDoorway, joinSession, startCampaignSession } from "@/api/client";
import { useCharacter } from "@/hooks/useCharacter";
import type { Character, SessionDoorwayState, SessionDoorwaySessionState } from "@/types/character";

// Stub the data hooks + client; stub heavy sheet child components so the test
// targets only the session doorway's state matrix (#942, formerly the header
// session button #245).

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock, useParams: () => ({ id: "c1" }) };
});

vi.mock("@/api/client", () => ({
  fetchSessionDoorway: vi.fn(),
  fetchActiveSession: vi.fn().mockResolvedValue(null),
  joinSession: vi.fn(),
  startCampaignSession: vi.fn(),
}));

vi.mock("@/hooks/useCharacter", () => ({ useCharacter: vi.fn() }));
vi.mock("@/hooks/useReferenceData", () => ({ useReferenceData: () => ({ reference: null }) }));
vi.mock("@/hooks/useCaptureHotkey", () => ({ useCaptureHotkey: () => {} }));

vi.mock("@/features/abilities/AbilityScoreBox", () => ({ default: () => null }));
vi.mock("@/features/dice/RollResultSeal", () => ({ default: () => null }));
vi.mock("@/features/dice/RollContext", () => ({ RollProvider: ({ children }: { children: React.ReactNode }) => children }));
// The turn-state provider is orthogonal to the doorway states under test; stub it
// so its useTurnState call doesn't need a full combat-ready character fixture.
vi.mock("@/features/session/TurnStateProvider", () => ({
  TurnStateProvider: ({ children }: { children: React.ReactNode }) => children,
  useTurnStateContext: () => null,
}));
vi.mock("@/features/character-meta/ActivityModal", () => ({ default: () => null }));
vi.mock("@/features/advancement/AdvancementSection", () => ({ default: () => null }));
vi.mock("@/features/character-meta/BackendStatus", () => ({ default: () => null }));
vi.mock("@/features/campaign/CampaignIndicator", () => ({ default: () => null }));
vi.mock("@/features/class/ClassFeaturesSection", () => ({ default: () => null }));
vi.mock("@/features/character-meta/DeleteCharacterModal", () => ({ default: () => null }));
vi.mock("@/features/experience/ExperienceTracker", () => ({ default: () => null }));
vi.mock("@/features/hitpoints/HitPointTracker", () => ({ default: () => null }));
vi.mock("@/features/inventory/InventoryList", () => ({ default: () => null }));
vi.mock("@/features/journal/JournalDoorway", () => ({ default: () => null }));
vi.mock("@/features/journal/CapturePalette", () => ({
  default: () => <div>capture-palette-open</div>,
}));
vi.mock("@/features/session/SessionsModal", () => ({ default: () => null }));
vi.mock("@/features/abilities/AllSkillsCard", () => ({ default: () => null }));
vi.mock("@/features/spells/SpellSlotSummary", () => ({ default: () => null }));
vi.mock("@/features/inventory/EquippedItemsCard", () => ({ default: () => null }));
vi.mock("@/features/spells/SpellsSection", () => ({ default: () => null }));
vi.mock("@/features/abilities/ProficienciesCard", () => ({ default: () => null }));
vi.mock("@/features/character-meta/BannerVitals", () => ({ default: () => null }));
// Stub the mobile mini-header (the desktop banner keeps the campaign-less link).
vi.mock("@/features/character-meta/MobileSheetHeader", () => ({ default: () => null }));
vi.mock("@/features/character-meta/MobileQuickBar", () => ({ default: () => null }));
vi.mock("@/features/conditions/ConditionsStrip", () => ({ default: () => null }));

const mockUseCharacter = vi.mocked(useCharacter);
const mockFetchDoorway = vi.mocked(fetchSessionDoorway);
const mockJoin = vi.mocked(joinSession);
const mockStart = vi.mocked(startCampaignSession);

function makeCharacter(overrides: Partial<Character>): Character {
  return {
    id: "c1",
    name: "Aldric",
    race: "Human",
    class: "Fighter",
    background: "Soldier",
    alignment: "Lawful Good",
    level: 3,
    proficiencyBonus: 2,
    abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
    savingThrowProficiencies: [],
    toolProficiencies: [],
    advancements: [],
    advancementSlots: { total: 0, used: 0 },
    rollModifiers: [],
    ...overrides,
  } as Character;
}

function liveSession(overrides: Partial<SessionDoorwaySessionState> = {}): SessionDoorwaySessionState {
  return {
    id: "s1",
    status: "active",
    startedAt: "2026-06-22T18:00:00.000Z",
    scheduledAt: null,
    title: "Night One",
    joined: true,
    round: null,
    ...overrides,
  };
}

function doorwayState(overrides: Partial<SessionDoorwayState>): SessionDoorwayState {
  return {
    campaignId: "camp1",
    role: "PLAYER",
    canStart: true,
    kind: "none",
    session: null,
    ...overrides,
  };
}

// The doorway renders in two placements (mobile + desktop); jsdom applies no
// Tailwind CSS, so both are present. Assert/act on the first instance.
async function findDoorwayButton(name: RegExp) {
  const buttons = await screen.findAllByRole("button", { name });
  return buttons[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCharacter.mockReturnValue({ character: makeCharacter({}), error: null, setCharacter: vi.fn() } as never);
  mockFetchDoorway.mockResolvedValue(doorwayState({ campaignId: null, canStart: false }));
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/characters/c1"]}>
      <CharacterSheetPage />
    </MemoryRouter>,
  );
}

describe("CharacterSheetPage session doorway (#942)", () => {
  it("hides the doorway and offers 'Join a campaign' when the character is in no campaign", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: undefined }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchDoorway.mockResolvedValue(doorwayState({ campaignId: null, canStart: false }));

    renderPage();

    const link = await screen.findByRole("link", { name: /join a campaign/i });
    expect(link).toHaveAttribute("href", "/campaigns");
    // No session doorway button for a campaign-less character (the banner's
    // "Sessions" action is a different control).
    expect(
      screen.queryByRole("button", { name: /(start|resume|join) session/i }),
    ).not.toBeInTheDocument();
  });

  it("shows 'Start session' when in a campaign with no active session", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: "camp1" }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchDoorway.mockResolvedValue(doorwayState({ kind: "none", canStart: true }));

    renderPage();
    expect(await findDoorwayButton(/start session/i)).toBeInTheDocument();
  });

  it("shows the live-session 'Go to fight' strip when this character is an active participant (#961)", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: "camp1" }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchDoorway.mockResolvedValue(doorwayState({ kind: "liveJoined", session: liveSession({ joined: true }) }));

    renderPage();
    // Off Combat + live-joined → the "Go to fight" strip (in-workspace jump),
    // superseding the old "Resume session" doorway (which navigated away).
    expect(await findDoorwayButton(/go to fight/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resume session/i })).not.toBeInTheDocument();
  });

  it("shows and dispatches 'Join session' when an active session exists this character isn't in", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: "camp1" }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchDoorway.mockResolvedValue(
      doorwayState({ kind: "liveNotJoined", session: liveSession({ joined: false }) }),
    );

    renderPage();
    const button = await findDoorwayButton(/join session/i);
    button.click();
    await waitFor(() => expect(mockJoin).toHaveBeenCalledWith("camp1", "s1", "c1"));
    // #963: jumps to the Combat tab in-workspace, never navigates to /session.
    expect(navigateMock).not.toHaveBeenCalledWith("/characters/c1/session");
  });

  it("starts a session when 'Start session' is clicked", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: "camp1" }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchDoorway.mockResolvedValue(doorwayState({ kind: "none", canStart: true }));
    mockStart.mockResolvedValue({ session: { id: "s1", campaignId: "camp1", status: "active", startedAt: "x" }, character: makeCharacter({ campaignId: "camp1" }) });

    renderPage();
    const button = await findDoorwayButton(/start session/i);
    button.click();
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith("camp1", "c1"));
    // #963: lands on the Combat tab in-workspace, never navigates to /session.
    expect(navigateMock).not.toHaveBeenCalledWith("/characters/c1/session");
  });

  it("surfaces an error and does not navigate when starting a session fails", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: "camp1" }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchDoorway.mockResolvedValue(doorwayState({ kind: "none", canStart: true }));
    mockStart.mockRejectedValue(new Error("Character already in a campaign"));

    renderPage();
    const button = await findDoorwayButton(/start session/i);
    button.click();

    expect(await screen.findAllByText("Character already in a campaign")).not.toHaveLength(0);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("opens the quick-capture palette when the visible '＋ Note' button is clicked (#274)", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: "camp1" }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchDoorway.mockResolvedValue(doorwayState({ kind: "none", canStart: true }));

    renderPage();

    // Palette is closed until the button is pressed — no keyboard shortcut needed.
    expect(screen.queryByText("capture-palette-open")).not.toBeInTheDocument();
    const noteButton = await screen.findByRole("button", { name: /note/i });
    noteButton.click();
    expect(await screen.findByText("capture-palette-open")).toBeInTheDocument();
  });
});
