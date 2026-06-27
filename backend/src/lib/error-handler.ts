import type { ErrorRequestHandler } from "express";

import { logger } from "./logger.js";

// Terminal error-handling middleware. Express recognizes a 4-arg middleware as
// an error handler; with `express-async-errors` installed, async throws in any
// route propagate here instead of hanging the request.
//
// Behavior:
//   - Preserves an intentional HTTP status carried on the error (`status` or
//     `statusCode`, 400-599); anything else becomes a 500.
//   - Returns the existing `{ error }` JSON shape every route already uses.
//   - Never leaks stack traces / internal messages to clients on a 500 in
//     production. Intentional 4xx errors keep their message (it's meant for the
//     client); a 500 gets a generic message in prod, the real one in dev.
//   - Logs server-side with the stack via the structured logger.
function statusFromError(err: unknown): number {
  if (err && typeof err === "object") {
    const candidate = (err as { status?: unknown; statusCode?: unknown }).status ??
      (err as { statusCode?: unknown }).statusCode;
    if (typeof candidate === "number" && candidate >= 400 && candidate <= 599) {
      return candidate;
    }
  }
  return 500;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // If headers were already sent, delegate to Express's default handler, which
  // closes the connection — we can't write a JSON body at this point.
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = statusFromError(err);
  const message = err instanceof Error ? err.message : String(err);
  const isProd = process.env.NODE_ENV === "production";

  // Log every unexpected (500) error with its stack, server-side only. Prefer
  // the per-request child logger (carries the request id) when present.
  const log = (req as { log?: typeof logger }).log ?? logger;
  if (status >= 500) {
    log.error({ err, status, method: req.method, path: req.originalUrl }, "Unhandled error");
  } else {
    log.warn({ status, method: req.method, path: req.originalUrl, message }, "Request error");
  }

  // 500s get a generic message in prod (no internal detail leaks); intentional
  // 4xx errors surface their message since it's meant for the caller.
  const body =
    status >= 500 && isProd
      ? { error: "Internal server error" }
      : { error: status >= 500 ? message : message || "Request error" };

  res.status(status).json(body);
};
