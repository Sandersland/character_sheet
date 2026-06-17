import { afterEach, describe, expect, it, vi } from "vitest";

import { checkHealth } from "./client";

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
