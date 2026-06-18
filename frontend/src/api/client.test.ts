import { afterEach, describe, expect, it, vi } from "vitest";

import { checkHealth, fetchCharacter, fetchCharacters, updateCharacter } from "./client";

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
