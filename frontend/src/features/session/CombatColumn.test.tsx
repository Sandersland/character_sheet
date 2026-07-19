import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import CombatColumn from "@/features/session/CombatColumn";
import type { Character } from "@/types/character";

// The idle↔live parity contract (#1086): the slot order is fixed, so switching
// idle→live moves only the turn + HP slot contents and nothing else shifts.
function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "c1",
    rollModifiers: [],
    resistances: [{ damageType: "fire", source: "Ring of Fire Resistance" }],
    damageImmunities: [],
    conditionImmunities: [],
    grantedAdvantages: [],
    ...overrides,
  } as unknown as Character;
}

describe("CombatColumn", () => {
  it("renders the fixed slot order: turn → HP → conditions → grants → log", () => {
    render(
      <CombatColumn
        character={makeCharacter()}
        turnSlot={<div>turn-content</div>}
        hpSlot={<div>hp-content</div>}
        conditionsSlot={<div>conditions-content</div>}
        logRow={<div>log-content</div>}
      />,
    );

    const turn = screen.getByTestId("combat-turn");
    const hp = screen.getByTestId("combat-hp");
    const conditions = screen.getByTestId("combat-conditions");
    const grants = screen.getByText("Resistances & Traits");
    const log = screen.getByTestId("combat-log");

    expect(turn.compareDocumentPosition(hp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hp.compareDocumentPosition(conditions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(conditions.compareDocumentPosition(grants) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grants.compareDocumentPosition(log) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("omits the HP slot wrapper when no HP content is supplied (mobile live keeps HP in the header)", () => {
    render(
      <CombatColumn
        character={makeCharacter()}
        turnSlot={<div>turn-content</div>}
        hpSlot={null}
        conditionsSlot={<div>conditions-content</div>}
        logRow={<div>log-content</div>}
      />,
    );
    expect(screen.queryByTestId("combat-hp")).toBeNull();
    expect(screen.getByTestId("combat-conditions")).toBeInTheDocument();
  });

  it("self-hides the item-grants card when the character has no granted defenses", () => {
    render(
      <CombatColumn
        character={makeCharacter({ resistances: [] })}
        turnSlot={<div>turn-content</div>}
        hpSlot={<div>hp-content</div>}
        conditionsSlot={<div>conditions-content</div>}
        logRow={<div>log-content</div>}
      />,
    );
    expect(screen.queryByText("Resistances & Traits")).toBeNull();
  });
});
