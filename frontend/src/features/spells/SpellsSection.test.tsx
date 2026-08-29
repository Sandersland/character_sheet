import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SpellsSection from "@/features/spells/SpellsSection";
import { useSpellcasting } from "@/features/spells/useSpellcasting";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import * as client from "@/api/client";
import type { Character, Spell } from "@/types/character";

vi.mock("@/api/client", () => ({
  applySpellcastingTransactions: vi.fn(),
}));

// SpellsSection reads useCurrentCharacter(), so tests must render via renderWithCharacter to seed the cache and mount CurrentCharacterProvider.
function render(character: Character) {
  return renderWithCharacter(<SpellsSection />, character);
}

const BLESS: Spell = {
  id: "entry-bless",
  name: "Bless",
  level: 1,
  school: "enchantment",
  prepared: true,
  castingTime: "1 action",
  range: "30 ft",
  duration: "Concentration, up to 1 minute",
  description: "Bless up to three creatures.",
  concentration: true,
};

function makeCharacter(
  concentratingOn: { entryId: string; spellName: string } | null,
): Character {
  return {
    id: "char-1",
    level: 3,
    abilityScores: {
      strength: 10, dexterity: 10, constitution: 10,
      intelligence: 16, wisdom: 10, charisma: 10,
    },
    classes: [{ name: "Wizard" }],
    spellcasting: {
      ability: "intelligence",
      spellSaveDC: 13,
      spellAttackBonus: 5,
      slots: [{ level: 1, total: 2, used: 0 }],
      arcana: [],
      spells: [BLESS],
      concentratingOn,
    },
  } as unknown as Character;
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function openGrimoire(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /manage spellbook/i }));
}

describe("SpellsSection concentration", () => {
  it("does not show the concentration banner when not concentrating", () => {
    render(makeCharacter(null));
    expect(screen.queryByText(/Concentrating on/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /drop concentration/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a banner naming the active concentration spell", () => {
    render(makeCharacter({ entryId: "entry-bless", spellName: "Bless" }));
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/Concentrating on/i);
    expect(banner).toHaveTextContent("Bless");
  });

  it("fires a dropConcentration op when the drop control is clicked", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applySpellcastingTransactions);
    mockApply.mockResolvedValue(makeCharacter(null));

    render(makeCharacter({ entryId: "entry-bless", spellName: "Bless" }));

    await user.click(screen.getByRole("button", { name: /drop concentration/i }));

    expect(mockApply).toHaveBeenCalledWith("char-1", [{ type: "dropConcentration" }]);
  });

  it("opens the grimoire view (not stacked) when Manage spellbook is clicked", async () => {
    const user = userEvent.setup();
    render(makeCharacter(null));
    expect(screen.queryByRole("button", { name: /^done$/i })).not.toBeInTheDocument();
    await openGrimoire(user);
    expect(screen.getByRole("button", { name: /^done$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /manage spellbook/i })).not.toBeInTheDocument();
  });

  it("marks the active concentration spell's badge as 'concentrating'", async () => {
    const user = userEvent.setup();
    render(makeCharacter({ entryId: "entry-bless", spellName: "Bless" }));
    await openGrimoire(user);
    expect(screen.getByText("concentrating")).toBeInTheDocument();
  });
});

function makeWizard(
  over: {
    prepared?: boolean;
    preparedSpellCount?: number;
    preparedSpellLimit?: number | null;
    withBless?: boolean;
  } = {},
): Character {
  const shield: Spell = { ...BLESS, id: "entry-shield", name: "Shield", prepared: over.prepared ?? false };
  const spells = over.withBless ? [BLESS, shield] : [shield];
  return {
    id: "wiz-1",
    level: 5,
    abilityScores: {
      strength: 10, dexterity: 10, constitution: 10,
      intelligence: 16, wisdom: 10, charisma: 10,
    },
    classes: [{ name: "Wizard" }],
    spellcasting: {
      ability: "intelligence",
      spellSaveDC: 13,
      spellAttackBonus: 5,
      slots: [{ level: 1, total: 4, used: 0 }],
      arcana: [],
      spells,
      concentratingOn: null,
      preparedSpellCount: over.preparedSpellCount ?? 1,
      preparedSpellLimit: over.preparedSpellLimit ?? 8,
    },
  } as unknown as Character;
}

