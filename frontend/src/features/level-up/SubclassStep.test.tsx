import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchReference } from "@/api/client";
import SubclassStep from "@/features/level-up/SubclassStep";
import { LevelUpStepContext, type LevelUpStepContextValue } from "@/features/level-up/useLevelUpStepContext";
import { axe } from "@/test/axe";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpPlanResponse, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchReference: vi.fn() }));
const refMock = vi.mocked(fetchReference);

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
        { id: "champ", name: "Champion", description: "Improved critical hits and raw physical prowess." },
        { id: "ek", name: "Eldritch Knight", description: "Blend martial skill with wizard spells." },
      ],
    },
  ],
} as unknown as ReferenceData;

const plan: LevelUpPlanResponse = {
  target: { className: "Fighter", subclass: null, newLevel: 3, isPrimary: true },
  steps: [{ kind: "subclass" }],
  grantedSpells: [],
};

// Live harness: a real useState draft so aria-checked reflects clicks. Pass a
// `setDraft` spy to instead pin the draft and assert the updater in isolation.
function renderStep({ draft: initial, setDraft }: { draft?: LevelUpDraft; setDraft?: LevelUpStepContextValue["setDraft"] } = {}) {
  const seed = initial ?? { hp: { method: "average" } };
  function Harness() {
    const [liveDraft, liveSetDraft] = useState<LevelUpDraft>(seed);
    const value: LevelUpStepContextValue = {
      character: { id: "c1", rulesEdition: "EDITION_2024" } as Character,
      plan,
      draft: setDraft ? seed : liveDraft,
      setDraft: setDraft ?? liveSetDraft,
      target: { kind: "existing", classEntryId: "entry-1" },
    };
    return (
      <LevelUpStepContext.Provider value={value}>
        <SubclassStep />
      </LevelUpStepContext.Provider>
    );
  }
  return render(<Harness />);
}

beforeEach(() => {
  vi.clearAllMocks();
  refMock.mockResolvedValue(fighterReference);
});

describe("SubclassStep", () => {
  it("renders every subclass for the plan's class with its description", async () => {
    renderStep();
    await waitFor(() => expect(screen.getByRole("radio", { name: "Battle Master" })).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: "Champion" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Eldritch Knight" })).toBeInTheDocument();
    expect(screen.getByText(/superiority dice/i)).toBeInTheDocument();
    expect(screen.getByText(/wizard spells/i)).toBeInTheDocument();
  });

  it("writes the picked subclassId to the draft on click", async () => {
    const setDraft = vi.fn();
    renderStep({ draft: { hp: { method: "average" } }, setDraft });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("radio", { name: "Battle Master" }));

    expect(setDraft).toHaveBeenCalledTimes(1);
    const updater = setDraft.mock.calls[0][0] as (d: LevelUpDraft) => LevelUpDraft;
    expect(updater({ hp: { method: "average" } })).toMatchObject({ subclassId: "bm" });
  });

  it("reflects the current selection via aria-checked (controlled)", async () => {
    renderStep();
    const user = userEvent.setup();

    const champion = await screen.findByRole("radio", { name: "Champion" });
    expect(champion).toHaveAttribute("aria-checked", "false");

    await user.click(champion);
    expect(screen.getByRole("radio", { name: "Champion" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Battle Master" })).toHaveAttribute("aria-checked", "false");
  });

  it("clears dependent picks when the subclass changes from a prior different pick", async () => {
    const setDraft = vi.fn();
    renderStep({
      draft: { hp: { method: "average" }, subclassId: "ek", maneuvers: [{ maneuverId: "x" }] as never },
      setDraft,
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("radio", { name: "Battle Master" }));

    const updater = setDraft.mock.calls[0][0] as (d: LevelUpDraft) => LevelUpDraft;
    const next = updater({ hp: { method: "average" }, subclassId: "ek", maneuvers: [{ maneuverId: "x" }] as never });
    expect(next.subclassId).toBe("bm");
    expect(next.maneuvers).toBeUndefined();
  });

  it("shows an empty state when the class has no subclasses", async () => {
    refMock.mockResolvedValue({
      races: [],
      backgrounds: [],
      alignments: [],
      artisanTools: [],
      classes: [{ name: "Fighter", subclasses: [] }],
    } as unknown as ReferenceData);
    renderStep();
    expect(await screen.findByText(/no subclasses available/i)).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderStep();
    await screen.findByRole("radio", { name: "Battle Master" });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("SubclassStep — radiogroup keyboard nav (#1111)", () => {
  async function findRadios() {
    return [
      await screen.findByRole("radio", { name: "Battle Master" }),
      screen.getByRole("radio", { name: "Champion" }),
      screen.getByRole("radio", { name: "Eldritch Knight" }),
    ];
  }

  it("falls back to the first card for Tab focus when none is checked yet", async () => {
    renderStep();
    const radios = await findRadios();
    expect(radios[0]).toHaveAttribute("tabindex", "0");
    radios.slice(1).forEach((r) => expect(r).toHaveAttribute("tabindex", "-1"));
  });

  it("moves the roving tabIndex to the checked card once one is chosen", async () => {
    renderStep();
    const user = userEvent.setup();
    const radios = await findRadios();
    await user.click(radios[1]);
    radios.forEach((r) => expect(r).toHaveAttribute("tabindex", r === radios[1] ? "0" : "-1"));
  });

  it("keeps only one card in the tab order", async () => {
    renderStep();
    const radios = await findRadios();
    const tabbable = radios.filter((r) => r.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
  });

  it("lets Tab enter the group once and leave it on the next Tab", async () => {
    renderStep();
    const user = userEvent.setup();
    const radios = await findRadios();
    document.body.focus();

    await user.tab();
    expect(document.activeElement).toBe(radios[0]);

    await user.tab();
    expect(radios).not.toContain(document.activeElement);
  });

  it("ArrowRight/ArrowDown move focus and selection forward, wrapping at the end", async () => {
    renderStep();
    const user = userEvent.setup();
    const radios = await findRadios();
    radios[0].focus();

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(radios[1]);
    expect(radios[1]).toHaveAttribute("aria-checked", "true");

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(radios[2]);
    expect(radios[2]).toHaveAttribute("aria-checked", "true");

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(radios[0]);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
  });

  it("ArrowLeft/ArrowUp move focus and selection backward, wrapping at the start", async () => {
    renderStep();
    const user = userEvent.setup();
    const radios = await findRadios();
    radios[0].focus();

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(radios[2]);
    expect(radios[2]).toHaveAttribute("aria-checked", "true");

    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(radios[1]);
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
  });
});
