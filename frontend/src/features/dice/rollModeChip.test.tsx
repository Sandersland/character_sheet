import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { logRoll } from "@/api/client";
import { RollProvider } from "@/features/dice/RollContext";
import AbilityScoreBox from "@/features/abilities/AbilityScoreBox";
import type { RollResult, RollSpec } from "@/lib/dice";
import type { RollModifier } from "@/types/character";

vi.mock("@/api/client", () => ({ logRoll: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/features/dice/DiceRoller", () => ({
  default: function MockDiceRoller({ onResult, spec }: { onResult?: (r: RollResult) => void; spec?: RollSpec }) {
    useEffect(() => {
      const modifier = spec?.modifier ?? 0;
      onResult?.({ dice: [{ value: 11, dropped: false }], modifier, total: 11 + modifier, spec: spec ?? { count: 1, faces: 20, modifier } });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="dice-roller" />;
  },
}));

const mockLogRoll = vi.mocked(logRoll);

const rage: RollModifier[] = [
  { mode: "advantage", kind: "check", ability: "strength", source: "Rage" },
  { mode: "advantage", kind: "save", ability: "strength", source: "Rage" },
];
const poisonedCheck: RollModifier[] = [{ mode: "disadvantage", kind: "check", source: "Poisoned" }];

function renderStrengthBox(rollModifiers: RollModifier[]) {
  return render(
    <RollProvider characterId="c1" sessionId="s1" rollModifiers={rollModifiers}>
      <AbilityScoreBox ability="strength" label="Strength" score={16} saveProficient proficiencyBonus={2} />
    </RollProvider>,
  );
}

describe("state-driven roll mode + source chip (#486)", () => {
  beforeEach(() => mockLogRoll.mockClear());

  it("shows an advantage chip and rolls with advantage on a Strength check while raging", async () => {
    const user = userEvent.setup();
    renderStrengthBox(rage);
    // Rage grants advantage on both Strength checks and saves, so both affordances chip.
    expect(screen.getAllByText("advantage — Rage")).toHaveLength(2);

    await user.click(screen.getByTitle(/Roll Strength check/));
    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][2]).toMatchObject({ kind: "check", rollMode: "advantage" });
  });

  it("shows no chip and rolls normally once no state applies (Rage ended)", async () => {
    const user = userEvent.setup();
    renderStrengthBox([]);
    expect(screen.queryByTestId("roll-mode-chip")).toBeNull();

    await user.click(screen.getByTitle(/Roll Strength check/));
    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][2].rollMode).toBe("normal");
  });

  it("cancels advantage + disadvantage from different sources to normal (RAW)", async () => {
    const user = userEvent.setup();
    renderStrengthBox([...rage, ...poisonedCheck]);
    // Chip surfaces both sources; the resolved mode is normal.
    const chip = screen.getAllByTestId("roll-mode-chip")[0];
    expect(chip.textContent).toContain("normal");
    expect(chip.textContent).toContain("Rage");
    expect(chip.textContent).toContain("Poisoned");

    await user.click(screen.getByTitle(/Roll Strength check/));
    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][2].rollMode).toBe("normal");
  });

  it("keeps an ability-scoped grant off a non-matching ability (no chip on a Strength save vs a check-only grant)", () => {
    renderStrengthBox(poisonedCheck);
    // Poisoned disadvantage is check-only; the Save affordance must not show a chip.
    // The check affordance does (disadvantage — Poisoned).
    expect(screen.getByText("disadvantage — Poisoned")).toBeInTheDocument();
    expect(screen.getAllByTestId("roll-mode-chip")).toHaveLength(1);
  });
});
