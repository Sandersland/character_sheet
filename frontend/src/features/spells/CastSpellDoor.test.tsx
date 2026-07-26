import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CastSpellDoor from "@/features/spells/CastSpellDoor";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character, Spell } from "@/types/character";

function spell(partial: Partial<Spell>): Spell {
  return {
    id: partial.name ?? "x",
    name: "Spell",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "A test spell.",
    ...partial,
  } as Spell;
}

function makeCharacter(spells: Spell[]): Character {
  return {
    id: "char-1",
    level: 5,
    abilityScores: {
      strength: 10, dexterity: 10, constitution: 10,
      intelligence: 16, wisdom: 10, charisma: 10,
    },
    spellcasting: { ability: "intelligence", spellSaveDC: 15, spellAttackBonus: 7, spells },
  } as unknown as Character;
}

const DERIVED = { availableSlotLevels: [1, 2], availableArcanaLevels: [] };

function baseProps(over: Partial<Parameters<typeof CastSpellDoor>[0]> = {}) {
  return {
    derived: DERIVED,
    busy: false,
    isLive: false,
    onCast: vi.fn(),
    onGoToCombat: vi.fn(),
    ...over,
  };
}

const defaultCharacter = () =>
  makeCharacter([
    spell({ name: "Fire Bolt", level: 0 }),
    spell({ name: "Burning Hands", level: 1, prepared: true }),
  ]);

// CastSpellDoor reads useCurrentCharacter(), so every render seeds the cache
// and mounts CurrentCharacterProvider via renderWithCharacter.
function renderDoor(
  propsOver: Partial<Parameters<typeof CastSpellDoor>[0]> = {},
  character: Character = defaultCharacter(),
) {
  return renderWithCharacter(<CastSpellDoor {...baseProps(propsOver)} />, character);
}

describe("CastSpellDoor", () => {
  it("renders the Cast a spell door", () => {
    renderDoor();
    expect(screen.getByRole("button", { name: "Cast a spell" })).toBeInTheDocument();
  });

  it("opens a picker listing castable spells when not live", async () => {
    const user = userEvent.setup();
    renderDoor();
    await user.click(screen.getByRole("button", { name: "Cast a spell" }));
    expect(screen.getByRole("button", { name: /Fire Bolt/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Burning Hands/ })).toBeInTheDocument();
  });

  it("excludes a prepared leveled spell with no available slot", async () => {
    const user = userEvent.setup();
    renderDoor(
      { derived: { availableSlotLevels: [], availableArcanaLevels: [] } },
      makeCharacter([spell({ name: "Burning Hands", level: 1, prepared: true })]),
    );
    await user.click(screen.getByRole("button", { name: "Cast a spell" }));
    expect(screen.queryByRole("button", { name: /Burning Hands/ })).not.toBeInTheDocument();
  });

  it("opens the shared spell detail card when a picker row is tapped", async () => {
    const user = userEvent.setup();
    renderDoor();
    await user.click(screen.getByRole("button", { name: "Cast a spell" }));
    await user.click(screen.getByRole("button", { name: /Fire Bolt/ }));
    expect(screen.getByRole("heading", { name: "Fire Bolt" })).toBeInTheDocument();
  });

  it("casts a cantrip with no slot arg and closes the door", async () => {
    const user = userEvent.setup();
    const onCast = vi.fn();
    renderDoor({ onCast });
    await user.click(screen.getByRole("button", { name: "Cast a spell" }));
    await user.click(screen.getByRole("button", { name: /Fire Bolt/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Cast Fire Bolt/ }));
    expect(onCast).toHaveBeenCalledWith(expect.objectContaining({ name: "Fire Bolt" }), undefined);
    expect(screen.queryByRole("heading", { name: "Fire Bolt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Burning Hands/ })).not.toBeInTheDocument();
  });

  it("shows an upcast slot selector for a multi-slot leveled spell and casts at the chosen level", async () => {
    const user = userEvent.setup();
    const onCast = vi.fn();
    renderDoor({ onCast });
    await user.click(screen.getByRole("button", { name: "Cast a spell" }));
    await user.click(screen.getByRole("button", { name: /Burning Hands/ }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /L2/ }));
    await user.click(within(dialog).getByRole("button", { name: /Cast Burning Hands/ }));
    expect(onCast).toHaveBeenCalledWith(expect.objectContaining({ name: "Burning Hands" }), 2);
  });

  it("routes to Combat instead of opening the picker when a session is live", async () => {
    const user = userEvent.setup();
    const onGoToCombat = vi.fn();
    renderDoor({ isLive: true, onGoToCombat });
    await user.click(screen.getByRole("button", { name: "Cast a spell" }));
    expect(onGoToCombat).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /Fire Bolt/ })).not.toBeInTheDocument();
  });

  it("shows the live-session notice only when a session is live", () => {
    // The "Combat" tab name renders in its own <span>, so match on the
    // paragraph's full text content rather than a single text node.
    const notice = () =>
      screen.queryByText((_, el) => el?.tagName === "P" && /casting happens on the .*Combat.* tab/i.test(el.textContent ?? ""));
    const { rerender } = renderDoor({ isLive: false });
    expect(notice()).not.toBeInTheDocument();
    rerender(<CastSpellDoor {...baseProps({ isLive: true })} />);
    expect(notice()).toBeInTheDocument();
  });
});
