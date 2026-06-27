import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enabledProviders,
  getProvider,
} from "../auth/oauth/registry.js";

// No Postgres: the provider registry is pure (env in, descriptors out).
// Per-provider profile mapping is tested in isolation in the provider's own
// test (e.g. auth-google-provider.test.ts).

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
});
