import { describe, expect, it } from "vitest";

import { serializeCharacterSummary } from "../character-serialize.js";

// The persisted blob key never appears on the wire — only the relative /api path derived from it, cache-busted by the key's uuid filename segment.
describe("serializeCharacterSummary portraitUrl derivation (#1615)", () => {
  const base = {
    id: "char-portrait-unit",
    name: "Unit Fixture",
    ownerId: "owner-1",
    campaignId: null,
    experiencePoints: 0,
    raceSelection: null,
    classEntries: [],
  };

  it("derives a relative /api URL versioned by the key's uuid segment", () => {
    const version = "5a8c2c6f-4c92-4d1f-9d5a-8c0b1e2f3a4b";
    const summary = serializeCharacterSummary({
      ...base,
      portraitKey: `portraits/characters/${base.id}/${version}.webp`,
    });

    expect(summary.portraitUrl).toBe(`/api/characters/${base.id}/portrait?v=${version}`);
  });

  it("omits portraitUrl when there is no stored key", () => {
    const summary = serializeCharacterSummary({ ...base, portraitKey: null });

    expect(summary.portraitUrl).toBeUndefined();
  });

  it("never leaks the stored key into the serialized output", () => {
    const key = `portraits/characters/${base.id}/0f8fad5b-d9cb-469f-a165-70867728950e.webp`;
    const summary = serializeCharacterSummary({ ...base, portraitKey: key });

    expect(JSON.stringify(summary)).not.toContain(key);
  });
});
