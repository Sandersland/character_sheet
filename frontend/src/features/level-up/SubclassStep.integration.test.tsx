import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { fetchLevelUpPlan, fetchReference } from "@/api/client";
import LevelUpCeremony from "@/features/level-up/LevelUpCeremony";
import type { Character, LevelUpPlanResponse, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchLevelUpPlan: vi.fn(),
  fetchReference: vi.fn(),
  submitLevelUp: vi.fn(),
}));

const planMock = vi.mocked(fetchLevelUpPlan);
const refMock = vi.mocked(fetchReference);

const character = {
  id: "c1",
  pendingLevelUps: 1,
  classes: [{ id: "entry-1", name: "Fighter", level: 2 }],
} as unknown as Character;

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
function planFor(subclassId: string | undefined): LevelUpPlanResponse {
  return {
    target: {
      className: "Fighter",
      subclass: subclassId ? "Battle Master" : null,
      newLevel: 3,
      isPrimary: true,
    },
    steps: subclassId
      ? [{ kind: "hitPoints" }, { kind: "subclass" }, { kind: "maneuvers", count: 2 }, { kind: "review" }]
      : [{ kind: "hitPoints" }, { kind: "subclass" }, { kind: "review" }],
  };
}

function renderCeremony() {
  return render(
    <MemoryRouter initialEntries={["/characters/c1/level-up"]}>
      <Routes>
        <Route path="/characters/:id/level-up" element={<LevelUpCeremony character={character} />} />
        <Route path="/characters/:id" element={<div>SHEET</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  planMock.mockImplementation((_id, _target, subclassId) => Promise.resolve(planFor(subclassId)));
  refMock.mockResolvedValue(fighterReference);
});

describe("SubclassStep in the ceremony", () => {
  it("renders the real subclass cards (not the placeholder) on the subclass step", async () => {
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByRole("radio", { name: "Battle Master" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Champion" })).toBeInTheDocument();
    expect(screen.queryByText(/arrives in a later update/i)).not.toBeInTheDocument();
  });

  it("keeps Continue disabled until a subclass is picked", async () => {
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("radio", { name: "Battle Master" });

    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("re-plans with the chosen subclassId, growing the rail while staying on the subclass step", async () => {
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
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
});
