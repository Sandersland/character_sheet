import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchAuthProviders,
  fetchCharacters,
  fetchMe,
  logout,
  setUnauthorizedHandler,
} from "./client";

describe("auth client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(null);
  });

  describe("fetchAuthProviders", () => {
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

  describe("credentials + centralized 401", () => {
    it("sends credentials: include on a domain request", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
      vi.stubGlobal("fetch", fetchMock);

      await fetchCharacters();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: "include" }),
      );
    });

    it("fires the registered unauthorized handler on a 401 from a domain request", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
      const handler = vi.fn();
      setUnauthorizedHandler(handler);

      await expect(fetchCharacters()).rejects.toThrow();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
