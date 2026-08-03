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
// Prisma's "record required but not found" error (thrown by findUniqueOrThrow /
// update / delete when the row is gone — e.g. a delete racing a second query
// after an access check). It carries no `.status`, so without this it would fall
// through to 500; semantically it's a 404.
function isPrismaRecordNotFound(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && (err as { code?: unknown }).code === "P2025",
  );
}

// Prisma's unique-constraint violation. Like P2025 it carries no `.status`, so
// without this a duplicate would 500 — and its message embeds the absolute
// server path and the failing query text, which is why the message is replaced
// rather than passed through (#1646 surfaced this on campaign item names).
//
// Matched on the code alone: Prisma 7's driver adapter leaves `meta.target`
// undefined and buries the violated columns under
// meta.driverAdapterError.cause.constraint.fields, quoted inconsistently — a
// meta.target check compiles, reads correctly, and silently never matches.
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
  // If headers were already sent, delegate to Express's default handler, which
  // closes the connection — we can't write a JSON body at this point.
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = statusFromError(err);
  // Prisma's record-not-found message is verbose internal detail; surface a
  // clean "Not found" to the client instead.
  const message = isPrismaRecordNotFound(err)
    ? "Not found"
    : isPrismaUniqueViolation(err)
      ? "That already exists"
      : err instanceof Error
        ? err.message
        : String(err);
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
