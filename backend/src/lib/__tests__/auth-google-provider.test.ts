import { describe, expect, it } from "vitest";

import { googleProvider } from "../auth/providers/google.js";

// The provider's profile mapping is pure and independent of the registry/env —
// test it directly off the exported definition (no creds, no stubbing).

describe("googleProvider.mapProfile", () => {
  it("maps a verified-email profile", () => {
    const profile = googleProvider.mapProfile({
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
    const profile = googleProvider.mapProfile({
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
    expect(() => googleProvider.mapProfile({ email: "x@y.z" })).toThrow();
  });
});
