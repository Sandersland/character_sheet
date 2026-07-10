import { describe, expect, it } from "vitest";

import { createCharacter } from "@/lib/character-create.js";
import type { CreateCharacterBody } from "@/lib/character-schemas.js";

// The empty-classes guard returns before any DB access, so this needs no Postgres.
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

  // The alignment guard also short-circuits before any DB access.
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
});
