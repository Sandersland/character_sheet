import type { ErrorRequestHandler } from "express";

import { logger } from "./logger.js";

// Express recognizes a 4-arg middleware as an error handler; with express-async-errors installed, async throws in any route land here.
function isPrismaRecordNotFound(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && (err as { code?: unknown }).code === "P2025",
  );
}

// Matched on the P2002 code alone, not meta.target: Prisma 7's driver adapter leaves meta.target undefined and buries the violated columns elsewhere (#1646).
function isPrismaUniqueViolation(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && (err as { code?: unknown }).code === "P2002",
  );
}

function statusFromError(err: unknown): number {
  if (isPrismaRecordNotFound(err)) return 404;
  if (isPrismaUniqueViolation(err)) return 409;
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
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = statusFromError(err);
  const message = isPrismaRecordNotFound(err)
    ? "Not found"
    : isPrismaUniqueViolation(err)
      ? "That already exists"
      : err instanceof Error
        ? err.message
        : String(err);
  const isProd = process.env.NODE_ENV === "production";

  const log = (req as { log?: typeof logger }).log ?? logger;
  if (status >= 500) {
    log.error({ err, status, method: req.method, path: req.originalUrl }, "Unhandled error");
  } else {
    log.warn({ status, method: req.method, path: req.originalUrl, message }, "Request error");
  }

  const body =
    status >= 500 && isProd
      ? { error: "Internal server error" }
      : { error: status >= 500 ? message : message || "Request error" };

  res.status(status).json(body);
};
