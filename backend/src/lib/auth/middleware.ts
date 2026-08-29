import type { NextFunction, Request, Response } from "express";

import { getCookie } from "./cookies.js";
import { AuthenticationError } from "./errors.js";
import { lookupSession, SESSION_COOKIE } from "./session.js";

// The gate every non-public /api router sits behind — reuses the same session/cookie helpers the auth router uses, so there is one code path for "who is this caller".
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await lookupSession(getCookie(req, SESSION_COOKIE) ?? "");
  if (!user) {
    // Hand the error to Express via next() — a rejected promise here won't reach the terminal error handler.
    next(new AuthenticationError());
    return;
  }
  req.user = user;
  next();
}
