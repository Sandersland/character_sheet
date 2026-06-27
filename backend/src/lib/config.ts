import { z } from "zod";

// Central, zod-validated config for the auth/session layer. Read once at import
// time and frozen, so every consumer sees the same immutable snapshot.
//
// Design notes:
//   - Provider creds (GOOGLE_CLIENT_ID/SECRET) are OPTIONAL: a no-creds deploy
//     must still boot (the provider is simply reported as disabled, see
//     lib/auth/oauth/registry.ts). Never make them required here.
//   - Empty-string env vars are treated as "unset" so a blank value in a .env
//     file or a CI default doesn't masquerade as a configured cred.
//   - logger.ts / security.ts / prisma.ts deliberately read env directly at
//     import; this module does NOT subsume them (changing those risks
//     destabilizing the test suite). It owns only the auth-facing env.

// Trim and collapse empty strings to undefined so `.optional()` behaves the way
// "missing OR blank" intuitively should.
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// SESSION_COOKIE_SECURE is a tri-state: explicit truthy/falsey string wins;
// otherwise it defaults to "on in production, off elsewhere". z.coerce.boolean
// is unusable here because it treats the string "false" as truthy.
function parseSecure(raw: string | undefined, isProd: boolean): boolean {
  const value = clean(raw)?.toLowerCase();
  if (value === undefined) return isProd;
  return value === "true" || value === "1" || value === "yes";
}

const schema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:4000"),
  SESSION_COOKIE_SECURE: z.boolean(),
  BOOTSTRAP_OWNER_EMAIL: z.string().min(1).optional(),
  // Pass-through values other modules read; kept here so the full auth-relevant
  // surface is documented in one place.
  CORS_ORIGIN: z.string().optional(),
  SERVE_STATIC_DIR: z.string().optional(),
  PORT: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

function loadConfig(): Config {
  const env = process.env;
  const isProd = env.NODE_ENV === "production";

  const parsed = schema.parse({
    GOOGLE_CLIENT_ID: clean(env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: clean(env.GOOGLE_CLIENT_SECRET),
    APP_BASE_URL: clean(env.APP_BASE_URL),
    SESSION_COOKIE_SECURE: parseSecure(env.SESSION_COOKIE_SECURE, isProd),
    BOOTSTRAP_OWNER_EMAIL: clean(env.BOOTSTRAP_OWNER_EMAIL),
    CORS_ORIGIN: clean(env.CORS_ORIGIN),
    SERVE_STATIC_DIR: clean(env.SERVE_STATIC_DIR),
    PORT: clean(env.PORT),
  });

  return Object.freeze(parsed);
}

export const config: Config = loadConfig();

// The OAuth redirect/callback URI for a given provider, e.g.
// http://localhost:4000/api/auth/google/callback. This is the value that must
// be registered with the provider (Google Cloud console).
export function appRedirectUri(providerId: string): string {
  return `${config.APP_BASE_URL}/api/auth/${providerId}/callback`;
}
