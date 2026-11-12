import { pinoHttp } from "pino-http";

import { config } from "@/lib/core/config.js";
import { logger } from "@/lib/core/logger.js";

export const httpLogger = pinoHttp({
  logger,
  autoLogging: !config.isTest,
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
});
