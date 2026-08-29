import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import AbilityScoreBox from "@/features/abilities/AbilityScoreBox";
import { RollProvider } from "@/features/dice/RollContext";
import { abilityAbbr, orderedAbilityEntries } from "@/lib/abilities";
import type { AbilityName } from "@/types/character";

describe("orderedAbilityEntries", () => {
  const scrambledScores: Record<AbilityName, number> = {
    wisdom: 13,
    charisma: 8,
    strength: 16,
    dexterity: 14,
    constitution: 15,
    intelligence: 10,
  };

  it("returns keys in canonical STR-DEX-CON-INT-WIS-CHA order", () => {
    const keys = orderedAbilityEntries(scrambledScores).map(([key]) => key);

    expect(keys).toEqual([
      "strength",
      "dexterity",
      "constitution",
      "intelligence",
      "wisdom",
      "charisma",
    ]);
  });

  it("carries each score through without dropping or mismapping", () => {
    const entries = orderedAbilityEntries(scrambledScores);

    for (const [key, value] of entries) {
      expect(value).toBe(scrambledScores[key]);
    }
    expect(Object.fromEntries(entries)).toEqual(scrambledScores);
  });

  it("renders abbreviations in canonical order when used to drive the rail", () => {
    const { container } = render(
      <RollProvider>
        <div>
          {orderedAbilityEntries(scrambledScores).map(([key, score]) => (
            <AbilityScoreBox
              key={key}
              ability={key}
              label={abilityAbbr(key)}
              score={score}
              proficiencyBonus={2}
            />
          ))}
        </div>
      </RollProvider>
    );

    const labels = Array.from(container.querySelectorAll("span.uppercase"))
      .map((el) => el.textContent)
      .filter((text): text is string =>
        ["STR", "DEX", "CON", "INT", "WIS", "CHA"].includes(text ?? "")
      );

    expect(labels).toEqual(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
  });
});
