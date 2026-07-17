import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { logRoll } from "@/api/client";
import { RollProvider } from "@/features/dice/RollContext";
import AllSkillsCard from "@/features/abilities/AllSkillsCard";
import AbilityScoreBox from "@/features/abilities/AbilityScoreBox";
import BannerVitals from "@/features/character-meta/BannerVitals";
import type { RollResult, RollSpec } from "@/lib/dice";
import type { AbilityScores, Character, Skill } from "@/types/character";

vi.mock("@/api/client", () => ({
  logRoll: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/dice/DiceRoller", () => ({
  default: function MockDiceRoller({
    onResult,
    spec,
  }: {
    onResult?: (r: RollResult) => void;
    spec?: RollSpec;
  }) {
    useEffect(() => {
      const modifier = spec?.modifier ?? 0;
      onResult?.({
        dice: [{ value: 11, dropped: false }],
        modifier,
        total: 11 + modifier,
        spec: { count: 1, faces: 20, modifier },
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="dice-roller" />;
  },
}));

const mockLogRoll = vi.mocked(logRoll);

const scores: AbilityScores = {
  strength: 14,
  dexterity: 12,
  constitution: 10,
  intelligence: 10,
  wisdom: 16,
  charisma: 10,
};

function renderInSession(ui: React.ReactElement) {
  return render(
    <RollProvider characterId="char-1" sessionId="sess-1">
      {ui}
    </RollProvider>,
  );
}

describe("roll affordances log their category event", () => {
  beforeEach(() => mockLogRoll.mockClear());

  it("skill check logs a check with ability + skill keys", async () => {
    const user = userEvent.setup();
    const skills: Skill[] = [
      { name: "perception", ability: "wisdom", proficient: true },
    ];
    renderInSession(
      <AllSkillsCard skills={skills} abilityScores={scores} proficiencyBonus={2} />,
    );

    // WIS 16 → +3, proficient +2 = +5.
    await user.click(screen.getByTitle(/Roll Perception check/));

    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][2]).toMatchObject({
      kind: "check",
      source: "Perception check",
      ability: "wisdom",
      skill: "perception",
    });
  });

  it("ability save logs a save with the ability key", async () => {
    const user = userEvent.setup();
    renderInSession(
      <AbilityScoreBox
        ability="strength"
        label="Strength"
        score={14}
        saveProficient
        proficiencyBonus={2}
      />,
    );

    await user.click(screen.getByTitle(/Roll Strength save/));

    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][2]).toMatchObject({
      kind: "save",
      source: "Strength save",
      ability: "strength",
    });
  });

  it("initiative logs an initiative roll", async () => {
    const user = userEvent.setup();
    const character = { initiativeBonus: 2, armorClass: 13, armorClassBreakdown: [], speed: 30, proficiencyBonus: 2, hitPoints: { current: 10, max: 10, temp: 0 } } as unknown as Character;
    renderInSession(<BannerVitals character={character} />);

    await user.click(screen.getByTitle(/Roll Initiative/));

    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][2]).toMatchObject({
      kind: "initiative",
      source: "Initiative",
    });
  });
});
