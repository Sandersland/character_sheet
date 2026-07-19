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
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mock fires onResult once on mount; empty deps intentional
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
// 2024 exhaustion level 2: flat −4 on every d20 Test (#1136).
const exhaustion2: RollModifier[] = [
  { mode: "flat", modifier: -4, kind: "attack", source: "Exhaustion" },
  { mode: "flat", modifier: -4, kind: "check", source: "Exhaustion" },
  { mode: "flat", modifier: -4, kind: "save", source: "Exhaustion" },
  { mode: "flat", modifier: -4, kind: "initiative", source: "Exhaustion" },
];

function renderStrengthBox(rollModifiers: RollModifier[]) {
  return render(
    <RollProvider characterId="c1" sessionId="s1" rollModifiers={rollModifiers}>
      <AbilityScoreBox ability="strength" label="Strength" score={16} saveProficient proficiencyBonus={2} />
    </RollProvider>,
  );
}

// #984: the per-row "why" TEXT chip is gone — the reason lives once in the
// ConditionRollBanner above the rails. An affected roll affordance shows only a
// subtle, non-text amber dot, and the roll STILL auto-applies the resolved mode.
describe("state-driven roll mode + affected-row indicator (#486/#984)", () => {
  beforeEach(() => mockLogRoll.mockClear());

  it("marks affected affordances with a dot (no text) and still rolls with advantage while raging", async () => {
    const user = userEvent.setup();
    renderStrengthBox(rage);
    // Rage grants advantage on both Strength checks and saves → both affordances
    // get the dot; neither renders the old "advantage — Rage" stamp.
    expect(screen.getAllByTestId("roll-mode-indicator")).toHaveLength(2);
    expect(screen.queryByText(/advantage — Rage/i)).toBeNull();
    expect(screen.queryByTestId("roll-mode-chip")).toBeNull();

    await user.click(screen.getByTitle(/Roll Strength check/));
    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][2]).toMatchObject({ kind: "check", rollMode: "advantage" });
  });

  it("shows no indicator and rolls normally once no state applies (Rage ended)", async () => {
    const user = userEvent.setup();
    renderStrengthBox([]);
    expect(screen.queryByTestId("roll-mode-indicator")).toBeNull();

    await user.click(screen.getByTitle(/Roll Strength check/));
    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][2].rollMode).toBe("normal");
  });

  it("still cancels advantage + disadvantage from different sources to normal (RAW)", async () => {
    const user = userEvent.setup();
    renderStrengthBox([...rage, ...poisonedCheck]);
    // Both sources apply to a Strength check, so it stays marked, but resolves normal.
    expect(screen.getAllByTestId("roll-mode-indicator").length).toBeGreaterThan(0);

    await user.click(screen.getByTitle(/Roll Strength check/));
    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][2].rollMode).toBe("normal");
  });

  it("keeps an ability/category-scoped grant off a non-matching affordance", () => {
    renderStrengthBox(poisonedCheck);
    // Poisoned disadvantage is check-only: the Strength CHECK affordance is
    // marked; the Strength SAVE affordance is not.
    expect(screen.getAllByTestId("roll-mode-indicator")).toHaveLength(1);
  });

  it("folds an exhaustion flat penalty into the rolled check and still rolls normal (#1136)", async () => {
    const user = userEvent.setup();
    renderStrengthBox(exhaustion2);
    // Both the check and save affordances are marked (the flat penalty hits every d20 Test).
    expect(screen.getAllByTestId("roll-mode-indicator").length).toBeGreaterThan(0);

    await user.click(screen.getByTitle(/Roll Strength check/));
    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    const log = mockLogRoll.mock.calls[0][2];
    expect(log.rollMode).toBe("normal");
    // Strength 16 → +3 check, minus exhaustion −4 → −1; d20 face 11 → total 10.
    expect(log.total).toBe(10);
  });
});
