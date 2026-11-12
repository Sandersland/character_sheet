import pino from "pino";

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
