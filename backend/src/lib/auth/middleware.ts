import type { NextFunction, Request, Response } from "express";

import { getCookie } from "./cookies.js";
import { AuthenticationError } from "./errors.js";
import { lookupSession, SESSION_COOKIE } from "./session.js";

// requireAuth — the gate every non-public /api router sits behind (mounted in
// app.ts after the health + auth routers). Resolves the opaque session cookie to
// its user and attaches it as req.user; a missing/expired/unknown session is a
// 401. Reuses the same session/cookie helpers the auth router uses, so there is
// one code path for "who is this caller".
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await lookupSession(getCookie(req, SESSION_COOKIE) ?? "");
  if (!user) {
    // async middleware — hand the error to Express via next() rather than throw
    // (a rejected promise here won't reach the terminal error handler).
    next(new AuthenticationError());
    return;
  }
  req.user = user;
  next();
}
