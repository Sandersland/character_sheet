import { afterEach, describe, expect, it, vi } from "vitest";

import { checkHealth, fetchAuthProviders, fetchMe, logout } from "@/api/auth";
import { setUnauthorizedHandler } from "@/api/http";

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

describe("fetchAuthProviders", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the providers array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          providers: [{ id: "google", displayName: "Google", startUrl: "http://x/api/auth/google/start" }],
        }),
      }),
    );

    await expect(fetchAuthProviders()).resolves.toEqual([
      { id: "google", displayName: "Google", startUrl: "http://x/api/auth/google/start" },
    ]);
  });
});

describe("fetchMe", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(null);
  });

  it("returns the user on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: { id: "u1", email: "a@b.c", name: "Ada", imageUrl: null } }),
      }),
    );

    await expect(fetchMe()).resolves.toMatchObject({ id: "u1", email: "a@b.c" });
  });

  it("returns null on 401 WITHOUT firing the unauthorized handler", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    await expect(fetchMe()).resolves.toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("logout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /auth/logout with credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await logout();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/logout"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});
