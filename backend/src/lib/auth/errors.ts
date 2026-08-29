// Each carries a numeric `status` that errorHandler maps straight to the response, so a route can just `throw` one and get the right status + the standard `{ error }` JSON shape.

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
