import { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";

import CombatPanel from "@/features/character-meta/panels/CombatPanel";
import { RollProvider } from "@/features/dice/RollContext";
import type { RollResult } from "@/lib/dice";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyHitPointOperations: vi.fn(),
  logRoll: vi.fn().mockResolvedValue(undefined),
}));

// Stub the 3D DiceRoller: the real one mounts a Three.js Canvas that jsdom can't render.
vi.mock("@/features/dice/DiceRoller", () => ({
  default: function MockDiceRoller({
    onResult,
    spec,
  }: {
    onResult?: (r: RollResult) => void;
    spec?: { count: number; faces: number; modifier?: number };
  }) {
    useEffect(() => {
      const modifier = spec?.modifier ?? 0;
      onResult?.({
        dice: [{ value: 11, dropped: false }],
        modifier,
        total: 11 + modifier,
        spec: { count: 1, faces: 20, modifier },
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mock fires onResult once on mount; empty deps intentional
    }, []);
    return <div data-testid="dice-roller" />;
  },
}));

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    conditions: { active: [], exhaustion: 0 },
    hitPoints: { current: 20, max: 22, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 2, die: "d10", spent: 0 },
    abilityScores: {
      strength: 10, dexterity: 10, constitution: 14,
      intelligence: 10, wisdom: 10, charisma: 10,
    },
    pendingLevelUps: 0,
    advancementSlots: { total: 0, used: 0 },
    resistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    grantedAdvantages: [],
    ...overrides,
  } as unknown as Character;
}

function renderPanel(character: Character) {
  return rtlRender(
    <RollProvider characterId="char-1" sessionId="sess-1">
      <CombatPanel character={character} reference={null} onUpdate={() => {}} />
    </RollProvider>,
  );
}

describe("CombatPanel", () => {
  it("renders Hit Points → Conditions → Resistances & Traits in DOM order", () => {
    renderPanel(
      makeCharacter({
        resistances: [{ damageType: "fire", source: "Ring of Fire Resistance" }],
      } as Partial<Character>),
    );

    const hp = screen.getByRole("heading", { name: "Hit Points" });
    const conditions = screen.getByRole("heading", { name: "Conditions" });
    const grants = screen.getByRole("heading", { name: "Resistances & Traits" });

    expect(hp.compareDocumentPosition(conditions)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(conditions.compareDocumentPosition(grants)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("hides the grants card when the character has no granted defenses", () => {
    renderPanel(makeCharacter());

    expect(screen.getByRole("heading", { name: "Hit Points" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Conditions" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Resistances & Traits" })).toBeNull();
  });

  it("shows the grants card when the character has granted defenses", () => {
    renderPanel(
      makeCharacter({
        conditionImmunities: [{ condition: "poisoned", source: "Amulet" }],
      } as Partial<Character>),
    );

    expect(screen.getByRole("heading", { name: "Resistances & Traits" })).toBeInTheDocument();
  });
});
