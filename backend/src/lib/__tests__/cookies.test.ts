import { describe, expect, it } from "vitest";

import { parseCookies, serializeCookie } from "../auth/cookies.js";

// Pure cookie parsing/serialization — no Postgres, no env beyond the config
// default for Secure (overridden explicitly here).

describe("parseCookies", () => {
  it("returns {} for a missing header", () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  it("parses multiple cookies and trims whitespace", () => {
    expect(parseCookies("a=1; b=2;  c=3")).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("keeps values containing '='", () => {
    expect(parseCookies("token=ab=cd==")).toEqual({ token: "ab=cd==" });
  });

  it("skips segments without '=' and empty names", () => {
    expect(parseCookies("garbage; =val; ok=yes")).toEqual({ ok: "yes" });
  });

  it("URL-decodes values", () => {
    expect(parseCookies("x=a%20b")).toEqual({ x: "a b" });
  });
});

describe("serializeCookie", () => {
  it("includes HttpOnly, SameSite=Lax, Path=/ and Max-Age", () => {
    const header = serializeCookie("cs_session", "tok", { maxAgeSeconds: 600, secure: false });
    expect(header).toContain("cs_session=tok");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).toContain("Max-Age=600");
    expect(header).not.toContain("Secure");
  });

  it("appends Secure when secure is true", () => {
    expect(serializeCookie("n", "v", { secure: true })).toContain("Secure");
  });

  it("URL-encodes the value", () => {
    expect(serializeCookie("n", "a b", { secure: false })).toContain("n=a%20b");
  });
});
