import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSpells } from "@/api/client";
import CreationSpellsStep from "@/features/character-create/CreationSpellsStep";
import type { CreationSpeciesCantripChoice } from "@/lib/characterCreation";
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

// CATALOG mocks an already-filtered server response for ?class=warlock&maxLevel=1; the component applies no class/level filter of its own.
const CATALOG: CatalogSpell[] = [
  spell({ id: "eb", name: "Eldritch Blast", level: 0, classes: ["warlock"], description: "A beam of crackling energy." }),
  spell({ id: "charm", name: "Charm Person", level: 1, classes: ["warlock", "bard"], description: "Charm a humanoid." }),
];

const SPECIES_CATALOG: CatalogSpell[] = [
  spell({ id: "fb", name: "Fire Bolt", level: 0, classes: ["wizard"], description: "A mote of fire streaks toward a creature." }),
];

const COUNTS = { cantrips: 2, spells: 2, maxSpellLevel: 1 };
const INAPPLICABLE_SPECIES_CHOICE: CreationSpeciesCantripChoice = {
  applicable: false,
  selectedId: "",
  complete: true,
};
const APPLICABLE_SPECIES_CHOICE: CreationSpeciesCantripChoice = {
  applicable: true,
  list: "wizard",
  castingAbility: "intelligence",
  selectedId: "",
  complete: false,
};

function renderStep(over: Partial<Parameters<typeof CreationSpellsStep>[0]> = {}) {
  const onChange = vi.fn();
  const onSpeciesCantripChange = vi.fn();
  render(
    <CreationSpellsStep
      className="warlock"
      counts={COUNTS}
      cantripIds={[]}
      spellIds={[]}
      speciesCantripChoice={INAPPLICABLE_SPECIES_CHOICE}
      edition="EDITION_2024"
      onChange={onChange}
      onSpeciesCantripChange={onSpeciesCantripChange}
      {...over}
    />,
  );
  return { onChange, onSpeciesCantripChange };
}

