import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import AbilityScoreEditor from "@/features/abilities/AbilityScoreEditor";
import { STANDARD_ARRAY } from "@/lib/abilityGen";
import { ABILITY_LABELS } from "@/lib/abilities";
import { axe } from "@/test/axe";
import type { AbilityName, AbilityScores } from "@/types/character";

const SCORES: AbilityScores = {
  strength: 15,
  dexterity: 14,
  constitution: 13,
  intelligence: 12,
  wisdom: 10,
  charisma: 8,
};

const EMPTY_ASSIGNMENTS: Record<AbilityName, number | null> = {
  strength: null,
  dexterity: null,
  constitution: null,
  intelligence: null,
  wisdom: null,
  charisma: null,
};

const noop = () => {};

describe("AbilityScoreEditor accessibility", () => {
  it("labels every manual-entry input (method=manual)", async () => {
    const { container } = render(
      <AbilityScoreEditor
        method="manual"
        pool={null}
        assignments={EMPTY_ASSIGNMENTS}
        abilityScores={SCORES}
        onMethodChange={noop}
        onPoolChange={noop}
        onAssignmentsChange={noop}
        onScoresChange={noop}
      />
    );

    // Each ability name resolves a focusable number input by its accessible name.
    for (const ability of Object.keys(ABILITY_LABELS) as AbilityName[]) {
      expect(
        screen.getByLabelText(ABILITY_LABELS[ability])
      ).toBeInTheDocument();
    }

    expect(await axe(container)).toHaveNoViolations();
  });

  it("labels every slot-assignment select (method=standardArray)", async () => {
    const { container } = render(
      <AbilityScoreEditor
        method="standardArray"
        pool={[...STANDARD_ARRAY]}
        assignments={EMPTY_ASSIGNMENTS}
        abilityScores={SCORES}
        onMethodChange={noop}
        onPoolChange={noop}
        onAssignmentsChange={noop}
        onScoresChange={noop}
      />
    );

    for (const ability of Object.keys(ABILITY_LABELS) as AbilityName[]) {
      expect(
        screen.getByLabelText(ABILITY_LABELS[ability])
      ).toBeInTheDocument();
    }

    expect(await axe(container)).toHaveNoViolations();
  });

  it("names every point-buy stepper button (method=pointBuy)", async () => {
    const { container } = render(
      <AbilityScoreEditor
        method="pointBuy"
        pool={null}
        assignments={EMPTY_ASSIGNMENTS}
        abilityScores={SCORES}
        onMethodChange={noop}
        onPoolChange={noop}
        onAssignmentsChange={noop}
        onScoresChange={noop}
      />
    );

    for (const ability of Object.keys(ABILITY_LABELS) as AbilityName[]) {
      const label = ABILITY_LABELS[ability];
      expect(
        screen.getByRole("button", { name: `Increase ${label}` })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `Decrease ${label}` })
      ).toBeInTheDocument();
    }

    expect(await axe(container)).toHaveNoViolations();
  });
});
