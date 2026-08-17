import { afterEach, describe, expect, it, vi } from "vitest";

import { applyResolveActionOperations } from "@/api/combat";
import type { ResolveActionOperation } from "@/api/combat";

describe("applyResolveActionOperations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const op: ResolveActionOperation = {
    type: "resolveAction",
    actionId: "action-1",
    source: "Longbow",
    cost: { kind: "action" },
    toHit: { faces: [15], kept: 15, nat20: false, bonus: 5, total: 20, verdict: "hit" },
    effect: { spec: "1d8+3", faces: [6], total: 9, type: "piercing", kind: "damage", crit: false },
  };

  it("sends a POST and splits the wire shape into character + batchId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1", batchId: "batch-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await applyResolveActionOperations("1", [op]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/resolve-action/transactions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ operations: [op] }) }),
    );
    expect(result).toEqual({ character: { id: "1" }, batchId: "batch-1" });
  });

  it("throws the server's error message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "Invalid cost kind" }) }),
    );

    await expect(applyResolveActionOperations("1", [op])).rejects.toThrow("Invalid cost kind");
  });
});
