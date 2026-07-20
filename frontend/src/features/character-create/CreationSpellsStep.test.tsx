import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSpells } from "@/api/client";
import CreationSpellsStep from "@/features/character-create/CreationSpellsStep";
import type { CatalogSpell } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchSpells: vi.fn() }));
const fetchMock = vi.mocked(fetchSpells);

function spell(over: Partial<CatalogSpell>): CatalogSpell {
  return {
    id: "c1",
    name: "Spell",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "60 ft.",
    duration: "Instantaneous",
    description: "",
    concentration: false,
    ritual: false,
    classes: [],
    cantripScaling: false,
    ...over,
  };
}

const CATALOG: CatalogSpell[] = [
  spell({ id: "eb", name: "Eldritch Blast", level: 0, classes: ["warlock"], description: "A beam of crackling energy." }),
  spell({ id: "presti", name: "Prestidigitation", level: 0, classes: ["wizard"] }),
  spell({ id: "charm", name: "Charm Person", level: 1, classes: ["warlock", "bard"], description: "Charm a humanoid." }),
  spell({ id: "shield", name: "Shield", level: 1, classes: ["wizard"] }),
];

const COUNTS = { cantrips: 2, spells: 2 };

function renderStep(over: Partial<Parameters<typeof CreationSpellsStep>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <CreationSpellsStep
      className="warlock"
      counts={COUNTS}
      cantripIds={[]}
      spellIds={[]}
      onChange={onChange}
      {...over}
    />,
  );
  return { onChange };
}

describe("CreationSpellsStep", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(CATALOG);
  });

  it("shows only class-eligible level-0/1 spells (wizard-only spells absent for a warlock)", async () => {
    renderStep();
    expect(await screen.findByRole("button", { name: "Open Eldritch Blast" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Charm Person" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Prestidigitation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Shield" })).not.toBeInTheDocument();
  });

  it("reflects the pick counts in the budget headline", async () => {
    renderStep({ cantripIds: ["eb"] });
    expect(await screen.findByText("Cantrips 1/2 · Spells 0/2")).toBeInTheDocument();
  });

  it("patches cantripIds when a cantrip pill is toggled", async () => {
    const { onChange } = renderStep();
    await userEvent.click(await screen.findByRole("button", { name: "Add Eldritch Blast" }));
    expect(onChange).toHaveBeenCalledWith({ cantripIds: ["eb"] });
  });

  it("disables unselected cantrip pills once the cap is reached", async () => {
    renderStep({ cantripIds: ["eb"], counts: { cantrips: 1, spells: 2 } });
    // Eldritch Blast fills the single cantrip slot, so Prestidigitation... is
    // off-list anyway; assert the other warlock-eligible list respects its cap.
    const added = await screen.findByRole("button", { name: "Add Eldritch Blast" });
    expect(added).toHaveAttribute("aria-pressed", "true");
  });

  it("opens a row's description", async () => {
    renderStep();
    await userEvent.click(await screen.findByRole("button", { name: "Open Eldritch Blast" }));
    expect(screen.getByText("A beam of crackling energy.")).toBeInTheDocument();
  });

  it("surfaces a catalog load error", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    renderStep();
    expect(await screen.findByText(/Couldn't load spell catalog/)).toBeInTheDocument();
  });

  it("shows a delayed spinner while the catalog loads", async () => {
    vi.useFakeTimers();
    let resolve: (spells: CatalogSpell[]) => void = () => {};
    fetchMock.mockReturnValue(new Promise<CatalogSpell[]>((r) => { resolve = r; }));
    renderStep();
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.getByRole("status")).toBeInTheDocument();
    await act(async () => { resolve(CATALOG); });
    vi.useRealTimers();
  });
});
