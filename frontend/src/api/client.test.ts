import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkHealth,
  createCharacter,
  fetchCharacter,
  fetchCharacters,
  fetchItems,
  fetchReference,
  updateCharacter,
} from "./client";
import type { CreateCharacterInput } from "../types/character";

describe("checkHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when the backend responds ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok" }),
      })
    );

    await expect(checkHealth()).resolves.toBe(true);
  });

  it("returns false when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    await expect(checkHealth()).resolves.toBe(false);
  });
});

describe("fetchCharacters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed list on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "1", name: "Brielle", race: "Half-Elf", class: "Wizard", level: 7 },
        ],
      })
    );

    await expect(fetchCharacters()).resolves.toHaveLength(1);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchCharacters()).rejects.toThrow();
  });
});

describe("fetchCharacter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null for a 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(fetchCharacter("missing")).resolves.toBeNull();
  });

  it("throws on other non-ok responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchCharacter("1")).rejects.toThrow();
  });
});

describe("updateCharacter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a PATCH with a JSON body and returns the updated character", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "1", experiencePoints: 1300 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateCharacter("1", { experiencePoints: 1300 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1"),
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));

    await expect(updateCharacter("1", { experiencePoints: -1 })).rejects.toThrow();
  });
});

describe("fetchReference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed catalog on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          races: [{ id: "r1", name: "Human", speed: 30 }],
          classes: [],
          backgrounds: [],
          alignments: ["Lawful Good"],
        }),
      })
    );

    await expect(fetchReference()).resolves.toMatchObject({
      races: [{ name: "Human", speed: 30 }],
    });
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchReference()).rejects.toThrow();
  });
});

describe("fetchItems", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed item catalog on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "i1", name: "Club", category: "weapon", damageDice: "1d4", properties: ["light"] },
        ],
      })
    );

    await expect(fetchItems()).resolves.toMatchObject([{ name: "Club", category: "weapon" }]);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchItems()).rejects.toThrow();
  });
});

describe("createCharacter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const input: CreateCharacterInput = {
    name: "New Hero",
    alignment: "Lawful Good",
    race: "Human",
    background: "Soldier",
    classes: [{ name: "Fighter" }],
    abilityScores: {
      strength: 15,
      dexterity: 12,
      constitution: 14,
      intelligence: 8,
      wisdom: 10,
      charisma: 8,
    },
  };

  it("sends a POST with a JSON body and returns the created character", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new-1", name: "New Hero" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createCharacter(input);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters"),
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) })
    );
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));

    await expect(createCharacter(input)).rejects.toThrow();
  });
});
