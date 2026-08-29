import { z } from "zod";

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// z.coerce.boolean() can't be used here — it treats the string "false" as truthy.
function parseSecure(raw: string | undefined, isProd: boolean): boolean {
  const value = clean(raw)?.toLowerCase();
  if (value === undefined) return isProd;
  return value === "true" || value === "1" || value === "yes";
}

// Hard-forced false in production regardless of env value: a prod deploy must never mint a session without a real provider.
function parseDevLogin(raw: string | undefined, isProd: boolean): boolean {
  if (isProd) return false;
  const value = clean(raw)?.toLowerCase();
  if (value === undefined) return false;
  return value === "true" || value === "1" || value === "yes";
}

const schema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:4000"),
  SESSION_COOKIE_SECURE: z.boolean(),
  ALLOW_DEV_LOGIN: z.boolean(),
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
    ALLOW_DEV_LOGIN: parseDevLogin(env.ALLOW_DEV_LOGIN, isProd),
    CORS_ORIGIN: clean(env.CORS_ORIGIN),
    SERVE_STATIC_DIR: clean(env.SERVE_STATIC_DIR),
    PORT: clean(env.PORT),
  });

  return Object.freeze(parsed);
}

export const config: Config = loadConfig();

export function appRedirectUri(providerId: string): string {
  return `${config.APP_BASE_URL}/api/auth/${providerId}/callback`;
}
