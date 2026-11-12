import { describe, expect, it } from "vitest";

import { enabledProviders, getProvider } from "@/lib/auth/oauth/registry.js";

const none = { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined };
const both = { GOOGLE_CLIENT_ID: "client-abc", GOOGLE_CLIENT_SECRET: "secret-xyz" };

describe("auth provider registry", () => {
  describe("enabledProviders", () => {
    it("is empty when creds are absent", () => {
      expect(enabledProviders(none)).toEqual([]);
    });

    it("is empty when only one of id/secret is set", () => {
      expect(enabledProviders({ ...none, GOOGLE_CLIENT_ID: "client-only" })).toEqual([]);
    });

    it("includes google with creds attached when both are set", () => {
      const providers = enabledProviders(both);
      expect(providers).toHaveLength(1);
      const google = providers[0];
      expect(google.id).toBe("google");
      expect(google.displayName).toBe("Google");
      expect(google.clientId).toBe("client-abc");
      expect(google.clientSecret).toBe("secret-xyz");
      expect(google.scopes).toEqual(["openid", "email", "profile"]);
      expect(google.authUrl).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      // Resolution must forward provider-specific descriptor fields, not just the core ones.
      expect(google.extraAuthParams).toEqual({
        access_type: "offline",
        prompt: "consent",
      });
    });
  });

  describe("getProvider", () => {
    it("returns undefined for an unknown id", () => {
      expect(getProvider("facebook", both)).toBeUndefined();
    });

    it("returns undefined for a known-but-disabled provider", () => {
      expect(getProvider("google", none)).toBeUndefined();
    });

    it("returns the provider when enabled", () => {
      expect(getProvider("google", both)?.id).toBe("google");
    });
  });
});