describe("SpellsSection preparation (grimoire runes)", () => {
  it("dispatches prepareSpell when an under-limit open rune is tapped", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applySpellcastingTransactions);
    mockApply.mockResolvedValue(makeWizard({ prepared: true }));

    render(makeWizard());
    await openGrimoire(user);
    await user.click(screen.getByRole("button", { name: /Prepare Shield/i }));

    expect(mockApply).toHaveBeenCalledWith("wiz-1", [{ type: "prepareSpell", entryId: "entry-shield" }]);
  });

  it("dispatches unprepareSpell when a filled rune is tapped", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applySpellcastingTransactions);
    mockApply.mockResolvedValue(makeWizard());

    render(makeWizard({ prepared: true, preparedSpellCount: 2 }));
    await openGrimoire(user);
    await user.click(screen.getByRole("button", { name: /Unprepare Shield/i }));

    expect(mockApply).toHaveBeenCalledWith("wiz-1", [{ type: "unprepareSpell", entryId: "entry-shield" }]);
  });

  it("blocks an at-cap prepare with zero swap candidates: no client call, shows the reason", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applySpellcastingTransactions);

    render(makeWizard({ prepared: false, preparedSpellCount: 8, preparedSpellLimit: 8 }));
    await openGrimoire(user);
    await user.click(screen.getByRole("button", { name: /Prepare Shield/i }));

    expect(mockApply).not.toHaveBeenCalled();
    expect(screen.getByText(/prepare at most 8/i)).toBeInTheDocument();
  });

  it("surfaces the server rejection text when the prepare op is refused", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applySpellcastingTransactions);
    mockApply.mockRejectedValue(new Error("You can prepare at most 8 spells."));

    render(makeWizard());
    await openGrimoire(user);
    await user.click(screen.getByRole("button", { name: /Prepare Shield/i }));

    expect(await screen.findByText("You can prepare at most 8 spells.")).toBeInTheDocument();
  });

  it("handleSwap batches unprepare-one + prepare-another in a single client call", async () => {
    const mockApply = vi.mocked(client.applySpellcastingTransactions);
    mockApply.mockResolvedValue(makeWizard());
    const { result } = renderHook(() => useSpellcasting(makeWizard()));

    result.current.handleSwap("entry-drop", "entry-add");

    // TanStack Query dispatches mutationFn via internal notify batching (a microtask hop), not synchronously — this assertion needs a tick.
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply).toHaveBeenCalledWith("wiz-1", [
      { type: "unprepareSpell", entryId: "entry-drop" },
      { type: "prepareSpell", entryId: "entry-add" },
    ]);
  });
});

