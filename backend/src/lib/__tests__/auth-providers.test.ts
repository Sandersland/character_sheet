import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enabledProviders,
  getProvider,
} from "../auth/providers.js";

// No Postgres: the provider registry is pure (env in, descriptors out).

describe("auth provider registry", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("enabledProviders", () => {
    it("is empty when creds are absent", () => {
      expect(enabledProviders()).toEqual([]);
    });

    it("is empty when only one of id/secret is set", () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "client-only");
      expect(enabledProviders()).toEqual([]);
    });

    it("includes google with creds attached when both are set", () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "client-abc");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret-xyz");

      const providers = enabledProviders();
      expect(providers).toHaveLength(1);
      const google = providers[0];
      expect(google.id).toBe("google");
      expect(google.displayName).toBe("Google");
      expect(google.clientId).toBe("client-abc");
      expect(google.clientSecret).toBe("secret-xyz");
      expect(google.scopes).toEqual(["openid", "email", "profile"]);
      expect(google.authUrl).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    });
  });

  describe("getProvider", () => {
    it("returns undefined for an unknown id", () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "client-abc");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret-xyz");
      expect(getProvider("facebook")).toBeUndefined();
    });

    it("returns undefined for a known-but-disabled provider", () => {
      expect(getProvider("google")).toBeUndefined();
    });

    it("returns the provider when enabled", () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "client-abc");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret-xyz");
      expect(getProvider("google")?.id).toBe("google");
    });
  });

  describe("google mapProfile", () => {
    function google() {
      vi.stubEnv("GOOGLE_CLIENT_ID", "client-abc");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret-xyz");
      const provider = getProvider("google");
      if (!provider) throw new Error("expected google provider");
      return provider;
    }

    it("maps a verified-email profile", () => {
      const profile = google().mapProfile({
        sub: "1234567890",
        email: "player@example.com",
        email_verified: true,
        name: "Player One",
        picture: "https://img.example.com/p.png",
      });
      expect(profile).toEqual({
        providerAccountId: "1234567890",
        email: "player@example.com",
        name: "Player One",
        imageUrl: "https://img.example.com/p.png",
      });
    });

    it("nulls the email when unverified", () => {
      const profile = google().mapProfile({
        sub: "99",
        email: "sketchy@example.com",
        email_verified: false,
        name: "Sketchy",
      });
      expect(profile.email).toBeNull();
      expect(profile.providerAccountId).toBe("99");
      expect(profile.imageUrl).toBeNull();
    });

    it("rejects an unknown/invalid shape (no sub)", () => {
      expect(() => google().mapProfile({ email: "x@y.z" })).toThrow();
    });
  });
});
