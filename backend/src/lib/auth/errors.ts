// Auth/authorization HTTP errors. Each carries a numeric `status` that the
// terminal errorHandler (lib/error-handler.ts) maps straight to the response,
// so a route — or a helper like assertCharacterAccess — can just `throw` one
// and get the right status + the standard `{ error }` JSON shape with no
// per-route plumbing.

export class AuthenticationError extends Error {
  readonly status = 401;
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
