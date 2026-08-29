import type { SessionUser } from "@/lib/auth/session.js";

// `req.user` is attached by requireAuth after resolving the session cookie; non-null in practice on routes mounted behind it, but typed optional because the type system can't see the middleware ordering.
declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export {};