describe("SpellsSection at-cap swap bar (#938)", () => {
  const atCap = () =>
    makeWizard({ preparedSpellCount: 8, preparedSpellLimit: 8, withBless: true });

  it("opens the swap bar instead of erroring when a droppable candidate exists", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applySpellcastingTransactions);

    render(atCap());
    await openGrimoire(user);
    await user.click(screen.getByRole("button", { name: /Prepare Shield/i }));

    expect(mockApply).not.toHaveBeenCalled();
    const bar = screen.getByRole("status");
    expect(bar).toHaveTextContent(/Prepared limit reached \(8\)/i);
    expect(bar).toHaveTextContent("Shield");
    expect(screen.queryByText(/prepare at most/i)).not.toBeInTheDocument();
  });

  it("dispatches unprepare+prepare as one batch when a chip is picked, then closes", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applySpellcastingTransactions);
    mockApply.mockResolvedValue(makeWizard({ prepared: true, withBless: false }));

    render(atCap());
    await openGrimoire(user);
    await user.click(screen.getByRole("button", { name: /Prepare Shield/i }));
    await user.click(screen.getByRole("button", { name: /Swap out Bless to prepare Shield/i }));

    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledWith("wiz-1", [
      { type: "unprepareSpell", entryId: "entry-bless" },
      { type: "prepareSpell", entryId: "entry-shield" },
    ]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("closes on cancel without calling the client", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applySpellcastingTransactions);

    render(atCap());
    await openGrimoire(user);
    await user.click(screen.getByRole("button", { name: /Prepare Shield/i }));
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("closes on Escape without calling the client", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applySpellcastingTransactions);

    render(atCap());
    await openGrimoire(user);
    await user.click(screen.getByRole("button", { name: /Prepare Shield/i }));
    expect(screen.getByRole("status")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("SpellsSection grimoire — known caster (#1511)", () => {
  function makeKnownBard(): Character {
    const vm: Spell = {
      id: "entry-vicious-mockery", name: "Vicious Mockery", level: 0, school: "enchantment",
      prepared: true, castingTime: "1 action", range: "60 ft", duration: "1 round", description: "",
    };
    const charmPerson: Spell = {
      id: "entry-charm-person", name: "Charm Person", level: 1, school: "enchantment",
      prepared: true, castingTime: "1 action", range: "30 ft", duration: "1 hour", description: "",
    };
    return {
      id: "bard-known-1",
      level: 5,
      abilityScores: {
        strength: 10, dexterity: 10, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 16,
      },
      classes: [{ name: "Bard" }],
      spellcasting: {
        ability: "charisma",
        spellSaveDC: 13,
        spellAttackBonus: 5,
        slots: [{ level: 1, total: 4, used: 0 }],
        arcana: [],
        spells: [vm, charmPerson],
        concentratingOn: null,
        preparedSpellCount: 8,
        preparedSpellLimit: 8,
        casterModel: "known",
        preparedLabel: "Spells known",
        alwaysAvailableLabel: "Known",
      },
    } as unknown as Character;
  }

  it("relabels the meter and hides the Prepared chip", async () => {
    const user = userEvent.setup();
    render(makeKnownBard());
    await openGrimoire(user);

    expect(screen.getByText("Spells known")).toBeInTheDocument();
    expect(screen.getByText("8 / 8")).toBeInTheDocument();
    expect(screen.queryByText("Prepared")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prepared" })).not.toBeInTheDocument();
  });

  it("renders no toggleable prepare rune on any leveled row", async () => {
    const user = userEvent.setup();
    render(makeKnownBard());
    await openGrimoire(user);

    expect(screen.queryByRole("button", { name: /Prepare|Unprepare/i })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Known").length).toBeGreaterThan(0);
  });

  it("shows the served roster heading on the record view", () => {
    render(makeKnownBard());
    expect(screen.getByText("Spells known · leveled")).toBeInTheDocument();
  });
});

describe("SpellsSection slot labelling", () => {
  function warlockOnly(): Character {
    return {
      id: "char-wl",
      level: 1,
      abilityScores: {
        strength: 10, dexterity: 10, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 16,
      },
      classes: [{ id: "e1", name: "Warlock", level: 1 }],
      spellcasting: {
        ability: "charisma",
        spellSaveDC: 13,
        spellAttackBonus: 5,
        slots: [{ level: 1, total: 1, used: 0 }],
        arcana: [],
        pact: null,
        spells: [],
        concentratingOn: null,
      },
    } as unknown as Character;
  }

  function warlockSorcerer(): Character {
    return {
      id: "char-mc",
      level: 2,
      abilityScores: {
        strength: 10, dexterity: 10, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 16,
      },
      classes: [
        { id: "e1", name: "Warlock", level: 1 },
        { id: "e2", name: "Sorcerer", level: 1 },
      ],
      spellcasting: {
        ability: "charisma",
        spellSaveDC: 13,
        spellAttackBonus: 5,
        slots: [{ level: 1, total: 2, used: 0 }],
        arcana: [],
        pact: { slotLevel: 1, count: 1, used: 0, spellSaveDC: 13, spellAttackBonus: 5 },
        spells: [],
        concentratingOn: null,
      },
    } as unknown as Character;
  }

  function warlockGrimoire(): Character {
    return {
      id: "char-wl3",
      level: 5,
      abilityScores: {
        strength: 10, dexterity: 10, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 16,
      },
      classes: [{ id: "e1", name: "Warlock", level: 5 }],
      spellcasting: {
        ability: "charisma",
        spellSaveDC: 13,
        spellAttackBonus: 5,
        slots: [{ level: 3, total: 2, used: 0 }],
        arcana: [],
        pact: null,
        preparedSpellLimit: null,
        spells: [{
          id: "s1", name: "Fly", level: 3, school: "transmutation", prepared: true,
          castingTime: "1 action", range: "Touch", duration: "Concentration", description: "",
        }],
        concentratingOn: null,
      },
    } as unknown as Character;
  }

  it("labels a single-class warlock's merged slots as Pact Magic", () => {
    render(warlockOnly());
    expect(screen.getByRole("heading", { name: /Pact Magic/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Spell Slots$/i })).not.toBeInTheDocument();
  });

  it("labels a warlock's grimoire slot group Pact Magic with the fixed-level note", async () => {
    const user = userEvent.setup();
    render(warlockGrimoire());
    await user.click(screen.getByRole("button", { name: /manage spellbook/i }));
    expect(screen.getByText(/Pact Magic — 2\/2 slots/i)).toBeInTheDocument();
    expect(screen.getByText(/All slots are cast at level 3 and return on a short rest\./i)).toBeInTheDocument();
  });

  it("does not label a non-warlock's grimoire slot group as Pact Magic", async () => {
    const user = userEvent.setup();
    render(makeCharacter(null));
    await user.click(screen.getByRole("button", { name: /manage spellbook/i }));
    expect(screen.queryByText(/Pact Magic/i)).not.toBeInTheDocument();
  });

  it("labels a multiclass warlock's merged pool 'Spell Slots' with one dedicated Pact Magic block", () => {
    render(warlockSorcerer());
    expect(screen.getByRole("heading", { name: /^Spell Slots$/i })).toBeInTheDocument();
    const pactHeadings = screen.getAllByRole("heading", { name: /Pact Magic/i });
    expect(pactHeadings).toHaveLength(1);
    expect(pactHeadings[0]).toHaveTextContent(/level 1/i);
  });
});
