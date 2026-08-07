import { afterEach, describe, expect, it, vi } from "vitest";

import { applySpellcastingTransactions, createCustomSpell, deleteCustomSpell, updateCustomSpell } from "@/api/spells";
import type { HomebrewSpellInput, SpellcastingOperation } from "@/types/character";

// New coverage (#1270) — applySpellcastingTransactions had no direct test in
// client.test.ts (only exercised transitively through other suites).
describe("applySpellcastingTransactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a POST with the operations batch and returns the updated character", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const operations: SpellcastingOperation[] = [{ type: "castSpell", entryId: "s1", slotLevel: 1, roll: 0 }];
    await applySpellcastingTransactions("1", operations);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/spellcasting/transactions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ operations }) })
    );
  });

  it("throws the server's error message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "No slot available at that level" }),
      })
    );

    await expect(
      applySpellcastingTransactions("1", [{ type: "castSpell", entryId: "s1", slotLevel: 1, roll: 0 }])
    ).rejects.toThrow("No slot available at that level");
  });
});

// #1787, epic #1782 4/5: user-owned homebrew spell CRUD (POST/PATCH/DELETE
// /api/spells/custom). Plain REST, same shape as createCampaignItem/
// updateCampaignItem/deleteCampaignItem in api/campaign.ts.
const HOMEBREW_INPUT: HomebrewSpellInput = {
  name: "Test Bolt",
  level: 1,
  school: "evocation",
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  description: "A bolt of test energy.",
  classes: ["wizard"],
};

describe("createCustomSpell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a POST with the spell body and returns the created homebrew spell", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "s1", ownerId: "u1", edition: "EDITION_2014", ...HOMEBREW_INPUT }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createCustomSpell(HOMEBREW_INPUT);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/spells/custom"),
      expect.objectContaining({ method: "POST", body: JSON.stringify(HOMEBREW_INPUT) })
    );
    expect(result).toMatchObject({ id: "s1", ownerId: "u1" });
  });

  it("throws the server's error message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "level must be between 0 and 9" }) })
    );

    await expect(createCustomSpell(HOMEBREW_INPUT)).rejects.toThrow("level must be between 0 and 9");
  });
});

describe("updateCustomSpell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a PATCH to the spell's id with the full replacement body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "s1", ownerId: "u1", edition: "EDITION_2014", ...HOMEBREW_INPUT }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateCustomSpell("s1", HOMEBREW_INPUT);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/spells/custom/s1"),
      expect.objectContaining({ method: "PATCH", body: JSON.stringify(HOMEBREW_INPUT) })
    );
  });
});

describe("deleteCustomSpell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a DELETE to the spell's id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await deleteCustomSpell("s1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/spells/custom/s1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("throws the server's error message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Forbidden" }) })
    );

    await expect(deleteCustomSpell("s1")).rejects.toThrow("Forbidden");
  });
});
