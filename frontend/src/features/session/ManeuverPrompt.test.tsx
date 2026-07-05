import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ManeuverPrompt from "@/features/session/ManeuverPrompt";
import { castManeuverTransaction } from "@/api/client";
import type { Character } from "@/types/character";
import type { RollResult } from "@/lib/dice";

vi.mock("@/api/client", () => ({
  castManeuverTransaction: vi.fn(),
}));

// Server rolls a 5 on the superiority die for every cast in these tests.
const SERVER_ROLL = 5;

function makeCharacter(): Character {
  return {
    id: "char-1",
    resources: {
      pools: [
        { key: "superiorityDice", label: "Superiority Dice", die: "d8", total: 4, recharge: "shortRest", used: 0, remaining: 4 },
      ],
      maneuversKnown: [
        { id: "m-precision", name: "Precision Attack", description: "Add to the attack roll.", placement: "attackRoll" },
        { id: "m-trip", name: "Trip Attack", description: "Add to the damage roll.", placement: "damageRoll" },
      ],
    },
  } as unknown as Character;
}

const roll = (total: number): RollResult => ({ total }) as unknown as RollResult;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(castManeuverTransaction).mockResolvedValue({
    character: makeCharacter(),
    results: [{ roll: SERVER_ROLL, saveDc: 15, summary: "used Trip Attack" }],
  });
});

describe("ManeuverPrompt — die folds into the total", () => {
  it("folds the server-rolled die into the attack total for an attackRoll maneuver", async () => {
    const user = userEvent.setup();
    const onRollsUpdated = vi.fn();
    render(
      <ManeuverPrompt
        character={makeCharacter()}
        lastAttackRoll={roll(14)}
        lastDamageRoll={null}
        onRollsUpdated={onRollsUpdated}
        onUpdate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Precision Attack/ }));

    await waitFor(() =>
      expect(castManeuverTransaction).toHaveBeenCalledWith("char-1", [
        { type: "castManeuver", entryId: "m-precision" },
      ]),
    );
    // 14 (attack) + 5 (server die), damage untouched (null).
    expect(onRollsUpdated).toHaveBeenCalledWith(14 + SERVER_ROLL, null);
  });

  it("folds the server-rolled die into the damage total for a damageRoll maneuver", async () => {
    const user = userEvent.setup();
    const onRollsUpdated = vi.fn();
    render(
      <ManeuverPrompt
        character={makeCharacter()}
        lastAttackRoll={null}
        lastDamageRoll={roll(9)}
        onRollsUpdated={onRollsUpdated}
        onUpdate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Trip Attack/ }));

    await waitFor(() => expect(castManeuverTransaction).toHaveBeenCalled());
    // Attack untouched (null), 9 (damage) + 5 (server die).
    expect(onRollsUpdated).toHaveBeenCalledWith(null, 9 + SERVER_ROLL);
  });

  it("renders nothing before any roll is made", () => {
    const { container } = render(
      <ManeuverPrompt
        character={makeCharacter()}
        lastAttackRoll={null}
        lastDamageRoll={null}
        onRollsUpdated={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
