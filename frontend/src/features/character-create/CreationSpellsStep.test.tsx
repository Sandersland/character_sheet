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

// What the server returns for ?class=warlock&maxLevel=1 (#1377). The class and
// level filters live there now, so a mock returning off-list rows would only
// test a filter this component no longer has — it would render them.
const CATALOG: CatalogSpell[] = [
  spell({ id: "eb", name: "Eldritch Blast", level: 0, classes: ["warlock"], description: "A beam of crackling energy." }),
  spell({ id: "charm", name: "Charm Person", level: 1, classes: ["warlock", "bard"], description: "Charm a humanoid." }),
];

const COUNTS = { cantrips: 2, spells: 2, maxSpellLevel: 1 };

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

  // Eligibility is a server rule now, so the component's contract is the REQUEST
  // it makes, plus splitting the answer on the served level. It must not filter.
  it("asks the server for the class's legal band, passing the served maxSpellLevel", async () => {
    renderStep();
    await screen.findByRole("button", { name: "Open Eldritch Blast" });
    expect(fetchMock).toHaveBeenCalledWith({ className: "warlock", maxLevel: 1 });
  });

  // #1510: a 2014 Cleric/Druid serves maxSpellLevel: 0 (cantrips-only — see
  // level1SpellPicksFor's comment). `0` must survive to the request unchanged,
  // not get floored to 1 — the cantrips-only fetch seam #1377 built on the wire
  // (fetchSpells' `!== undefined` check, spells.test.ts's `?maxLevel=0` pin).
  it("passes maxSpellLevel: 0 through to the fetch for a cantrips-only class", async () => {
    renderStep({ className: "cleric", counts: { cantrips: 3, spells: 0, maxSpellLevel: 0 } });
    await screen.findByRole("button", { name: "Open Eldritch Blast" });
    expect(fetchMock).toHaveBeenCalledWith({ className: "cleric", maxLevel: 0 });
  });

  // Each render keeps exactly one group alive, which is how the level-0 split can
  // be observed without the picker's <section>s carrying accessible names.
  it("routes level-0 rows to the Cantrips group only", async () => {
    renderStep({ counts: { ...COUNTS, spells: 0 } });
    expect(await screen.findByRole("button", { name: "Open Eldritch Blast" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Charm Person" })).not.toBeInTheDocument();
  });

  it("routes rows above level 0 to the Spells group only", async () => {
    renderStep({ counts: { ...COUNTS, cantrips: 0 } });
    expect(await screen.findByRole("button", { name: "Open Charm Person" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Eldritch Blast" })).not.toBeInTheDocument();
  });

  it("omits the Spells group when the class learns zero level-1 spells", async () => {
    renderStep({ counts: { ...COUNTS, spells: 0 } });
    // A cantrip row proves the catalog loaded; the Spells heading must be absent.
    await screen.findByRole("button", { name: "Open Eldritch Blast" });
    expect(screen.queryByText("Spells", { exact: true })).not.toBeInTheDocument();
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
    renderStep({ cantripIds: ["eb"], counts: { ...COUNTS, cantrips: 1 } });
    // Eldritch Blast fills the single cantrip slot; the served list holds no
    // second warlock cantrip, so the cap shows as the picked pill staying pressed.
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
