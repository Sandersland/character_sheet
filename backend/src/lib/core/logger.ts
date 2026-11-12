import pino from "pino";
import { pinoHttp } from "pino-http";

import { config } from "@/lib/core/config.js";

const { isProd, isTest } = config;

export const logger = pino({
  level: config.LOG_LEVEL,
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
