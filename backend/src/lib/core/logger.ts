import pino from "pino";
import { pinoHttp } from "pino-http";

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

const level = process.env.LOG_LEVEL ?? (isTest ? "silent" : "info");

export const logger = pino({
  level,
  ...(isProd || isTest
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
        },
      }),
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "password", "passwordHash"],
    remove: true,
  },
});

export const httpLogger = pinoHttp({
  logger,
  autoLogging: !isTest,
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
});
