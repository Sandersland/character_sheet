import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { fetchLevelUpPlan, fetchReference, submitLevelUp } from "@/api/client";
import LevelUpCeremony from "@/features/level-up/LevelUpCeremony";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character, LevelUpPlanResponse, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchLevelUpPlan: vi.fn(),
  fetchReference: vi.fn(),
  submitLevelUp: vi.fn(),
  fetchManeuvers: vi.fn(async () => [
    { id: "m1", name: "Riposte", description: "riposte" },
    { id: "m2", name: "Trip Attack", description: "trip" },
    { id: "m3", name: "Menacing Attack", description: "menace" },
  ]),
  fetchFeats: vi.fn(async () => [
    { id: "archery", name: "Archery", description: "arch", category: "fighting_style" },
    { id: "defense", name: "Defense", description: "def", category: "fighting_style" },
  ]),
}));

const planMock = vi.mocked(fetchLevelUpPlan);
const refMock = vi.mocked(fetchReference);
const submitMock = vi.mocked(submitLevelUp);

// hitPoints/hitDice/abilityScores present because step 1 is the real HitPointsStep (#887).
// resources/advancements present because the real ChoiceStep (maneuvers) reads
// resources.maneuversKnown to filter already-known options (#1323 C1).
const character = {
  id: "c1",
  rulesEdition: "EDITION_2024",
  pendingLevelUps: 1,
  classes: [{ id: "entry-1", name: "Fighter", level: 2 }],
  resources: {},
  advancements: [],
  abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
  hitPoints: { current: 20, max: 20 },
  hitDice: { die: "d10", total: 2 },
} as unknown as Character;

// artisanTools is read by the toolProficiency choice config even though this
// suite doesn't reach that step — ChoiceStep's own factory returns only
// artisanTools and would break SubclassStep, which needs classes/subclasses.
const fighterReference = {
  races: [],
  backgrounds: [],
  alignments: [],
  artisanTools: [],
  classes: [
    {
      name: "Fighter",
      subclasses: [
        { id: "bm", name: "Battle Master", description: "Learn combat maneuvers fueled by superiority dice." },
        { id: "champ", name: "Champion", description: "Improved critical hits." },
      ],
    },
  ],
} as unknown as ReferenceData;

// The server re-plans around a pending subclass pick: choosing Battle Master
// inserts a maneuvers step (built by #896) between subclass and review.
// Keyed on the actual id (#1323 vacuity hazard) — Champion must NOT also
// insert the maneuvers step, or a "switch to Champion" leg exercises the
// wrong plan and the round-trip test proves nothing.
function planFor(subclassId: string | undefined): LevelUpPlanResponse {
  const subclass = subclassId === "bm" ? "Battle Master" : subclassId === "champ" ? "Champion" : null;
  return {
    target: { className: "Fighter", subclass, newLevel: 3, isPrimary: true },
    steps:
      subclassId === "bm"
        ? [{ kind: "hitPoints" }, { kind: "subclass" }, { kind: "maneuvers", count: 2 }, { kind: "review" }]
        : [{ kind: "hitPoints" }, { kind: "subclass" }, { kind: "review" }],
    grantedSpells: [],
  };
}

// LevelUpCeremony reads useCurrentCharacter(), so every render seeds the
// cache and mounts CurrentCharacterProvider via renderWithCharacter.
function renderCeremony() {
  return renderWithCharacter(
    <MemoryRouter initialEntries={["/characters/c1/level-up"]}>
      <Routes>
        <Route path="/characters/:id/level-up" element={<LevelUpCeremony />} />
        <Route path="/characters/:id" element={<div>SHEET</div>} />
      </Routes>
    </MemoryRouter>,
    character,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  planMock.mockImplementation((_id, _target, subclassId) => Promise.resolve(planFor(subclassId)));
  refMock.mockResolvedValue(fighterReference);
  submitMock.mockResolvedValue({} as Character);
});

describe("SubclassStep in the ceremony", () => {
  it("renders the real subclass cards (not the placeholder) on the subclass step", async () => {
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByRole("radio", { name: "Battle Master" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Champion" })).toBeInTheDocument();
    expect(screen.queryByText(/arrives in a later update/i)).not.toBeInTheDocument();
  });

  it("keeps Continue disabled until a subclass is picked", async () => {
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("radio", { name: "Battle Master" });

    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("re-plans with the chosen subclassId, growing the rail while staying on the subclass step", async () => {
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(await screen.findByRole("radio", { name: "Battle Master" }));

    await waitFor(() => expect(planMock).toHaveBeenCalledWith("c1", expect.anything(), "bm"));

    // Rail grew from 3 to 4 steps; player is still on the subclass step (step 2).
    await waitFor(() => expect(screen.getByText("Step 2 of 4")).toBeInTheDocument());
    const railLabels = screen.getAllByRole("listitem").map((li) => li.getAttribute("aria-label"));
    expect(railLabels).toEqual([
      "Step 1: Hit Points",
      "Step 2: Subclass",
      "Step 3: Maneuvers",
      "Step 4: Review",
    ]);
    expect(screen.getByRole("radio", { name: "Battle Master" })).toHaveAttribute("aria-checked", "true");
  });

  // #1323: the headline end-to-end case — maneuvers picked under Battle
  // Master must survive a detour to Champion and back, and never appear
  // stashed on the wire (AC 5/6 — nothing weaker than this test satisfies them,
  // since the stash here is genuinely non-empty across two visited subclasses).
  it("keeps maneuvers picked under Battle Master when the player switches away and back", async () => {
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await user.click(await screen.findByRole("radio", { name: "Battle Master" }));
    await waitFor(() => expect(screen.getByText("Step 2 of 4")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await user.click(await screen.findByText("Riposte"));
    await user.click(screen.getByText("Trip Attack"));

    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.click(await screen.findByRole("radio", { name: "Champion" }));
    // Champion carries no dependent steps — rail shrinks back to 3.
    await waitFor(() => expect(screen.getByText("Step 2 of 3")).toBeInTheDocument());

    await user.click(await screen.findByRole("radio", { name: "Battle Master" }));
    await waitFor(() => expect(screen.getByText("Step 2 of 4")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const riposte = await screen.findByText("Riposte");
    const tripAttack = screen.getByText("Trip Attack");
    expect(riposte.closest("button")).toHaveAttribute("aria-pressed", "true");
    expect(tripAttack.closest("button")).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(await screen.findByRole("button", { name: /confirm level up/i }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const body = submitMock.mock.calls[0][1];
    expect(body.maneuvers).toEqual([
      { type: "learnManeuver", maneuverId: "m1" },
      { type: "learnManeuver", maneuverId: "m2" },
    ]);
    // Object.keys, not toHaveBeenCalledWith: vitest's argument matcher uses
    // toEqual semantics, which treats a present-but-undefined key as absent.
    expect(Object.keys(body)).not.toContain("dependentPicksBySubclass");
  });
});
