import { describe, expect, it } from "vitest";

import { createCharacter } from "@/lib/character/create/index.js";
import type { CreateCharacterBody } from "@/lib/character/character-schemas.js";

describe("createCharacter defensive guards", () => {
  it("returns a 400 result when classes is empty (no classes[0] deref)", async () => {
    const input = {
      name: "Nameless",
      race: "Human",
      background: "Acolyte",
      alignment: "True Neutral",
      classes: [],
    } as unknown as CreateCharacterBody;

    const result = await createCharacter(input, "owner-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/class/i);
    }
  });

  it("returns a 400 result for an unknown alignment (no DB access)", async () => {
    const input = {
      name: "Nameless",
      race: "Human",
      background: "Acolyte",
      alignment: "Chaotic Confused",
      classes: [{ name: "Fighter" }],
    } as unknown as CreateCharacterBody;

    const result = await createCharacter(input, "owner-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/alignment/i);
    }
  });

  // Ability score validation runs before resolveSelections, so these never touch the DB.
  const STRAIGHT_TWENTIES = {
    strength: 20, dexterity: 20, constitution: 20, intelligence: 20, wisdom: 20, charisma: 20,
  };

  it("returns a 400 result for straight 20s claimed as the standard array", async () => {
    const input = {
      name: "Nameless",
      background: "Acolyte",
      alignment: "True Neutral",
      classes: [{ name: "Fighter" }],
      abilityScores: STRAIGHT_TWENTIES,
      abilityGenerationMethod: "standardArray",
    } as unknown as CreateCharacterBody;

    const result = await createCharacter(input, "owner-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/standard array/i);
    }
  });

  it("returns a 400 result for straight 20s claimed as point buy (over the 15 ceiling)", async () => {
    const input = {
      name: "Nameless",
      background: "Acolyte",
      alignment: "True Neutral",
      classes: [{ name: "Fighter" }],
      abilityScores: STRAIGHT_TWENTIES,
      abilityGenerationMethod: "pointBuy",
    } as unknown as CreateCharacterBody;

    const result = await createCharacter(input, "owner-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/8 and 15/);
    }
  });

  it("returns a 400 result for an out-of-bound score with no declared method", async () => {
    const input = {
      name: "Nameless",
      background: "Acolyte",
      alignment: "True Neutral",
      classes: [{ name: "Fighter" }],
      abilityScores: { strength: 31, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    } as unknown as CreateCharacterBody;

    const result = await createCharacter(input, "owner-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/1 and 30/);
    }
  });
});
