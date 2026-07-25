import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch, jsonBody, postTransactions, rawFetch, request, send, setUnauthorizedHandler } from "@/api/http";

// New direct coverage for the shared plumbing (#1270) — previously only
// exercised indirectly through domain callers in client.test.ts.
describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(null);
  });

  it("sends credentials: include, prefixed with API_URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/health");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/health"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("fires the registered unauthorized handler on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    await apiFetch("/characters");

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// rawFetch is the deliberately-un-hooked seam behind fetchMe's "am I signed
// in?" probe: a 401 there is the expected answer, not a dead session.
describe("rawFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(null);
  });

  it("does NOT fire the unauthorized handler on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    await rawFetch("/auth/me");

    expect(handler).not.toHaveBeenCalled();
  });

  it("still sends credentials: include, prefixed with API_URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await rawFetch("/auth/me");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/me"),
      expect.objectContaining({ credentials: "include" }),
    );
  });
});

describe("jsonBody", () => {
  it("defaults to POST with a JSON content-type header and stringified body", () => {
    expect(jsonBody({ a: 1 })).toEqual({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
  });

  it("accepts an override method", () => {
    expect(jsonBody({ a: 1 }, "PATCH")).toMatchObject({ method: "PATCH" });
  });
});

describe("request<T> / send direct coverage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("request resolves the parsed JSON body on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ a: 1 }) }));

    await expect(request("/x", undefined, "Failed to fetch x")).resolves.toEqual({ a: 1 });
  });

  it("request throws the labeled message on a non-ok response with no JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null }));

    await expect(request("/x", undefined, "Failed to fetch x")).rejects.toThrow("Failed to fetch x (500)");
  });

  it("send resolves without parsing a body on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    await expect(send("/x", undefined, "Failed to send x")).resolves.toBeUndefined();
  });
});

describe("postTransactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs { operations } to /characters/:id/:domain/transactions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const operations = [{ type: "acquire" }];
    await postTransactions("1", "inventory", operations, "Failed to apply inventory transactions");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/inventory/transactions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ operations }) }),
    );
  });
});
