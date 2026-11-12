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
  return !isProd && parseFlag(raw);
}

function parseFlag(raw: string | undefined): boolean {
  const value = clean(raw)?.toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

// A malformed or non-positive knob falls back to its default rather than failing boot, matching how the rate limiter has always treated these.
function parsePositiveInt(raw: string | undefined): number | undefined {
  const value = clean(raw);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.number().int().min(1).max(65535).default(4000),
  isProd: z.boolean(),
  isTest: z.boolean(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:4000"),
  SESSION_COOKIE_SECURE: z.boolean(),
  ALLOW_DEV_LOGIN: z.boolean(),
  CORS_ORIGIN: z.string().optional(),
  SERVE_STATIC_DIR: z.string().optional(),
  RATE_LIMIT_DISABLED: z.boolean(),
  RATE_LIMIT_WINDOW_MS: z.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.number().default(600),
  RATE_LIMIT_CREATE_MAX: z.number().default(30),
  BLOB_STORE_DRIVER: z.string().optional(),
  BLOB_FS_DIR: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

// Pure so tests build a config from a plain object instead of mutating process.env or the frozen `config`.
export function parseConfig(env: NodeJS.ProcessEnv): Readonly<Config> {
  const isProd = env.NODE_ENV === "production";
  const isTest = env.NODE_ENV === "test" || env.VITEST === "true";

  const parsed = schema.parse({
    DATABASE_URL: clean(env.DATABASE_URL),
    PORT: clean(env.PORT) === undefined ? undefined : Number(clean(env.PORT)),
    isProd,
    isTest,
    LOG_LEVEL: clean(env.LOG_LEVEL) ?? (isTest ? "silent" : "info"),
    GOOGLE_CLIENT_ID: clean(env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: clean(env.GOOGLE_CLIENT_SECRET),
    APP_BASE_URL: clean(env.APP_BASE_URL),
    SESSION_COOKIE_SECURE: parseSecure(env.SESSION_COOKIE_SECURE, isProd),
    ALLOW_DEV_LOGIN: parseDevLogin(env.ALLOW_DEV_LOGIN, isProd),
    CORS_ORIGIN: clean(env.CORS_ORIGIN),
    SERVE_STATIC_DIR: clean(env.SERVE_STATIC_DIR),
    RATE_LIMIT_DISABLED: clean(env.RATE_LIMIT_DISABLED) === "true",
    RATE_LIMIT_WINDOW_MS: parsePositiveInt(env.RATE_LIMIT_WINDOW_MS),
    RATE_LIMIT_MAX: parsePositiveInt(env.RATE_LIMIT_MAX),
    RATE_LIMIT_CREATE_MAX: parsePositiveInt(env.RATE_LIMIT_CREATE_MAX),
    BLOB_STORE_DRIVER: clean(env.BLOB_STORE_DRIVER),
    BLOB_FS_DIR: clean(env.BLOB_FS_DIR),
    S3_ENDPOINT: clean(env.S3_ENDPOINT),
    S3_BUCKET: clean(env.S3_BUCKET),
    S3_REGION: clean(env.S3_REGION),
    S3_ACCESS_KEY_ID: clean(env.S3_ACCESS_KEY_ID),
    S3_SECRET_ACCESS_KEY: clean(env.S3_SECRET_ACCESS_KEY),
    S3_FORCE_PATH_STYLE: clean(env.S3_FORCE_PATH_STYLE),
  });

  return Object.freeze(parsed);
}

export const config: Readonly<Config> = parseConfig(process.env);

export function appRedirectUri(providerId: string): string {
  return `${config.APP_BASE_URL}/api/auth/${providerId}/callback`;
}
