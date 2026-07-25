import { afterEach, describe, expect, it, vi } from "vitest";

import { applySpellcastingTransactions } from "@/api/spells";
import type { SpellcastingOperation } from "@/types/character";

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
