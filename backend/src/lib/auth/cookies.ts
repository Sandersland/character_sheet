import type { Request, Response } from "express";

import { config } from "@/lib/core/config.js";

// No cookie-parser dependency — cookies are parsed and serialized by hand so the only client state is opaque, HttpOnly tokens.
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;

  for (const segment of header.split(";")) {
    const eq = segment.indexOf("=");
    if (eq < 0) continue;
    const name = segment.slice(0, eq).trim();
    if (!name) continue;
    const value = segment.slice(eq + 1).trim();
    // One malformed cookie must not 500 every auth endpoint — fall back to the raw value.
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
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

// Always HttpOnly + SameSite=Lax + Path=/. Secure follows config unless overridden.
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

export function setCookie(
  res: Response,
  name: string,
  value: string,
  maxAgeSeconds: number,
): void {
  res.append("Set-Cookie", serializeCookie(name, value, { maxAgeSeconds }));
}

export function clearCookie(res: Response, name: string): void {
  res.append("Set-Cookie", serializeCookie(name, "", { maxAgeSeconds: 0 }));
}
