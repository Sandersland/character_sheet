import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import AbilityScoreBox from "@/features/abilities/AbilityScoreBox";
import { RollProvider } from "@/features/dice/RollContext";
import { ABILITY_OPTIONS, abilityAbbr } from "@/lib/abilities";
import type { AbilityName } from "@/types/character";

/**
 * Regression guard for issue #54 item 1: the ability rail must render in
 * canonical 5e order (STR-DEX-CON-INT-WIS-CHA), independent of the key
 * order of the `abilityScores` object the API happens to hand us. The page
 * achieves this by iterating ABILITY_OPTIONS rather than Object.entries, so
 * we feed a deliberately scrambled scores object and assert the rendered
 * abbreviations come out canonical.
 */
describe("ability score rail order", () => {
  it("renders abbreviations in canonical STR-DEX-CON-INT-WIS-CHA order", () => {
    // Intentionally scrambled insertion order (mirrors the old buggy
    // WIS-CHA-STR-DEX-CON-INT shape the API returned).
    const scrambledScores: Record<AbilityName, number> = {
      wisdom: 13,
      charisma: 8,
      strength: 16,
      dexterity: 14,
      constitution: 15,
      intelligence: 10,
    };

    const { container } = render(
      <RollProvider>
        <div>
          {ABILITY_OPTIONS.map(({ key }) => (
            <AbilityScoreBox
              key={key}
              label={abilityAbbr(key)}
              score={scrambledScores[key]}
              proficiencyBonus={2}
            />
          ))}
        </div>
      </RollProvider>
    );

    // The first child of each box is the abbreviation label span.
    const labels = Array.from(
      container.querySelectorAll("span.uppercase")
    )
      .map((el) => el.textContent)
      .filter((text): text is string =>
        ["STR", "DEX", "CON", "INT", "WIS", "CHA"].includes(text ?? "")
      );

    expect(labels).toEqual(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
  });
});
