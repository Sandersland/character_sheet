import { describe, expect, it } from "vitest";

import {
  challengeFromVerifier,
  createVerifier,
  randomState,
} from "@/lib/auth/oauth/pkce.js";

// OAuth-only PKCE/state primitives — pure crypto, no Postgres or env.

describe("PKCE / state primitives", () => {
  it("randomState and createVerifier produce non-empty distinct tokens", () => {
    expect(randomState()).not.toBe(randomState());
    expect(createVerifier().length).toBeGreaterThan(20);
  });

  it("challengeFromVerifier is deterministic S256 (RFC 7636 test vector)", () => {
    // RFC 7636 Appendix B verifier/challenge pair.
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(challengeFromVerifier(verifier)).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});
