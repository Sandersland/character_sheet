import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as client from "@/api/client";
import AdvancementPanel from "@/features/advancement/AdvancementPanel";
import { ABILITY_OPTIONS } from "@/lib/abilities";
import { axe } from "@/test/axe";
import type { CatalogFeat } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchFeats: vi.fn().mockResolvedValue([]),
}));

const noop = () => {};

const SCORES: Record<string, number> = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
};

describe("AdvancementPanel accessibility", () => {
  it("names every ASI stepper button (no axe violations)", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AdvancementPanel
        currentScores={SCORES}
        slotsRemaining={2}
        busy={false}
        characterLevel={4}
        rulesEdition="EDITION_2014"
        skillNames={[]}
        onSubmit={noop}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "+ Choose advancement" })
    );

    for (const { label } of ABILITY_OPTIONS) {
      expect(
        screen.getByRole("button", { name: `Increase ${label}` })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `Decrease ${label}` })
      ).toBeInTheDocument();
    }

    expect(await axe(container)).toHaveNoViolations();
  });
});

function catalogFeat(partial: Partial<CatalogFeat>): CatalogFeat {
  return {
    id: "f",
    name: "Feat",
    description: "A feat.",
    category: "general",
    abilityOptions: [],
    abilityIncrease: 0,
    improvements: [],
    ...partial,
  } as CatalogFeat;
}

function renderPanel(characterLevel: number) {
  return render(
    <AdvancementPanel
      currentScores={SCORES}
      slotsRemaining={1}
      busy={false}
      characterLevel={characterLevel}
      rulesEdition="EDITION_2024"
      skillNames={[]}
      onSubmit={noop}
    />
  );
}

async function openFeatTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "+ Choose advancement" }));
  await user.click(screen.getByRole("button", { name: "Feat" }));
}

describe("AdvancementPanel — server-gated feat eligibility (#1438)", () => {
  it("renders exactly the rows the server returned, with no client re-filtering", async () => {
    vi.mocked(client.fetchFeats).mockResolvedValue([
      catalogFeat({ id: "mi", name: "Magic Initiate", category: "origin" }),
    ]);

    renderPanel(4);
    await openFeatTab(userEvent.setup());

    expect(await screen.findByText("Magic Initiate")).toBeInTheDocument();
  });

  it("forwards the character level as asiLevel and refetches when it changes", async () => {
    vi.mocked(client.fetchFeats).mockClear();
    vi.mocked(client.fetchFeats).mockResolvedValue([]);

    const { rerender } = renderPanel(4);
    await openFeatTab(userEvent.setup());
    expect(client.fetchFeats).toHaveBeenCalledWith("EDITION_2024", 4);

    rerender(
      <AdvancementPanel
        currentScores={SCORES}
        slotsRemaining={1}
        busy={false}
        characterLevel={19}
        rulesEdition="EDITION_2024"
        skillNames={[]}
        onSubmit={noop}
      />
    );

    expect(client.fetchFeats).toHaveBeenCalledTimes(2);
    expect(client.fetchFeats).toHaveBeenLastCalledWith("EDITION_2024", 19);
  });

  it("clears the previous level's rows before the refetch for a lower level resolves", async () => {
    const boon = catalogFeat({ id: "bt", name: "Boon of Truesight", category: "epic_boon", levelPrerequisite: 19 });
    let resolveSecond: (rows: CatalogFeat[]) => void = () => {};
    vi.mocked(client.fetchFeats)
      .mockResolvedValueOnce([boon])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));

    const { rerender } = renderPanel(19);
    await openFeatTab(userEvent.setup());
    expect(await screen.findByText("Boon of Truesight")).toBeInTheDocument();

    rerender(
      <AdvancementPanel
        currentScores={SCORES}
        slotsRemaining={1}
        busy={false}
        characterLevel={18}
        rulesEdition="EDITION_2024"
        skillNames={[]}
        onSubmit={noop}
      />
    );

    expect(screen.queryByText("Boon of Truesight")).not.toBeInTheDocument();
    resolveSecond([]);
  });
});