describe("CreationSpellsStep", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(CATALOG);
  });

  it("asks the server for the class's legal band, passing the served maxSpellLevel", async () => {
    renderStep();
    await screen.findByRole("button", { name: "Open Eldritch Blast" });
    expect(fetchMock).toHaveBeenCalledWith("EDITION_2024", { className: "warlock", maxLevel: 1 });
  });

  // #1510: maxSpellLevel: 0 (cantrips-only) must survive to the request unchanged, not get floored to 1 like a missing value would.
  it("passes maxSpellLevel: 0 through to the fetch for a cantrips-only class", async () => {
    renderStep({ className: "cleric", counts: { cantrips: 3, spells: 0, maxSpellLevel: 0 } });
    await screen.findByRole("button", { name: "Open Eldritch Blast" });
    expect(fetchMock).toHaveBeenCalledWith("EDITION_2024", { className: "cleric", maxLevel: 0 });
  });

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
    await screen.findByRole("button", { name: "Open Eldritch Blast" });
    expect(screen.queryByText("Spells", { exact: true })).not.toBeInTheDocument();
  });

  it("reflects the pick counts across the active headline and the other tab's segment", async () => {
    renderStep({ cantripIds: ["eb"] });
    expect(await screen.findByText("Cantrips 1/2")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Spells 0/2" })).toBeInTheDocument();
  });

  it("patches cantripIds when a cantrip pill is toggled", async () => {
    const { onChange } = renderStep();
    await userEvent.click(await screen.findByRole("button", { name: "Add Eldritch Blast" }));
    expect(onChange).toHaveBeenCalledWith({ cantripIds: ["eb"] });
  });

  it("disables unselected cantrip pills once the cap is reached", async () => {
    renderStep({ cantripIds: ["eb"], counts: { ...COUNTS, cantrips: 1 } });
    const added = await screen.findByRole("button", { name: "Add Eldritch Blast" });
    expect(added).toHaveAttribute("aria-pressed", "true");
  });

  it("opens a row's description", async () => {
    renderStep();
    await userEvent.click(await screen.findByRole("button", { name: "Open Eldritch Blast" }));
    expect(screen.getByText("A beam of crackling energy.")).toBeInTheDocument();
  });

  it("shows a misconfiguration message when the class fetch succeeds with an empty catalog", async () => {
    fetchMock.mockResolvedValue([]);
    renderStep();
    expect(await screen.findByText(/no spells are available to choose here/i)).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't load spell catalog/)).not.toBeInTheDocument();
  });

  it("still shows the ordinary search-miss copy when a populated catalog is searched to zero", async () => {
    renderStep();
    await screen.findByRole("button", { name: "Open Eldritch Blast" });
    await userEvent.type(screen.getByRole("searchbox"), "zzzznomatch");
    expect(await screen.findByText("No spells match your search.")).toBeInTheDocument();
    expect(screen.queryByText(/configuration problem/i)).not.toBeInTheDocument();
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

  describe("Wizard spellbook (#1513)", () => {
    const WIZARD_COUNTS = { cantrips: 3, spells: 6, maxSpellLevel: 1, spellbookSize: 6 };

    it("labels the leveled group Spellbook, shows the split note, and caps at spellbookSize", async () => {
      renderStep({ className: "wizard", counts: WIZARD_COUNTS });
      expect(await screen.findByText("Cantrips 0/3")).toBeInTheDocument();
      const spellbookTab = screen.getByRole("radio", { name: "Spellbook 0/6" });
      await userEvent.click(spellbookTab);
      expect(
        screen.getByText(/All 6 spells you choose are scribed into your spellbook/),
      ).toBeInTheDocument();
    });

    it("does not show the spellbook note or relabel for a non-wizard caster", async () => {
      renderStep();
      await screen.findByText("Cantrips 0/2");
      expect(screen.getByRole("radio", { name: "Spells 0/2" })).toBeInTheDocument();
      expect(screen.queryByText(/scribed into your spellbook/)).not.toBeInTheDocument();
    });
  });

  describe("species cantrip (#1689/#1778)", () => {
    beforeEach(() => {
      fetchMock.mockImplementation((_edition, filter) =>
        Promise.resolve(filter?.maxLevel === 0 ? SPECIES_CATALOG : CATALOG),
      );
    });

    it("renders no species tab and fires no species fetch when the spec is inert", async () => {
      renderStep({ speciesCantripChoice: INAPPLICABLE_SPECIES_CHOICE });
      await screen.findByRole("button", { name: "Open Eldritch Blast" });
      expect(fetchMock).not.toHaveBeenCalledWith("EDITION_2024", expect.objectContaining({ maxLevel: 0 }));
    });

    it("queries the spec's OWN class list, cantrips only (maxLevel: 0) — never the character's class", async () => {
      renderStep({ speciesCantripChoice: APPLICABLE_SPECIES_CHOICE });
      await screen.findByRole("radio", { name: /Species/ });
      expect(fetchMock).toHaveBeenCalledWith("EDITION_2024", { className: "wizard", maxLevel: 0 });
    });

    it("shows the species tab FIRST, ahead of Cantrips and Spells", async () => {
      renderStep({ speciesCantripChoice: APPLICABLE_SPECIES_CHOICE });
      const radios = await screen.findAllByRole("radio");
      expect(radios.map((r) => r.textContent)).toEqual([
        expect.stringContaining("Species"),
        expect.stringContaining("Cantrips"),
        expect.stringContaining("Spells"),
      ]);
    });

    it("names the spec's casting ability as the species tab's sub-header", async () => {
      renderStep({ speciesCantripChoice: APPLICABLE_SPECIES_CHOICE });
      await screen.findByRole("radio", { name: /Species/ });
      expect(await screen.findByText(/Intelligence is its casting ability/)).toBeInTheDocument();
    });

    it("names the player's chosen ability generically when the spec fixes none (#1756)", async () => {
      renderStep({
        speciesCantripChoice: { applicable: true, spells: ["Fire Bolt"], selectedId: "", complete: false },
      });
      expect(await screen.findByText(/your chosen casting ability applies to it/)).toBeInTheDocument();
    });

    it("a spells-spec (#1756) narrows the fetched catalog to exactly its named options", async () => {
      const wide: CatalogSpell[] = [
        spell({ id: "dl", name: "Dancing Lights", level: 0 }),
        spell({ id: "fb", name: "Fire Bolt", level: 0 }),
      ];
      fetchMock.mockImplementation((_edition, filter) => Promise.resolve(filter?.maxLevel === 0 ? wide : CATALOG));
      renderStep({
        speciesCantripChoice: { applicable: true, spells: ["Dancing Lights"], selectedId: "", complete: false },
      });
      await screen.findByRole("radio", { name: /Species/ });
      await userEvent.click(screen.getByRole("radio", { name: /Species/ }));
      expect(await screen.findByRole("button", { name: "Open Dancing Lights" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Open Fire Bolt" })).not.toBeInTheDocument();
    });

    it("toggles onSpeciesCantripChange with the chosen spell id, single-select (cap 1)", async () => {
      const { onSpeciesCantripChange } = renderStep({ speciesCantripChoice: APPLICABLE_SPECIES_CHOICE });
      await screen.findByRole("radio", { name: /Species/ });
      await userEvent.click(await screen.findByRole("button", { name: "Add Fire Bolt" }));
      expect(onSpeciesCantripChange).toHaveBeenCalledWith("fb");
    });

    it("clears the selection (empty string) when the already-picked cantrip is toggled again", async () => {
      const { onSpeciesCantripChange } = renderStep({
        speciesCantripChoice: { ...APPLICABLE_SPECIES_CHOICE, selectedId: "fb", complete: true },
      });
      await screen.findByRole("radio", { name: /Species/ });
      await userEvent.click(await screen.findByRole("button", { name: "Open Fire Bolt" }));
      await userEvent.click(screen.getByRole("button", { name: "Remove Fire Bolt" }));
      expect(onSpeciesCantripChange).toHaveBeenCalledWith("");
    });

    it("shows a single view with no segmented control for a species-cantrip-only (non-caster) class", async () => {
      renderStep({ counts: undefined, speciesCantripChoice: APPLICABLE_SPECIES_CHOICE });
      expect(await screen.findByRole("button", { name: "Open Fire Bolt" })).toBeInTheDocument();
      expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
      expect(screen.queryByRole("radio")).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalledWith("EDITION_2024", { className: "warlock", maxLevel: 1 });
    });

    it("shows a misconfiguration message when the species catalog succeeds with an empty pool", async () => {
      fetchMock.mockImplementation((_edition, filter) =>
        Promise.resolve(filter?.maxLevel === 0 ? [] : CATALOG),
      );
      renderStep({ speciesCantripChoice: APPLICABLE_SPECIES_CHOICE, counts: undefined });
      expect(await screen.findByText(/no spells are available to choose here/i)).toBeInTheDocument();
      expect(screen.queryByText(/Couldn't load spell catalog/)).not.toBeInTheDocument();
    });

    it("surfaces a species catalog load error", async () => {
      fetchMock.mockImplementation((_edition, filter) =>
        filter?.maxLevel === 0 ? Promise.reject(new Error("boom")) : Promise.resolve(CATALOG),
      );
      renderStep({ speciesCantripChoice: APPLICABLE_SPECIES_CHOICE });
      expect(await screen.findByText(/Couldn't load spell catalog/)).toBeInTheDocument();
    });
  });
});
