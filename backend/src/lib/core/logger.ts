import pino from "pino";
import { pinoHttp } from "pino-http";

// Structured logging for the backend. JSON in production (machine-parseable for
// hosted log aggregation); pretty-printed in local dev. Silent under test so the
// vitest output stays clean. Level is env-controlled via LOG_LEVEL.
//
// Detect the runtime mode from NODE_ENV (vitest sets it to "test"; the prod
// image sets it to "production"). VITEST is a belt-and-suspenders check so tests
// stay quiet even if NODE_ENV is overridden.
const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

const level = process.env.LOG_LEVEL ?? (isTest ? "silent" : "info");

export const logger = pino({
  level,
  // Pretty transport only in interactive dev — never in prod (we want raw JSON)
  // and never under test (the worker thread it spawns is pure overhead when
  // output is silenced anyway).
  ...(isProd || isTest
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
        },
      }),
  // Never serialize secrets or full payloads. We log request metadata only;
  // redact common credential-bearing fields defensively in case a child logger
  // is ever given a richer object.
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "password", "passwordHash"],
    remove: true,
  },
});

// Per-request logging middleware: method, path, status, latency, and a generated
// request id (auto-attached as req.id). Mounted high in the stack so every
// request — including 404s and errors — is recorded once.
export const httpLogger = pinoHttp({
  logger,
  // Quiet the per-request line under test; the base logger is already silent,
  // but this also avoids attaching noisy completion logs to supertest calls.
  autoLogging: !isTest,
  // Demote expected client errors (4xx) to warn and keep 5xx at error so alerts
  // can key off level rather than parsing the status.
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
});
