// Every client-facing (4xx) error extends DomainError: errorHandler and runTransaction map any instance straight to its `status`, so a throw site never needs registering anywhere.
// Infra faults that are not the caller's doing (e.g. BlobStoreConfigError) stay plain Error so they surface as 500.
export abstract class DomainError extends Error {
  readonly status: number;

  protected constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class AuthenticationError extends DomainError {
  constructor(message = "Not authenticated") {
    super(message, 401);
  }
}

export class AuthorizationError extends DomainError {
  constructor(message = "Forbidden") {
    super(message, 403);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Not found") {
    super(message, 404);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409);
  }
}
