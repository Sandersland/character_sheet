import { afterEach, describe, expect, it, vi } from "vitest";

import { randomId } from "@/lib/ids";

describe("randomId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns unique non-empty ids", () => {
    const a = randomId();
    const b = randomId();
    expect(a).not.toEqual("");
    expect(a).not.toEqual(b);
  });

  it("works where crypto.randomUUID is absent (insecure contexts)", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    const a = randomId();
    const b = randomId();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toEqual(b);
  });

  it("stays within the roll log's 100-char swingId bound", () => {
    expect(randomId().length).toBeLessThanOrEqual(100);
  });
});
