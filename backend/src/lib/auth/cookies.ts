import type { Request, Response } from "express";

import { config } from "../config.js";

// Method-agnostic cookie handling. No cookie-parser dependency — cookies are
// parsed and serialized by hand so the only client state is opaque, HttpOnly
// tokens. Any auth method (OAuth today, password/magic-link later) reuses these.

// Parse a raw Cookie header into a name→value map. Tolerates missing header,
// stray whitespace, empty segments, and values containing "=".
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;

  for (const segment of header.split(";")) {
    const eq = segment.indexOf("=");
    if (eq < 0) continue;
    const name = segment.slice(0, eq).trim();
    if (!name) continue;
    const value = segment.slice(eq + 1).trim();
    out[name] = decodeURIComponent(value);
  }
  return out;
}

export function getCookie(req: Request, name: string): string | undefined {
  return parseCookies(req.headers.cookie)[name];
}

export interface CookieOptions {
  maxAgeSeconds?: number;
  // Defaults to config.SESSION_COOKIE_SECURE; pass explicitly to override.
  secure?: boolean;
}

// Serialize a Set-Cookie value. Always HttpOnly + SameSite=Lax + Path=/. Secure
// follows config unless overridden. A maxAge of 0 expires the cookie (clear).
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
): string {
  const secure = options.secure ?? config.SESSION_COOKIE_SECURE;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
  ];
  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${options.maxAgeSeconds}`);
  }
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

// Append a Set-Cookie header on a response.
export function setCookie(
  res: Response,
  name: string,
  value: string,
  maxAgeSeconds: number,
): void {
  res.append("Set-Cookie", serializeCookie(name, value, { maxAgeSeconds }));
}

// Expire a cookie (Max-Age=0).
export function clearCookie(res: Response, name: string): void {
  res.append("Set-Cookie", serializeCookie(name, "", { maxAgeSeconds: 0 }));
}
