import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import CharacterSheetPage from "@/pages/CharacterSheetPage";
import { fetchActiveSession, joinSession, startCampaignSession } from "@/api/client";
import { useCharacter } from "@/hooks/useCharacter";
import type { Character, Session } from "@/types/character";

// ── Mocks ──────────────────────────────────────────────────────────────────────
// Stub the data hooks + client; stub heavy sheet child components so the test
// targets only the header session button's state matrix (#245).

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock, useParams: () => ({ id: "c1" }) };
});

vi.mock("@/api/client", () => ({
  fetchActiveSession: vi.fn(),
  joinSession: vi.fn(),
  startCampaignSession: vi.fn(),
}));

vi.mock("@/hooks/useCharacter", () => ({ useCharacter: vi.fn() }));
vi.mock("@/hooks/useReferenceData", () => ({ useReferenceData: () => ({ reference: null }) }));
vi.mock("@/hooks/useCaptureHotkey", () => ({ useCaptureHotkey: () => {} }));

vi.mock("@/features/abilities/AbilityScoreBox", () => ({ default: () => null }));
vi.mock("@/features/dice/RollResultToast", () => ({ default: () => null }));
vi.mock("@/features/dice/RollModeToggle", () => ({ default: () => null }));
vi.mock("@/features/dice/RollContext", () => ({ RollProvider: ({ children }: { children: React.ReactNode }) => children }));
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
vi.mock("@/features/abilities/SkillsTable", () => ({ default: () => null }));
vi.mock("@/features/spells/SpellsSection", () => ({ default: () => null }));
vi.mock("@/features/abilities/ProficienciesCard", () => ({ default: () => null }));
vi.mock("@/features/character-meta/VitalsStrip", () => ({ default: () => null }));
vi.mock("@/features/conditions/ConditionsStrip", () => ({ default: () => null }));

const mockUseCharacter = vi.mocked(useCharacter);
const mockFetchActive = vi.mocked(fetchActiveSession);
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
    ...overrides,
  } as Character;
}

function activeSession(overrides: Partial<Session>): Session {
  return {
    id: "s1",
    campaignId: "camp1",
    status: "active",
    startedAt: "2026-06-22T18:00:00.000Z",
    participants: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCharacter.mockReturnValue({ character: makeCharacter({}), error: null, setCharacter: vi.fn() } as never);
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/characters/c1"]}>
      <CharacterSheetPage />
    </MemoryRouter>,
  );
}

describe("CharacterSheetPage header session button (#245)", () => {
  it("offers 'Join a campaign' when the character is in no campaign", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: undefined }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchActive.mockResolvedValue(null);

    renderPage();

    const link = await screen.findByRole("link", { name: /join a campaign/i });
    expect(link).toHaveAttribute("href", "/campaigns");
  });

  it("shows 'Start Session' when in a campaign with no active session", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: "camp1" }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchActive.mockResolvedValue(null);

    renderPage();
    expect(await screen.findByRole("button", { name: "Start Session" })).toBeInTheDocument();
  });

  it("shows 'Resume Session' when this character is an active participant", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: "camp1" }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchActive.mockResolvedValue(
      activeSession({ participants: [{ id: "p1", sessionId: "s1", characterId: "c1", joinedAt: "x", leftAt: null }] }),
    );

    renderPage();
    expect(await screen.findByRole("button", { name: "Resume Session" })).toBeInTheDocument();
  });

  it("shows 'Join Session' when an active session exists this character isn't in", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: "camp1" }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchActive.mockResolvedValue(
      activeSession({ participants: [{ id: "p2", sessionId: "s1", characterId: "other", joinedAt: "x", leftAt: null }] }),
    );

    renderPage();
    const button = await screen.findByRole("button", { name: "Join Session" });
    button.click();
    await waitFor(() => expect(mockJoin).toHaveBeenCalledWith("camp1", "s1", "c1"));
    expect(navigateMock).toHaveBeenCalledWith("/characters/c1/session");
  });

  it("treats a left participant as not-joined ('Join Session')", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: "camp1" }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchActive.mockResolvedValue(
      activeSession({ participants: [{ id: "p1", sessionId: "s1", characterId: "c1", joinedAt: "x", leftAt: "y" }] }),
    );

    renderPage();
    expect(await screen.findByRole("button", { name: "Join Session" })).toBeInTheDocument();
  });

  it("starts a session when 'Start Session' is clicked", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: "camp1" }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchActive.mockResolvedValue(null);
    mockStart.mockResolvedValue({ session: activeSession({}), character: makeCharacter({ campaignId: "camp1" }) });

    renderPage();
    const button = await screen.findByRole("button", { name: "Start Session" });
    button.click();
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith("camp1", "c1"));
    expect(navigateMock).toHaveBeenCalledWith("/characters/c1/session");
  });

  it("surfaces an error and does not navigate when starting a session fails", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: "camp1" }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchActive.mockResolvedValue(null);
    mockStart.mockRejectedValue(new Error("Character already in a campaign"));

    renderPage();
    const button = await screen.findByRole("button", { name: "Start Session" });
    button.click();

    expect(await screen.findByText("Character already in a campaign")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("opens the quick-capture palette when the visible '＋ Note' button is clicked (#274)", async () => {
    mockUseCharacter.mockReturnValue({
      character: makeCharacter({ campaignId: "camp1" }),
      error: null,
      setCharacter: vi.fn(),
    } as never);
    mockFetchActive.mockResolvedValue(null);

    renderPage();

    // Palette is closed until the button is pressed — no keyboard shortcut needed.
    expect(screen.queryByText("capture-palette-open")).not.toBeInTheDocument();
    const noteButton = await screen.findByRole("button", { name: /note/i });
    noteButton.click();
    expect(await screen.findByText("capture-palette-open")).toBeInTheDocument();
  });
});
