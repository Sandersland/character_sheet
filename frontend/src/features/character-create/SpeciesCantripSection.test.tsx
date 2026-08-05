// #1689: SpeciesCantripSection (High Elf's Cantrip) — same reuse of
// SpellPicker/useSpellCatalog as CreationSpellsStep, mirroring its own test
// shape. The one thing genuinely different here: the request goes out
// against the SPEC's class list, never the character's own class.
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSpells } from "@/api/client";
import SpeciesCantripSection from "@/features/character-create/SpeciesCantripSection";
import type { CreationSpeciesCantripChoice } from "@/lib/characterCreation";
import type { CatalogSpell } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchSpells: vi.fn() }));
const fetchMock = vi.mocked(fetchSpells);

function spell(over: Partial<CatalogSpell>): CatalogSpell {
  return {
    id: "fb",
    name: "Fire Bolt",
    level: 0,
    school: "evocation",
    castingTime: "1 action",
    range: "120 ft",
    duration: "Instantaneous",
    description: "A mote of fire streaks toward a creature.",
    concentration: false,
    ritual: false,
    classes: ["wizard"],
    cantripScaling: true,
    ...over,
  };
}

const CATALOG: CatalogSpell[] = [spell({})];

function renderSection(choice: Partial<CreationSpeciesCantripChoice> = {}, onChange = vi.fn()) {
  const fullChoice: CreationSpeciesCantripChoice = {
    applicable: true,
    list: "wizard",
    castingAbility: "intelligence",
    selectedId: "",
    complete: false,
    ...choice,
  };
  render(<SpeciesCantripSection choice={fullChoice} edition="EDITION_2024" onChange={onChange} />);
  return { onChange };
}

describe("SpeciesCantripSection (#1689)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(CATALOG);
  });

  it("renders nothing when the served spec is inert (applicable:false)", () => {
    const { container } = render(
      <SpeciesCantripSection
        choice={{ applicable: false, list: "", castingAbility: "intelligence", selectedId: "", complete: true }}
        edition="EDITION_2024"
        onChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queries the spec's OWN class list, cantrips only (maxLevel: 0) — never the character's class", async () => {
    renderSection();
    await screen.findByRole("button", { name: "Open Fire Bolt" });
    expect(fetchMock).toHaveBeenCalledWith("EDITION_2024", { className: "wizard", maxLevel: 0 });
  });

  it("names the spec's casting ability in the panel copy", async () => {
    renderSection({ castingAbility: "intelligence" });
    expect(await screen.findByText(/Intelligence is its casting ability/)).toBeInTheDocument();
  });

  it("toggles onChange with the chosen spell id, single-select (cap 1)", async () => {
    const { onChange } = renderSection();
    await userEvent.click(await screen.findByRole("button", { name: "Add Fire Bolt" }));
    expect(onChange).toHaveBeenCalledWith("fb");
  });

  it("clears the selection (empty string) when the already-picked cantrip is toggled again", async () => {
    const { onChange } = renderSection({ selectedId: "fb" });
    await userEvent.click(await screen.findByRole("button", { name: "Open Fire Bolt" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove Fire Bolt" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("surfaces a catalog load error", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    renderSection();
    expect(await screen.findByText(/Couldn't load spell catalog/)).toBeInTheDocument();
  });

  it("shows a delayed spinner while the catalog loads", async () => {
    vi.useFakeTimers();
    let resolve: (spells: CatalogSpell[]) => void = () => {};
    fetchMock.mockReturnValue(new Promise<CatalogSpell[]>((r) => { resolve = r; }));
    renderSection();
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.getByRole("status")).toBeInTheDocument();
    await act(async () => { resolve(CATALOG); });
    vi.useRealTimers();
  });
});
