import type { SessionUser } from "../lib/auth/session.js";

// Augment Express's Request with the authenticated user that `requireAuth`
// (lib/auth/middleware.ts) attaches after resolving the session cookie. Routes
// mounted behind requireAuth read `req.user` (non-null in practice; typed
// optional because the type system can't see the middleware ordering).
declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export {};
